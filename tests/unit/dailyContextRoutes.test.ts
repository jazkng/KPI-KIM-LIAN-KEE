import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Express,Request,Response} from 'express';
import {OAuth2Client} from 'google-auth-library';
import {isContextJob,mountContextRoutes} from '../../server/context/routes';
const mocks=vi.hoisted(()=>({init:vi.fn(),get:vi.fn(async()=>null),run:vi.fn(async()=>({status:'saved'}))}));
vi.mock('../../server/firebaseAdmin',()=>({initFirebaseAdmin:mocks.init}));
vi.mock('../../server/context/service',()=>({firestoreContextStore:()=>({get:mocks.get}),runDailyContext:mocks.run}));
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();vi.clearAllMocks();});
function routes(){const handlers=new Map<string,(req:Request,res:Response)=>Promise<unknown>>();const app={get:(p:string,h:never)=>handlers.set(`GET ${p}`,h),post:(p:string,h:never)=>handlers.set(`POST ${p}`,h)};mountContextRoutes(app as unknown as Express,false);return handlers;}
function response(){return {status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis(),set:vi.fn().mockReturnThis()};}
function enabled(){vi.stubEnv('DAILY_CONTEXT_ENABLED','true');vi.stubEnv('PREVIEW_ACCESS_PASSWORD','test-only');vi.stubEnv('CONTEXT_SYNC_AUDIENCE','https://dev.kimliankee.app/api/context/sync');vi.stubEnv('CONTEXT_SCHEDULER_SA','scheduler@example.test');}
describe('context route guards',()=>{
 it('only exempts exact POST and never when disabled',()=>{enabled();expect(isContextJob({method:'POST',path:'/api/context/sync'} as Request,false)).toBe(true);expect(isContextJob({method:'GET',path:'/api/context/sync'} as Request,false)).toBe(false);expect(isContextJob({method:'POST',path:'/api/context/other'} as Request,false)).toBe(false);vi.stubEnv('DAILY_CONTEXT_ENABLED','false');expect(isContextJob({method:'POST',path:'/api/context/sync'} as Request,false)).toBe(false);});
 it('rejects unauthenticated sync before database init',async()=>{enabled();const r=response();await routes().get('POST /api/context/sync')!({headers:{}} as Request,r as unknown as Response);expect(r.status).toHaveBeenCalledWith(401);expect(mocks.init).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();});
 it('rejects the wrong verified service account',async()=>{enabled();vi.spyOn(OAuth2Client.prototype,'verifyIdToken').mockResolvedValue({getPayload:()=>({email_verified:true,email:'other@example.test'})} as never);const r=response();await routes().get('POST /api/context/sync')!({headers:{authorization:'Bearer test'}} as Request,r as unknown as Response);expect(r.status).toHaveBeenCalledWith(403);expect(mocks.run).not.toHaveBeenCalled();});
 it('verifies audience and accepts only configured verified identity',async()=>{enabled();const verify=vi.spyOn(OAuth2Client.prototype,'verifyIdToken').mockResolvedValue({getPayload:()=>({email_verified:true,email:'scheduler@example.test'})} as never);const r=response();await routes().get('POST /api/context/sync')!({headers:{authorization:'Bearer test'}} as Request,r as unknown as Response);expect(verify).toHaveBeenCalledWith({idToken:'test',audience:'https://dev.kimliankee.app/api/context/sync'});expect(mocks.run).toHaveBeenCalledTimes(1);});
 it('does not initialise or call providers when feature is off',async()=>{vi.stubEnv('DAILY_CONTEXT_ENABLED','false');const r=response();await routes().get('GET /api/context/:date')!({params:{date:'2026-10-19'}} as unknown as Request,r as unknown as Response);expect(r.status).toHaveBeenCalledWith(503);expect(mocks.init).not.toHaveBeenCalled();});
 it('reading a date never starts a sync or writes data',async()=>{enabled();await routes().get('GET /api/context/:date')!({params:{date:'2026-10-19'}} as unknown as Request,response() as unknown as Response);expect(mocks.get).toHaveBeenCalledWith('2026-10-19');expect(mocks.run).not.toHaveBeenCalled();});
});
