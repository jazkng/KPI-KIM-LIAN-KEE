import { normalizeOpenWeather, normalizeOpenWeatherAir } from './openWeather';
import { summarizeAir, summarizeWeather } from './policy';
import type { DailyContext } from '../../shared/dailyContext';
export interface ForecastConfig { latitude:number;longitude:number;key:string; }
export function forecastConfig(env: NodeJS.ProcessEnv): ForecastConfig {
  const latitude=Number(env.CONTEXT_LATITUDE),longitude=Number(env.CONTEXT_LONGITUDE),key=env.CONTEXT_OPENWEATHER_KEY||'';
  if(!env.CONTEXT_LATITUDE||!env.CONTEXT_LONGITUDE||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180||!key) throw new Error('CONTEXT_CONFIG_REQUIRED');
  return {latitude,longitude,key};
}
export function forecastUrl(kind:'weather'|'air',_date:string,c:ForecastConfig) {
  const url=new URL(kind==='weather'?'https://api.openweathermap.org/data/2.5/forecast':'https://api.openweathermap.org/data/2.5/air_pollution/forecast');
  for(const [k,v] of Object.entries({lat:String(c.latitude),lon:String(c.longitude),appid:c.key,...(kind==='weather'?{units:'metric'}:{})}))url.searchParams.set(k,v);
  return url;
}
export async function fetchForecasts(date:string,c:ForecastConfig,fetcher:typeof fetch=fetch) {
  const issues:string[]=[];
  async function get(kind:'weather'|'air') {
    try {const response=await fetcher(forecastUrl(kind,date,c),{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('UPSTREAM');const data=await response.json();return kind==='weather'?summarizeWeather(normalizeOpenWeather(data,date),date):summarizeAir(normalizeOpenWeatherAir(data,date),date);}
    catch {issues.push(kind==='weather'?'天气预报暂缺':'空气质量预报暂缺');return null;}
  }
  const [weather,air]=await Promise.all([get('weather'),get('air')]);
  return {weather:weather as DailyContext['weather'],air:air as DailyContext['air'],issues};
}
