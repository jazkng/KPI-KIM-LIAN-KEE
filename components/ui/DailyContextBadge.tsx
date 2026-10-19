import { useEffect, useState } from 'react';
import type { DailyContext } from '../../shared/dailyContext';
export function DailyContextBadge({date}:{date:string}) {
  const [result,setResult]=useState<{date:string;data:DailyContext|null;status:string}|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    if(import.meta.env.VITE_DAILY_CONTEXT_ENABLED!=='true')return ()=>controller.abort();
    fetch(`/api/context/${encodeURIComponent(date)}`,{signal:controller.signal,credentials:'same-origin'})
      .then(async r=>{if(!r.ok)throw new Error('UNAVAILABLE');return r.json();})
      .then(r=>setResult({date,data:r.data||null,status:r.status}))
      .catch(()=>{if(!controller.signal.aborted)setResult({date,data:null,status:'unavailable'});});
    return ()=>controller.abort();
  },[date]);
  if(import.meta.env.VITE_DAILY_CONTEXT_ENABLED!=='true')return null;
  const data=result?.date===date?result.data:null;
  return <><details className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-stone-700">
    <summary className="cursor-pointer font-semibold">16:30–21:00 预报 · {data?.weather?.label||'天气待同步'} · {data?.air?`PM2.5 ${data.air.pm25Mean} μg/m³`:'空气质量待同步'} · {data?.holidays.status==='ready'?(data.holidays.names.join('、')||'无已登记节日'):'节日待同步'}</summary>
    {data?<div className="mt-2 space-y-1"><p>同步时间：{new Date(data.fetchedAt).toLocaleString('zh-CN',{timeZone:'Asia/Kuala_Lumpur',hour12:false})}（马来西亚）</p>
      {data.weather&&<p>预报温度 {data.weather.minC}–{data.weather.maxC}°C；降水约 {data.weather.rainMm} mm。</p>}
      <p>天气原始3小时预报，空气质量原始小时预报；温度取邻近预报点或插值，降水按时段均匀分配，不代表全天实测。</p><p>{data.attribution}</p>
      {data.holidays.sourceUrl&&<a href={data.holidays.sourceUrl} target="_blank" rel="noreferrer">节日日历来源</a>}
      {data.issues.map(v=><p key={v}>{v}</p>)}
    </div>:<p className="mt-2">每天15:00由后台同步，无需手动操作；尚无该日记录或同步未完成。</p>}
  </details><p className="mt-1 text-[10px] text-stone-500"><a href="https://openweathermap.org/" target="_blank" rel="noreferrer">Weather data © OpenWeather</a></p></>;
}
