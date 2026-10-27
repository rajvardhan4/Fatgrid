import {z} from 'zod';
import {ApiError,id,now,month,limits,type Env} from './auth';
import type {Database,Row} from './db';
import {normalizeDomain} from '../shared/domain';
import {inspectBacklink,publicURL,readLimited,type PublicFetch} from './providers';
import {reserve,finish,refund,projectAccess} from './api';
import {emailConfigured,sendEmail} from './email';

// Email the owner when a link that was live in the previous run is no longer live.
export async function alertLostLinks(db:Database,env:Env,g:Row,previous:Row[],current:Row[]){
 if(!emailConfigured(env))return 0;
 const before=new Map<string,string>(previous.flatMap(r=>(r.links||[]).map((l:Row)=>[r.source+' '+l.target,l.status] as [string,string])));
 const lost=current.flatMap(r=>r.error?[...before].filter(([key,status])=>status==='live'&&key.startsWith(r.source+' ')).map(([key])=>({source:r.source,target:key.slice(r.source.length+1),status:'page unreachable'})):(r.links||[]).filter((l:Row)=>before.get(r.source+' '+l.target)==='live'&&l.status!=='live').map((l:Row)=>({source:r.source,target:l.target,status:l.status})));
 if(!lost.length)return 0;
 const pref=await db.first("SELECT value FROM preferences WHERE user_id=? AND key='emailAlerts'",[g.user_id]);if(pref&&JSON.parse(pref.value)===false)return 0;
 const owner=await db.first('SELECT email FROM users WHERE id=?',[g.user_id]);if(!owner)return 0;
 await sendEmail(env,owner.email,`Backlink alert: ${lost.length} link${lost.length>1?'s':''} changed in "${g.name}"`,`These links were live in the previous check and are not live now:\n\n${lost.slice(0,50).map(l=>`- ${l.source} → ${l.target}: ${l.status}`).join('\n')}${lost.length>50?`\n…and ${lost.length-50} more`:''}\n\nOpen the check: ${env.APP_ORIGIN||''}/backlinks-monitoring/\n\nTurn these emails off in Account settings.`);
 return lost.length;
}

async function start(db:Database,g:Row,user:Row){
 if(['running','processing'].includes(g.status))throw new ApiError(409,'This check is already running.');
 const sources=JSON.parse(g.sources),job=await reserve(db,user,'monitor-group',g.name,sources.length);
 const changed=await db.run("UPDATE monitor_groups SET job_id=?,result='[]',status='running',last_checked=? WHERE id=? AND status NOT IN ('running','processing')",[job,now(),g.id]);
 if(!changed){await refund(db,job,'Another run already started.');throw new ApiError(409,'This check is already running.');}
 return job;
}
export async function processGroup(db:Database,groupId:string,safeFetch:PublicFetch,env?:Env){
 const claimed=await db.run("UPDATE monitor_groups SET status='processing',last_checked=? WHERE id=? AND status='running'",[now(),groupId]);if(!claimed)return;
 const g=(await db.first('SELECT * FROM monitor_groups WHERE id=?',[groupId]))!;
 const job=await db.first('SELECT * FROM jobs WHERE id=?',[g.job_id]);
 if(job?.status!=='running'){await db.run("UPDATE monitor_groups SET status='failed' WHERE id=?",[g.id]);return;}
 const sources:string[]=JSON.parse(g.sources),targets:string[]=JSON.parse(g.targets),results:Row[]=JSON.parse(g.result||'[]');
 try{
  // A durable checkpoint after each page makes large lists resumable without charging again.
  for(const source of sources.slice(results.length,results.length+3)){
   try{
    const cache=new Map<string,{body:string,status:number,headers:Headers}>();
    const fetchOnce:PublicFetch=async url=>{let saved=cache.get(url);if(!saved){const response=await safeFetch(url);saved={body:await readLimited(response),status:response.status,headers:response.headers};cache.set(url,saved)}return new Response([204,205,304].includes(saved.status)?null:saved.body,{status:saved.status,headers:saved.headers})};
    const links:Row[]=[];for(const target of targets)links.push({target,...await inspectBacklink(source,target,fetchOnce)});
    results.push({source,links});
   }catch(e){results.push({source,links:[],error:e instanceof ApiError?e.message:'Page could not be fetched.'});}
   await db.run('UPDATE monitor_groups SET result=?,last_checked=? WHERE id=?',[JSON.stringify(results),now(),g.id]);
  }
  if(results.length===sources.length){
   const failed=results.filter(r=>r.error).length;await finish(db,g.job_id,{rows:results},failed);
   const previous=await db.first('SELECT result FROM monitor_group_history WHERE group_id=? ORDER BY created_at DESC LIMIT 1',[g.id]);
   await db.batch([{sql:"UPDATE monitor_groups SET status=?,last_checked=?,next_check=? WHERE id=?",args:[failed===sources.length?'failed':'completed',now(),g.interval_hours?new Date(Date.now()+g.interval_hours*3600000).toISOString():null,g.id]},{sql:'INSERT INTO monitor_group_history (id,group_id,result,created_at) VALUES (?,?,?,?)',args:[id(),g.id,JSON.stringify(results),now()]}]);
   if(env&&previous)await alertLostLinks(db,env,g,JSON.parse(previous.result),results).catch(()=>console.error('Backlink alert email failed.'));
  }else await db.run("UPDATE monitor_groups SET status='running' WHERE id=?",[g.id]);
 }catch(e){await db.run("UPDATE monitor_groups SET status='running' WHERE id=?",[g.id]);throw e;}
}
// budgetMs>0 keeps crawling running checks until the time budget is used (one cron call per day on Vercel Hobby).
export async function processGroups(db:Database,env:Env,safeFetch:PublicFetch,budgetMs=0){
 const deadline=Date.now()+budgetMs;
 await db.run("UPDATE monitor_groups SET status='running' WHERE status='processing' AND last_checked<?",[new Date(Date.now()-120000).toISOString()]);
 const due=await db.all("SELECT * FROM monitor_groups WHERE archived=0 AND interval_hours>0 AND next_check<=? AND status NOT IN ('running','processing') LIMIT 5",[now()]);
 for(const g of due){const user=await db.first('SELECT * FROM users WHERE id=?',[g.user_id]);if(!user)continue;if(user.plan==='start'&&user.period!==month())await db.run('UPDATE users SET units=?,period=? WHERE id=? AND period<>?',[limits[user.plan]?.units||10,month(),user.id,month()]);try{await start(db,g,user)}catch(e){if(e instanceof ApiError&&e.status===402)await db.run("UPDATE monitor_groups SET status='insufficient_units',next_check=? WHERE id=?",[new Date(Date.now()+86400000).toISOString(),g.id]);}}
 do{const active=await db.all("SELECT id FROM monitor_groups WHERE archived=0 AND status='running' LIMIT 5");if(!active.length)break;for(const g of active)await processGroup(db,g.id,safeFetch,env);}while(Date.now()<deadline);
}
export async function groupApi(request:Request,db:Database,env:Env,safeFetch:PublicFetch,user:Row){
 const path=new URL(request.url).pathname.replace(/\/$/,''),method=request.method;
 if(!path.startsWith('/api/monitor-groups'))return undefined;
 const match=path.match(/^\/api\/monitor-groups\/([^/]+)(?:\/(run|process|history))?$/);
 if(path==='/api/monitor-groups'){
  if(method==='GET')return {rows:await db.all('SELECT g.*,p.name AS project_name FROM monitor_groups g LEFT JOIN projects p ON p.id=g.project_id WHERE g.user_id=? AND g.archived=0 ORDER BY g.created_at DESC',[user.id]),scheduling:env.AUTH_MODE!=='platform'||!!env.CRON_SECRET||env.PRIVATE_SCHEDULER==='1'};
  if(method==='POST'){
   const raw=await request.json();const parsed=z.object({name:z.string().trim().max(200).default(''),project_id:z.string().default(''),sources:z.array(z.string().max(2048)).min(1).max(1000),targets:z.array(z.string().max(2048)).min(1).max(100),interval_hours:z.union([z.literal(0),z.literal(24),z.literal(168)]).default(0)}).safeParse(raw);if(!parsed.success)throw new ApiError(400,'Enter up to 1,000 page URLs and 100 target domains.');const d=parsed.data;
   if(d.interval_hours&&(env.SCHEDULER_AVAILABLE==='0'||env.AUTH_MODE==='platform'&&!env.CRON_SECRET&&env.PRIVATE_SCHEDULER!=='1'))throw new ApiError(503,'Scheduled monitoring needs the server scheduler configured. Manual checks are available.');
   const sources=[...new Set(d.sources.map(s=>publicURL(s).href))],targets=[...new Set(d.targets.map(normalizeDomain))];if(targets.includes(''))throw new ApiError(400,'Invalid target domain.');
   if(d.project_id)await projectAccess(db,d.project_id,user).catch(()=>{throw new ApiError(404,'Project not found.')});
   const gid=id(),name=d.name||targets[0]+' backlinks';
   // Reserve first so insufficient balance never creates an orphaned check.
   const job=await reserve(db,user,'monitor-group',name,sources.length);
   try{await db.run("INSERT INTO monitor_groups (id,user_id,name,project_id,sources,targets,interval_hours,status,result,job_id,last_checked,created_at) VALUES (?,?,?,?,?,?,?,'running','[]',?,?,?)",[gid,user.id,name,d.project_id||null,JSON.stringify(sources),JSON.stringify(targets),d.interval_hours,job,now(),now()]);}catch(e){await refund(db,job,'Check could not be created.');throw e;}
   return {id:gid,job};
  }
 }
 if(match){const g=await db.first('SELECT * FROM monitor_groups WHERE id=? AND user_id=? AND archived=0',[match[1],user.id]);if(!g)throw new ApiError(404,'Check not found.');
  if(method==='GET'&&match[2]==='history')return {rows:await db.all('SELECT * FROM monitor_group_history WHERE group_id=? ORDER BY created_at DESC LIMIT 50',[g.id])};
  if(method==='GET')return {group:g,rows:JSON.parse(g.result||'[]')};
  if(method==='POST'&&match[2]==='run')return {job:await start(db,g,user)};
  if(method==='POST'&&match[2]==='process'){await processGroup(db,g.id,safeFetch,env);return {ok:true};}
  if(method==='PATCH'){const d=z.object({interval_hours:z.union([z.literal(0),z.literal(24),z.literal(168)])}).safeParse(await request.json());if(!d.success)throw new ApiError(400,'Invalid monitoring interval.');if(d.data.interval_hours&&(env.SCHEDULER_AVAILABLE==='0'||env.AUTH_MODE==='platform'&&!env.CRON_SECRET&&env.PRIVATE_SCHEDULER!=='1'))throw new ApiError(503,'Server scheduler is not configured.');await db.run('UPDATE monitor_groups SET interval_hours=?,next_check=? WHERE id=?',[d.data.interval_hours,d.data.interval_hours?new Date(Date.now()+d.data.interval_hours*3600000).toISOString():null,g.id]);return {ok:true};}
  if(method==='DELETE'){if(['running','processing'].includes(g.status))throw new ApiError(409,'Wait for the current check to complete before archiving.');await db.run('UPDATE monitor_groups SET archived=1,interval_hours=0 WHERE id=?',[g.id]);return {ok:true};}
 }
 throw new ApiError(404,'Monitoring route not found.');
}
