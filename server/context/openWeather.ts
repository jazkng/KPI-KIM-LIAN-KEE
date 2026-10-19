type ForecastRow={dt:number;main?:{temp:number};weather?:{id:number}[];rain?:{'3h':number};snow?:{'3h':number};components?:{pm2_5:number;pm10:number}};
function pointTime(date:string,hour:number){return Date.parse(`${date}T${String(hour).padStart(2,'0')}:00:00+08:00`)/1000;}
function finite(v:unknown):number{if(typeof v!=='number'||!Number.isFinite(v))throw new Error('INCOMPLETE_FORECAST');return v;}
function rows(data:unknown):ForecastRow[]{const list=(data as {list?:ForecastRow[]})?.list;if(!Array.isArray(list)||list.length<2)throw new Error('INCOMPLETE_FORECAST');if(list.some(r=>!r||!Number.isInteger(r.dt)))throw new Error('INVALID_FORECAST');return [...list].sort((a,b)=>a.dt-b.dt);}
function code(id:number){if(!Number.isInteger(id))throw new Error('INVALID_WEATHER_CODE');if(id>=200&&id<300)return 95;if(id>=300&&id<400)return 51;if(id>=500&&id<600)return 61;if(id>=600&&id<700)return 71;if(id>=700&&id<800)return 45;if(id===800)return 0;if(id===801)return 1;if(id>=802&&id<=804)return 3;throw new Error('INVALID_WEATHER_CODE');}
export function normalizeOpenWeather(data:unknown,date:string){
 const list=rows(data),time:string[]=[],temperature_2m:number[]=[],precipitation:number[]=[],weather_code:number[]=[];
 for(const h of [16,17,18,19,20,21]){
  const t=pointTime(date,h),right=list.findIndex(r=>r.dt>=t);if(right<0)throw new Error('INCOMPLETE_FORECAST');
  const b=list[right],a=list[Math.max(0,right-1)];
  if(right===0 ? b.dt<t||b.dt-t>3600 : a.dt>t||b.dt-a.dt!==10800)throw new Error('INCOMPLETE_FORECAST');
  const w=right===0?1:(t-a.dt)/(b.dt-a.dt),temp=finite(a.main?.temp)*(1-w)+finite(b.main?.temp)*w;
  const rain=b.rain===undefined?0:finite(b.rain['3h']),snow=b.snow===undefined?0:finite(b.snow['3h']);if(rain<0||snow<0)throw new Error('INVALID_FORECAST');
  time.push(`${date}T${h}:00`);temperature_2m.push(temp);precipitation.push((rain+snow)/3);weather_code.push(code(finite(b.weather?.[0]?.id)));
 }
 return {time,temperature_2m,precipitation,weather_code};
}
export function normalizeOpenWeatherAir(data:unknown,date:string){
 const list=rows(data),time:string[]=[],pm2_5:number[]=[],pm10:number[]=[];
 for(const h of [16,17,18,19,20,21]){const r=list.find(r=>r.dt===pointTime(date,h));if(!r)throw new Error('INCOMPLETE_FORECAST');time.push(`${date}T${h}:00`);pm2_5.push(finite(r.components?.pm2_5));pm10.push(finite(r.components?.pm10));}
 return {time,pm2_5,pm10};
}
