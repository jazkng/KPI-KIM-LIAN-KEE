import type { CalendarYear, DailyContext } from '../../shared/dailyContext';
export function malaysiaClock(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const p = Object.fromEntries(parts.map(v=>[v.type,v.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,minutes:Number(p.hour)*60+Number(p.minute)};
}
export const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
export function validateCalendar(value: unknown, year: number, region: string): CalendarYear {
  const v = value as CalendarYear;
  if (!v || v.year!==year || v.region!==region || !/^https:\/\//.test(v.sourceUrl||'') || !validDate(v.reviewedAt) || !Array.isArray(v.days)) throw new Error('INVALID_CALENDAR');
  if(v.days.some(d=>!validDate(d.date)||!d.date.startsWith(`${year}-`)||typeof d.name!=='string'||!d.name.trim()||d.name.length>120||!['public','school','festival'].includes(d.kind))) throw new Error('INVALID_CALENDAR');
  return v;
}
export function holidaySummary(calendar: CalendarYear | null,date: string): DailyContext['holidays'] {
  return calendar ? {status:'ready',names:calendar.days.filter(d=>d.date===date).map(d=>d.name),sourceUrl:calendar.sourceUrl} : {status:'unavailable',names:[],sourceUrl:null};
}
interface Hourly {time: string[];[variable: string]: unknown;}
function numbers(h: Hourly, key: string, date: string): number[] {
  if(!h || !Array.isArray(h.time) || !Array.isArray(h[key])) throw new Error('INCOMPLETE_FORECAST');
  return [16,17,18,19,20,21].map(hour=>{
    const i=h.time.indexOf(`${date}T${hour}:00`),v=(h[key] as unknown[])[i];
    if(typeof v!=='number'||!Number.isFinite(v)) throw new Error('INCOMPLETE_FORECAST');
    return v;
  });
}
const round=(n:number)=>Math.round(n*100)/100;
export function summarizeWeather(h: Hourly,date: string): NonNullable<DailyContext['weather']> {
  const t=numbers(h,'temperature_2m',date),r=numbers(h,'precipitation',date),c=numbers(h,'weather_code',date);
  if(r.some(n=>n<0)||c.some(n=>!Number.isInteger(n)||n<0||n>99)) throw new Error('INVALID_FORECAST');
  const rain=r[1]*0.5+r.slice(2).reduce((a,b)=>a+b,0),temps=[(t[0]+t[1])/2,...t.slice(1)];
  const label=c.slice(1).some(n=>n>=95)?'可能雷雨':rain>0?'可能有雨':c.slice(1).some(n=>n>=2)?'多云':'晴';
  return {label,rainMm:round(rain),minC:round(Math.min(...temps)),maxC:round(Math.max(...temps))};
}
export function summarizeAir(h: Hourly,date: string): NonNullable<DailyContext['air']> {
  const pm=numbers(h,'pm2_5',date),pm10=numbers(h,'pm10',date);
  if([...pm,...pm10].some(n=>n<0)) throw new Error('INVALID_FORECAST');
  const window=(v:number[])=>[(v[0]+v[1])/2,...v.slice(1)];
  const mean=(v:number[])=>{const p=window(v);return round(((p[0]+p[1])*0.25+p.slice(1,-1).reduce((s,n,i)=>s+(n+p[i+2])*0.5,0))/4.5);};
  return {pm25Mean:mean(pm),pm25Max:round(Math.max(...window(pm))),pm10Mean:mean(pm10)};
}
