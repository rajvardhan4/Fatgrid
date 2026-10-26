import {api} from './api';
import {ApiError,limits,type Env} from './auth';
import {providerStatus} from './providers';
import {getMySQLDatabase as getRemoteDatabase,mysqlConfigured as remoteDatabaseConfigured} from './mysql-db';
import {safeNodeFetch} from './node-fetch';
import {databaseError} from './database-error';
export async function vercelApi(request:Request,env:Env=process.env){
 const headers=new Headers(request.headers);for(const key of [...headers.keys()])if(key.startsWith('oai-'))headers.delete(key);
 const url=new URL(request.url),runtime:Env={...env,AUTH_MODE:'local',PRIVATE_SCHEDULER:'',SCHEDULER_AVAILABLE:env.CRON_SECRET?'1':'0',APP_ORIGIN:env.APP_ORIGIN||url.origin};
 if(!remoteDatabaseConfigured(runtime)&&url.pathname.replace(/\/$/,'')==='/api/session'&&request.method==='GET')return Response.json({user:null,authMode:'local',providers:providerStatus(runtime),limits:limits.start,databaseConfigured:false,setupRequired:'Cloud database is not connected. Configure MYSQL_URL in Vercel, then redeploy.'},{headers:{'Cache-Control':'no-store'}});
 try{const db=await getRemoteDatabase(runtime);return await api(new Request(request,{headers}),db,runtime,safeNodeFetch)}
 catch(e){const known=e instanceof ApiError,detail=known?{error:e.message,code:e.code}:databaseError(e);console.error('Vercel API initialization failed:',detail);return Response.json(detail,{status:known?e.status:503,headers:{'Cache-Control':'no-store'}})}
}
