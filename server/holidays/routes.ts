import type {Express} from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHolidayReader,validDate} from './calendar';
export function mountHolidayRoutes(app:Express,emulator:boolean){
 let reader:ReturnType<typeof createHolidayReader>|null=null;
 app.get('/api/holidays/:date',async(req,res)=>{
  res.set('Cache-Control','private, max-age=300');
  if(process.env.HOLIDAY_CALENDAR_ENABLED!=='true'||(!emulator&&!process.env.PREVIEW_ACCESS_PASSWORD))return res.status(503).json({status:'disabled'});
  const date=String(req.params.date);
  if(!validDate(date))return res.status(400).json({error:'日期无效'});
  try{
   const region=process.env.HOLIDAY_REGION,dir=process.env.HOLIDAY_CALENDAR_DIR;
   if(!region||!dir)return res.status(503).json({status:'unavailable'});
   reader ||= createHolidayReader(async year=>JSON.parse(await fs.readFile(path.join(dir,`${region}-${year}.json`),'utf8')),region);
   return res.json(await reader(date));
  }catch{return res.status(503).json({status:'unavailable'});}
 });
}
