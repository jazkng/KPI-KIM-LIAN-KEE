import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs/promises';
import path from 'node:path';
import { adminApp } from '../firebaseAdmin';
import type { CalendarYear, DailyContext } from '../../shared/dailyContext';
import { forecastConfig, fetchForecasts } from './provider';
import { holidaySummary, malaysiaClock, validateCalendar } from './policy';
export interface ContextStore {
  claim(date:string,at:string):Promise<boolean>;
  get(date:string):Promise<DailyContext|null>;
  save(date:string,data:DailyContext):Promise<void>;
  calendar(year:number):Promise<CalendarYear|null>;
  saveCalendar(data:CalendarYear):Promise<void>;
}
export function firestoreContextStore(region:string):ContextStore {
  const db=getFirestore(adminApp()),daily=db.collection('v2DailyContext'),years=db.collection('v2ContextCalendars');
  return {
    claim:async(date,at)=>db.runTransaction(async tx=>{const ref=daily.doc(date),doc=await tx.get(ref);if(doc.exists)return false;tx.create(ref,{state:'running',date,claimedAt:at});return true;}),
    get:async date=>{const doc=await daily.doc(date).get();return doc.data()?.snapshot||null;},
    save:async(date,data)=>{await daily.doc(date).set({state:'finished',snapshot:data},{merge:true});},
    calendar:async year=>{const doc=await years.doc(`${region}-${year}`).get();return doc.exists?validateCalendar(doc.data()?.calendar,year,region):null;},
    saveCalendar:async data=>{await years.doc(`${region}-${data.year}`).create({calendar:data});},
  };
}
export async function runDailyContext(store:ContextStore,now=new Date(),env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch) {
  const {date,minutes}=malaysiaClock(now);
  if(minutes<900||minutes>=990)return {status:'outside-sync-window' as const};
  const config=forecastConfig(env),region=env.CONTEXT_REGION;
  if(!region||!/^MY-\d{2}$/.test(region))throw new Error('CONTEXT_CONFIG_REQUIRED');
  if(!await store.claim(date,now.toISOString()))return {status:'already-claimed' as const};
  let calendar:CalendarYear|null=null;
  try {
    calendar=await store.calendar(Number(date.slice(0,4)));
    if(!calendar&&env.CONTEXT_CALENDAR_DIR){
      const file=path.join(env.CONTEXT_CALENDAR_DIR,`${region}-${date.slice(0,4)}.json`);
      calendar=validateCalendar(JSON.parse(await fs.readFile(file,'utf8')),Number(date.slice(0,4)),region);
      await store.saveCalendar(calendar);
    }
  }catch {calendar=null;}
  const data=await fetchForecasts(date,config,fetcher);
  const snapshot:DailyContext={date,fetchedAt:now.toISOString(),timezone:'Asia/Kuala_Lumpur',window:{start:'16:30',end:'21:00'},kind:'forecast',...data,holidays:holidaySummary(calendar,date),attribution:'天气：Open-Meteo；空气质量：CAMS / Open-Meteo（模型预报，非环境局实测API）'};
  if(!calendar)snapshot.issues.push('全年节日日历未就绪');
  await store.save(date,snapshot);
  return {status:'saved' as const,date,partial:snapshot.issues.length>0};
}
