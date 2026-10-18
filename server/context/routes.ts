import type { Express, Request } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { initFirebaseAdmin } from '../firebaseAdmin';
import { firestoreContextStore, runDailyContext } from './service';
import { validDate } from './policy';
export const contextAvailable=(emulator:boolean)=>process.env.DAILY_CONTEXT_ENABLED==='true'&&(emulator||!!process.env.PREVIEW_ACCESS_PASSWORD);
export const isContextJob=(req:Request,emulator:boolean)=>contextAvailable(emulator)&&req.method==='POST'&&req.path==='/api/context/sync';
export function mountContextRoutes(app:Express,emulator:boolean) {
  const oidc=new OAuth2Client();
  const store=()=>{initFirebaseAdmin(emulator);return firestoreContextStore(process.env.CONTEXT_REGION||'');};
  app.get('/api/context/:date',async(req,res)=>{
    res.set('Cache-Control','private, max-age=300');
    if(!contextAvailable(emulator))return res.status(503).json({status:'disabled'});
    if(!validDate(String(req.params.date)))return res.status(400).json({error:'日期无效'});
    try {const data=await store().get(String(req.params.date));return res.json({status:data?'ready':'pending',data});}
    catch {return res.status(503).json({status:'unavailable'});}
  });
  app.post('/api/context/sync',async(req,res)=>{
    if(!contextAvailable(emulator))return res.status(503).json({status:'disabled'});
    if(!emulator){
      const audience=process.env.CONTEXT_SYNC_AUDIENCE,email=process.env.CONTEXT_SCHEDULER_SA;
      if(!audience||!email)return res.status(503).json({error:'定时任务未配置'});
      const header=String(req.headers.authorization||'');
      if(!header.startsWith('Bearer '))return res.status(401).json({error:'需要身份验证'});
      try {const ticket=await oidc.verifyIdToken({idToken:header.slice(7),audience}),p=ticket.getPayload();if(!p?.email_verified||p.email!==email)return res.status(403).json({error:'身份不符'});}
      catch{return res.status(401).json({error:'身份验证失败'});}
    }
    try {return res.json(await runDailyContext(store()));}
    catch{return res.status(503).json({error:'同步未完成，请检查服务端配置与任务状态'});}
  });
}
