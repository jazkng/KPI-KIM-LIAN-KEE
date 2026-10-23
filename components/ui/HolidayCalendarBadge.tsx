import {useEffect,useState} from 'react';
import type {HolidaySummary} from '../../shared/holidayCalendar';
export function HolidayCalendarBadge({date}:{date:string}){
 const [result,setResult]=useState<HolidaySummary|null>(null);
 useEffect(()=>{
  const controller=new AbortController();
  if(import.meta.env.VITE_HOLIDAY_CALENDAR_ENABLED!=='true')return ()=>controller.abort();
  fetch(`/api/holidays/${encodeURIComponent(date)}`,{credentials:'same-origin',signal:controller.signal})
   .then(async r=>{if(!r.ok)throw new Error('UNAVAILABLE');return r.json();})
   .then(r=>setResult({...r,date}))
   .catch(()=>{if(!controller.signal.aborted)setResult({date,status:'unavailable',names:[],sourceUrl:null,reviewedAt:null});});
  return ()=>controller.abort();
 },[date]);
 if(import.meta.env.VITE_HOLIDAY_CALENDAR_ENABLED!=='true')return null;
 const data=result?.date===date?result:null;
 return <details className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-stone-700"><summary className="cursor-pointer font-semibold">假日 · {data?.status==='ready'?(data.names.join('、')||'无已登记节日'):'全年日历待导入'}</summary><p className="mt-2">按已核对的全年日历匹配日期；天气及空气情况由人手记录。</p>{data?.sourceUrl&&<a href={data.sourceUrl} target="_blank" rel="noreferrer">日历来源 · 核对日期 {data.reviewedAt}</a>}</details>;
}
