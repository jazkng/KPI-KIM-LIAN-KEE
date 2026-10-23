import type { CalendarYear,HolidaySummary } from '../../shared/holidayCalendar';
export const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
export function validateCalendar(value:unknown,year:number,region:string):CalendarYear {
 const v=value as CalendarYear;
 if(!v||v.year!==year||v.region!==region||!/^https:\/\//.test(v.sourceUrl||'')||!validDate(v.reviewedAt)||!Array.isArray(v.days)||v.days.length===0)throw new Error('INVALID_CALENDAR');
 if(v.days.some(d=>!d||!validDate(d.date)||!d.date.startsWith(`${year}-`)||typeof d.name!=='string'||!d.name.trim()||d.name.length>120||!['public','school','festival'].includes(d.kind)))throw new Error('INVALID_CALENDAR');
 return v;
}
export function createHolidayReader(readYear:(year:number)=>Promise<unknown>,region:string) {
 if(!/^MY-\d{2}$/.test(region))throw new Error('INVALID_REGION');
 const years=new Map<number,Promise<CalendarYear>>();
 return async(date:string):Promise<HolidaySummary>=>{
  if(!validDate(date))throw new Error('INVALID_DATE');
  const year=Number(date.slice(0,4));
  try{
   if(!years.has(year))years.set(year,readYear(year).then(v=>validateCalendar(v,year,region)).catch(e=>{years.delete(year);throw e;}));
   const calendar=await years.get(year)!;
   return {date,status:'ready',names:calendar.days.filter(d=>d.date===date).map(d=>d.name),sourceUrl:calendar.sourceUrl,reviewedAt:calendar.reviewedAt};
  }catch{return {date,status:'unavailable',names:[],sourceUrl:null,reviewedAt:null};}
 };
}
