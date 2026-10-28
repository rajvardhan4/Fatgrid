import { z } from 'zod';
import { ApiError, authenticate, equal, id, limits, month, now, passwordHash, randomToken, rateLimit, safeUser, sessionCookie, sha, type Env } from './auth';
import { emailConfigured, sendEmail } from './email';
import { googleAuthURL, googleConfigured, googleProfile } from './google';
import type { Database, Row, Statement } from './db';
import { csvCell, isDemo, normalizeDomain, parseDomains, parseNiches } from '../shared/domain';
import { clearDemo, demoCount, loadDemo } from './demo';
import { costFor, customerOrder, customerPrice, hideSource, loadSettings, saveSettings, sellOffer, sellRow, type Pricing } from './pricing';
import { inspectBacklink, providerStatus, publicURL, scanProvider, backlinkSummary, type PublicFetch } from './providers';
import { billingPortal, checkout, stripeWebhook } from './billing';
import { groupApi, processGroups } from './monitoring';
const json=(value:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const str=z.string().trim().min(1).max(300);
const publicUrl=z.string().max(2048).refine(x=>{try{publicURL(x);return true}catch{return false}},'Use a public HTTP(S) URL.');
const domain=z.string().transform(normalizeDomain).refine(Boolean,'Invalid domain.');
async function body<T>(request:Request,schema:z.ZodType<T>):Promise<T>{const text=await request.text();if(text.length>1_000_000)throw new ApiError(413,'Request too large.');try{return schema.parse(JSON.parse(text))}catch(e){if(e instanceof z.ZodError)throw new ApiError(400,e.issues.map(x=>`${x.path.join('.')}: ${x.message}`).join('; '));throw new ApiError(400,'Invalid JSON.')}}
async function own(db:Database,table:string,recordId:string,user:Row){const row=await db.first(`SELECT * FROM ${table} WHERE id=? AND user_id=?`,[recordId,user.id]);if(!row)throw new ApiError(404,'Record not found.');return row;}
function requireUser(user:Row|null):asserts user is Row {if(!user)throw new ApiError(401,'Log in to continue.','unauthorized');}
function admin(user:Row){if(user.role!=='admin')throw new ApiError(403,'Administrator access required.');}
// Owners and invited members can open a project; viewers cannot change it. role is 'owner', 'editor' or 'viewer'.
export async function projectAccess(db:Database,projectId:string,user:Row,write=false){
 const project=await db.first("SELECT p.*,CASE WHEN p.user_id=? THEN 'owner' ELSE m.role END AS role FROM projects p LEFT JOIN project_members m ON m.project_id=p.id AND m.user_id=? WHERE p.id=? AND (p.user_id=? OR m.user_id IS NOT NULL)",[user.id,user.id,projectId,user.id]);
 if(!project)throw new ApiError(404,'Record not found.');
 if(write&&project.role==='viewer')throw new ApiError(403,'You have view-only access to this project.');
 return project;
}
const ownerOnly=(project:Row)=>{if(project.role!=='owner')throw new ApiError(403,'Only the project owner can do this.');};
// Shared projects use the owner's plan for the domain limit.
async function domainLimit(db:Database,project:Row){const owner=await db.first('SELECT plan FROM users WHERE id=?',[project.user_id]);return limits[owner?.plan||'start'].domains;}
const optionalPrice=z.preprocess(v=>v===''||v==null?null:Number(v),z.number().min(1,'Prices must be at least $1.').max(1000000).nullable()).optional().transform(v=>v??null);
const submissionSchema=z.object({domain,title:z.string().trim().max(200).default(''),category:z.string().trim().max(100).default(''),country:z.string().trim().max(100).default(''),language:z.string().trim().max(100).default('English'),guest_post_price:optionalPrice,link_insertion_price:optionalPrice,follow:z.enum(['dofollow','nofollow']).default('dofollow'),sponsored:z.boolean().default(false),restricted:z.boolean().default(false),niches:z.array(z.string().max(30)).max(10).default([]).transform(a=>parseNiches(a.join(','))),sample_url:z.union([publicUrl,z.literal('')]).default(''),contact_name:z.string().trim().min(1).max(100),contact_email:z.string().trim().email().max(254).transform(s=>s.toLowerCase()),notes:z.string().trim().max(2000).default(''),website:z.string().max(500).default('')}).refine(d=>d.guest_post_price!==null||d.link_insertion_price!==null,{message:'Enter a guest post or a link insertion price.',path:['price']});
const metric=(max?:number)=>z.preprocess(v=>v===''||v==null?null:v,z.coerce.number({error:'Enter a whole number, e.g. 45 or 10.5K.'}).int('Enter a whole number.').min(0,'Cannot be negative.').max(max??Number.MAX_SAFE_INTEGER,`Must be ${max} or less.`).nullable()).optional().transform(v=>v??null);
const inventoryRow=z.object({domain,marketplace:z.string().trim().max(300).optional().transform(v=>v||'Own inventory'),price:z.coerce.number({error:'Enter the price as a number, e.g. 150 or $150.'}).positive('Price must be more than 0.').max(1000000,'Price must be $1,000,000 or less.'),type:z.enum(['Guest Post','Link Insertion']).default('Guest Post'),title:z.string().max(500).default(''),category:z.string().max(300).default(''),country:z.string().max(100).default(''),language:z.string().max(100).default('English'),authority:metric(100),dr:metric(100),traffic:metric(),referring_domains:metric(),traffic_top:metric(),all_traffic_top:metric(),all_traffic:metric(),monthly_min:metric(),follow:z.enum(['dofollow','nofollow']).default('dofollow'),sponsored:z.coerce.number().min(0).max(1).default(0),restricted:z.coerce.number().min(0).max(1).default(0),url:z.union([publicUrl,z.literal('')]).default(''),metrics_source:z.string().max(100).default('Imported'),niches:z.string().max(300).default('').transform(parseNiches)});
const inventoryColumns=['domain','marketplace','price','type','title','category','language','country','authority','dr','traffic','referring_domains','traffic_top','all_traffic_top','all_traffic','monthly_min','follow','sponsored','restricted','niches','url','metrics_source'];
// Each source yields the same columns: type, at, user_id and four details (a–d) that the admin UI describes.
const activitySources:Record<string,string>={
 signup:"SELECT 'signup' AS type,created_at AS at,id AS user_id,plan AS a,role AS b,NULL AS c,NULL AS d FROM users",
 job:"SELECT 'job' AS type,created_at AS at,user_id,kind AS a,status AS b,cost AS c,SUBSTR(query,1,300) AS d FROM jobs",
 project:"SELECT 'project' AS type,created_at AS at,user_id,name AS a,domain AS b,NULL AS c,NULL AS d FROM projects",
 order:"SELECT 'order' AS type,created_at AS at,user_id,domain AS a,status AS b,price AS c,marketplace AS d FROM orders",
 support:"SELECT 'support' AS type,created_at AS at,user_id,subject AS a,status AS b,NULL AS c,NULL AS d FROM support_requests",
 quote:"SELECT 'quote' AS type,created_at AS at,user_id,domain AS a,status AS b,price AS c,link_type AS d FROM quote_requests",
 monitor:"SELECT 'monitor' AS type,created_at AS at,user_id,name AS a,status AS b,NULL AS c,NULL AS d FROM monitor_groups",
 listing:"SELECT 'listing' AS type,created_at AS at,user_id,domain AS a,status AS b,guest_post_price AS c,contact_email AS d FROM publisher_submissions",
};
// Approving a submission lists it as "Direct from publisher" offers. Existing publisher metrics are kept.
function approvalStatements(s:Row):Statement[]{
 const offers=([['Guest Post',s.guest_post_price],['Link Insertion',s.link_insertion_price]] as const).filter(([,price])=>price!=null);
 return [{sql:"INSERT INTO publishers (domain,title,category,language,country,niches,updated_at,metrics_source) VALUES (?,?,?,?,?,?,?,'Publisher submitted') ON CONFLICT(domain) DO UPDATE SET niches=CASE WHEN publishers.niches='' THEN excluded.niches ELSE publishers.niches END,updated_at=excluded.updated_at",args:[s.domain,s.title,s.category,s.language,s.country,s.niches||'',now()]},
  ...offers.map(([type,price])=>({sql:'INSERT INTO offers (id,domain,marketplace,price,type,follow,sponsored,restricted,url,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(domain,marketplace,type) DO UPDATE SET price=excluded.price,follow=excluded.follow,sponsored=excluded.sponsored,restricted=excluded.restricted,url=excluded.url,active=1,updated_at=excluded.updated_at',args:[id(),s.domain,'Direct from publisher',price,type,s.follow,s.sponsored,s.restricted,s.sample_url,now()]}))];
}
const redirect=(location:string,cookie?:string)=>new Response(null,{status:302,headers:{Location:location,'Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
async function addProjectDomains(db:Database,projectId:string,domains:string[],limit:number){
 const serialized=JSON.stringify([...new Set(domains)]);
 // Check the whole new batch and insert in one statement, including concurrent requests.
 await db.run(`INSERT INTO project_domains (id,project_id,domain,created_at)
 SELECT lower(hex(randomblob(16))),?,value,? FROM json_each(?) j
 WHERE NOT EXISTS(SELECT 1 FROM project_domains d WHERE d.project_id=? AND d.domain=j.value)
 AND (SELECT COUNT(*) FROM project_domains WHERE project_id=?)+(SELECT COUNT(*) FROM json_each(?) n WHERE NOT EXISTS(SELECT 1 FROM project_domains d WHERE d.project_id=? AND d.domain=n.value))<=?`,[projectId,now(),serialized,projectId,projectId,serialized,projectId,limit]);
 const missing=await db.first('SELECT COUNT(*) AS n FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM project_domains d WHERE d.project_id=? AND d.domain=j.value)',[serialized,projectId]);
 if(missing!.n)throw new ApiError(402,'Project domain limit reached.');
}
export async function reserve(db:Database,user:Row,kind:string,query:string,cost:number){
  const job=id();
  // Transactional insert + conditional debit; failed debit rolls back the entire reservation.
  const result=await db.batch([
    {sql:'INSERT INTO jobs (id,user_id,kind,query,status,cost,created_at) SELECT ?,?,?,?,\'running\',?,? WHERE (SELECT units FROM users WHERE id=?)>=?',args:[job,user.id,kind,query,cost,now(),user.id,cost]},
    {sql:'UPDATE users SET units=units-? WHERE id=? AND EXISTS(SELECT 1 FROM jobs WHERE id=?) RETURNING units',args:[cost,user.id,job]},
    {sql:'INSERT INTO ledger (id,user_id,amount,reason,job_id,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM jobs WHERE id=?)',args:[id(),user.id,-cost,kind,job,now(),job]},
  ]);
  if(!result[1]?.length)throw new ApiError(402,'Not enough units for this operation. Upgrade your plan or wait for the monthly reset.','insufficient_units');return job;
}
export async function finish(db:Database,job:string,result:unknown,unused=0){await db.batch([
 {sql:"UPDATE users SET units=units+? WHERE id=(SELECT user_id FROM jobs WHERE id=? AND status='running')",args:[unused,job]},
 {sql:"INSERT INTO ledger (id,user_id,amount,reason,job_id,created_at) SELECT ?,user_id,?,'unused units refunded',id,? FROM jobs WHERE id=? AND status='running' AND ?>0",args:[id(),unused,now(),job,unused]},
 {sql:"UPDATE jobs SET status='completed',cost=cost-?,result=?,finished_at=? WHERE id=? AND status='running'",args:[unused,JSON.stringify(result),now(),job]},
]);}
export async function refund(db:Database,job:string,error:string){await db.batch([
  {sql:"UPDATE users SET units=units+(SELECT cost FROM jobs WHERE id=?) WHERE id=(SELECT user_id FROM jobs WHERE id=? AND status='running')",args:[job,job]},
  {sql:"INSERT INTO ledger (id,user_id,amount,reason,job_id,created_at) SELECT ?,user_id,cost,'refund',id,? FROM jobs WHERE id=? AND status='running'",args:[id(),now(),job]},
  {sql:"UPDATE jobs SET status='failed',error=?,finished_at=? WHERE id=? AND status='running'",args:[error,now(),job]},
]);}
export async function recoverStaleJobs(db:Database){const cutoff=new Date(Date.now()-5*60000).toISOString();const rows=await db.all("SELECT id FROM jobs WHERE status='running' AND created_at<? AND NOT EXISTS (SELECT 1 FROM monitor_groups g WHERE g.job_id=jobs.id AND g.status IN ('running','processing') AND g.last_checked>?)",[cutoff,cutoff]);for(const row of rows)await refund(db,row.id,'Operation interrupted; units refunded.');}
const inventorySelect='SELECT p.*,MIN(o.price) AS price,COUNT(o.id) AS offers,GROUP_CONCAT(DISTINCT o.type) AS types,GROUP_CONCAT(DISTINCT o.follow) AS follow,MAX(o.sponsored) AS sponsored,MAX(o.restricted) AS restricted FROM publishers p JOIN offers o ON o.domain=p.domain AND o.active=1';
async function inventory(db:Database,search:URLSearchParams,pricing:Pricing){
  const where:string[]=['1=1'],args:unknown[]=[];
  for(const [param,column] of [['q','p.domain'],['keyword','p.title']] as const){const value=search.get(param);if(value){where.push(`${column} LIKE ?`);args.push('%'+value+'%')}}
  for(const [param,column] of [['country','p.country'],['category','p.category'],['language','p.language'],['type','o.type'],['marketplace','o.marketplace'],['follow','o.follow']] as const){const value=search.get(param);if(value&&value!=='All'&&value!=='Any'){where.push(`${column}=?`);args.push(value)}}
  for(const [param,column,op] of [['minPrice','o.price','>='],['maxPrice','o.price','<='],['minTraffic','p.traffic','>='],['maxTraffic','p.traffic','<='],['minDR','p.dr','>='],['maxDR','p.dr','<='],['minAS','p.authority','>='],['maxAS','p.authority','<=']] as const){const v=search.get(param);if(v!==null&&v!==''&&Number.isFinite(Number(v))){where.push(`${column}${op}?`);args.push(column==='o.price'?costFor(Number(v),pricing.markup):Number(v))}}
  for(const key of ['sponsored','restricted']){const v=search.get(key);if(v==='0'||v==='1'){where.push(`o.${key}=?`);args.push(Number(v))}}
  const sorts:Record<string,string>={domain:'p.domain',price:'price',traffic:'p.traffic',authority:'p.authority',dr:'p.dr',offers:'offers'};
  const sort=sorts[search.get('sort')||'domain']||'p.domain',dir=search.get('direction')==='desc'?'DESC':'ASC';
  const page=Math.max(1,Math.min(100000,Number(search.get('page'))||1)),size=Math.max(1,Math.min(100,Number(search.get('size'))||25));
  const condition=' WHERE '+where.join(' AND ');
  const count=await db.first('SELECT COUNT(DISTINCT p.domain) AS count FROM publishers p JOIN offers o ON o.domain=p.domain AND o.active=1'+condition,args);
  const rows=await db.all(inventorySelect+condition+` GROUP BY p.domain ORDER BY ${sort} ${dir},p.domain ASC LIMIT ? OFFSET ?`,[...args,size,(page-1)*size]);
  return {rows:rows.map(r=>sellRow(r,pricing)),total:count!.count,page,size};
}
export async function api(request:Request,db:Database,env:Env,safeFetch:PublicFetch):Promise<Response>{
  try{
    const url=new URL(request.url),path=url.pathname.replace(/\/$/,''),method=request.method;
    // Vercel Cron sends GET with "Authorization: Bearer CRON_SECRET"; other schedulers may POST.
    if(path==='/api/internal/tick'&&(method==='POST'||method==='GET')){
      // This mode is only configured on the owner-private Sites deployment. Dispatch
      // authenticates service access before this shared, parameter-free updater runs.
      const privateDispatch=env.AUTH_MODE==='platform'&&env.PRIVATE_SCHEDULER==='1';
      if(!privateDispatch&&(!env.CRON_SECRET||!equal(request.headers.get('authorization')||'','Bearer '+env.CRON_SECRET)))throw new ApiError(401,'Unauthorized.');
      if(env.FEATURE_SCANNERS==='1'||(await loadSettings(db)).scanners)await processGroups(db,env,safeFetch,40000);await recoverStaleJobs(db);return json({ok:true,pending:(await db.first("SELECT COUNT(*) AS n FROM monitor_groups WHERE archived=0 AND status IN ('running','processing')"))!.n,completed:(await db.first("SELECT COUNT(*) AS n FROM monitor_groups WHERE archived=0 AND status='completed'"))!.n});
    }
    if(path==='/api/billing/webhook'&&method==='POST')return json(await stripeWebhook(request,db,env));
    if(!['GET','HEAD','OPTIONS'].includes(method)){
      const origin=request.headers.get('origin');
      const configuredOrigin=new URL(env.APP_ORIGIN||url.origin);
      const loopbackOrigin=env.AUTH_MODE!=='platform'&&['localhost','127.0.0.1'].includes(configuredOrigin.hostname)&&origin&&['http://localhost:'+configuredOrigin.port,'http://127.0.0.1:'+configuredOrigin.port].includes(origin);
      if(origin&&origin!==env.APP_ORIGIN&&origin!==url.origin&&!loopbackOrigin)throw new ApiError(403,'Cross-origin requests are not allowed.');
      if(request.headers.get('sec-fetch-site')==='cross-site')throw new ApiError(403,'Cross-site requests are not allowed.');
      if(!request.headers.get('content-type')?.includes('application/json'))throw new ApiError(415,'Content-Type must be application/json.');
    }
    const user=await authenticate(request,db,env);
    let cached:Promise<Awaited<ReturnType<typeof loadSettings>>>|undefined;
    const settings=()=>cached??=loadSettings(db);
    const pricing=async():Promise<Pricing>=>({markup:(await settings()).markup,admin:user?.role==='admin'});
    const scannersOn=async()=>env.FEATURE_SCANNERS==='1'||(await settings()).scanners;
    if(path==='/api/session'&&method==='GET')return json({user:safeUser(user),authMode:env.AUTH_MODE||'local',providers:providerStatus(env),limits:limits[user?.plan||'start'],features:{scanners:await scannersOn()}});
    if(path==='/api/health')return json({ok:!!await db.first('SELECT 1 AS ok'),database:'connected'});
    if(path.startsWith('/api/auth/')){
      if(env.AUTH_MODE==='platform')throw new ApiError(409,'Use the secure ChatGPT sign-in link on this hosted version.');
      const ip=request.headers.get('x-client-ip')||'unknown';await rateLimit(db,'auth:'+ip,15,15*60000);
      if(path==='/api/auth/logout'&&method==='POST'){
        const token=request.headers.get('cookie')?.match(/(?:^|;\s*)fg_session=([^;]+)/)?.[1];if(token)await db.run('DELETE FROM sessions WHERE token_hash=?',[await sha(token)]);
        return json({ok:true},200,{'Set-Cookie':'fg_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'});
      }
      if((path==='/api/auth/register'||path==='/api/auth/login')&&method==='POST'){
        const data=await body(request,z.object({email:z.string().email().max(254).transform(s=>s.toLowerCase()),password:z.string().min(8).max(128),name:z.string().trim().max(100).optional()}));
        let record=await db.first('SELECT * FROM users WHERE email=?',[data.email]);
        if(path.endsWith('/register')){
          if(record)throw new ApiError(409,'An account with that email already exists.');
          const uid=id();await db.run('INSERT INTO users (id,email,name,password_hash,role,period,created_at) VALUES (?,?,?,?,?,?,?)',[uid,data.email,data.name||data.email.split('@')[0],await passwordHash(data.password),'member',month(),now()]);
          record=await db.first('SELECT * FROM users WHERE id=?',[uid]);
        }else{
          const salt=record?.password_hash?.split(':')[1]||'00000000000000000000000000000000';
          const hash=await passwordHash(data.password,salt);if(!record?.password_hash||!equal(hash,record.password_hash))throw new ApiError(401,'Incorrect email or password.');
        }
        return json({user:safeUser(record)},200,{'Set-Cookie':await sessionCookie(db,record!.id,url.protocol==='https:')});
      }
      const origin=env.APP_ORIGIN||url.origin,secure=url.protocol==='https:';
      if(path==='/api/auth/forgot'&&method==='POST'){
        const d=await body(request,z.object({email:z.string().email().max(254).transform(s=>s.toLowerCase())}));
        if(!emailConfigured(env))throw new ApiError(503,'Password reset by email is not available yet. Contact support from your account or ask the administrator.','email_unavailable');
        const record=await db.first('SELECT id,email FROM users WHERE email=?',[d.email]);
        // The response is the same whether or not the account exists.
        if(record){const token=randomToken();await db.run('INSERT INTO password_resets (token_hash,user_id,expires_at,used) VALUES (?,?,?,0)',[await sha(token),record.id,Date.now()+3600000]);await sendEmail(env,record.email,'Reset your FatGrid password',`Someone asked to reset the password for this FatGrid account.\n\nOpen this link within 1 hour to choose a new password:\n${origin}/auth/reset/?token=${token}\n\nIf you did not ask for this, ignore this email; your password stays the same.`);}
        return json({ok:true});
      }
      if(path==='/api/auth/reset'&&method==='POST'){
        const d=await body(request,z.object({token:z.string().regex(/^[0-9a-f]{64}$/),password:z.string().min(8).max(128)})),hash=await sha(d.token);
        const reset=await db.first('SELECT * FROM password_resets WHERE token_hash=? AND used=0 AND expires_at>?',[hash,Date.now()]);
        if(!reset||!await db.run('UPDATE password_resets SET used=1 WHERE token_hash=? AND used=0',[hash]))throw new ApiError(400,'This reset link is invalid or has expired. Request a new one.');
        await db.batch([{sql:'UPDATE users SET password_hash=? WHERE id=?',args:[await passwordHash(d.password),reset.user_id]},{sql:'DELETE FROM sessions WHERE user_id=?',args:[reset.user_id]},{sql:'DELETE FROM password_resets WHERE user_id=? AND used=0',args:[reset.user_id]}]);
        const record=await db.first('SELECT * FROM users WHERE id=?',[reset.user_id]);
        return json({user:safeUser(record)},200,{'Set-Cookie':await sessionCookie(db,reset.user_id,secure)});
      }
      if(path==='/api/auth/google/start'&&method==='GET'){
        if(!googleConfigured(env))throw new ApiError(503,'Google sign-in is not configured on this server.','provider_unavailable');
        const state=randomToken();
        return redirect(googleAuthURL(env,origin,state),`fg_oauth=${state}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secure?'; Secure':''}`);
      }
      if(path==='/api/auth/google/callback'&&method==='GET'){
        const failed=(reason:string)=>redirect(`${origin}/auth/login/?error=${reason}`);
        const state=url.searchParams.get('state')||'',saved=request.headers.get('cookie')?.match(/(?:^|;\s*)fg_oauth=([^;]+)/)?.[1]||'',code=url.searchParams.get('code');
        if(!googleConfigured(env)||!code||!state||!equal(state,saved))return failed('google');
        let profile;try{profile=await googleProfile(env,origin,code)}catch{return failed('google')}
        if(!profile.verified)return failed('google_unverified');
        let record=await db.first('SELECT * FROM users WHERE email=?',[profile.email]);
        if(!record){const uid=id();await db.run('INSERT INTO users (id,email,name,role,period,created_at) VALUES (?,?,?,?,?,?)',[uid,profile.email,profile.name||profile.email.split('@')[0],'member',month(),now()]);record=await db.first('SELECT * FROM users WHERE id=?',[uid]);}
        return redirect(origin+'/',await sessionCookie(db,record!.id,secure));
      }
      throw new ApiError(404,'Authentication route not found.');
    }
    if(path==='/api/inventory'&&method==='GET')return json(await inventory(db,url.searchParams,await pricing()));
    if(path==='/api/inventory/options'&&method==='GET')return json({countries:await db.all("SELECT DISTINCT country AS value FROM publishers WHERE country<>'' ORDER BY country"),categories:await db.all("SELECT DISTINCT category AS value FROM publishers WHERE category<>'' ORDER BY category"),marketplaces:hideSource(await pricing())?[]:await db.all('SELECT DISTINCT marketplace AS value FROM offers ORDER BY marketplace')});
    if(path==='/api/submissions'&&method==='POST'){
      await rateLimit(db,'submit:'+(request.headers.get('x-client-ip')||'unknown'),5,3600000);
      const d=await body(request,submissionSchema);
      // Bots fill the hidden "website" field; accept silently without storing.
      if(!d.website)await db.run('INSERT INTO publisher_submissions (id,domain,title,category,country,language,guest_post_price,link_insertion_price,follow,sponsored,restricted,niches,sample_url,contact_name,contact_email,notes,status,review_note,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id(),d.domain,d.title,d.category,d.country,d.language||'English',d.guest_post_price,d.link_insertion_price,d.follow,Number(d.sponsored),Number(d.restricted||!!d.niches),d.niches,d.sample_url,d.contact_name,d.contact_email,d.notes,'pending','',user?.id||null,now()]);
      return json({ok:true},201);
    }
    if(path==='/api/offers'&&method==='GET'){const d=normalizeDomain(url.searchParams.get('domain')||''),p=await pricing();return json({publisher:await db.first('SELECT * FROM publishers WHERE domain=?',[d]),offers:(await db.all('SELECT * FROM offers WHERE domain=? AND active=1 ORDER BY price,marketplace',[d])).map(o=>sellOffer(o,p))});}
    requireUser(user);
    if(method!=='GET')await rateLimit(db,'write:'+user.id,100);
    // Scanners (Google, AI, Backlinks Profile, Backlinks Monitoring) stay hidden until an admin switches them on.
    if(!await scannersOn()&&(path==='/api/backlinks/lookup'||path.startsWith('/api/monitor-groups')||path.startsWith('/api/monitors')||(path==='/api/scans'&&method==='POST')))throw new ApiError(404,'This feature is not available yet.','feature_disabled');
    if(path==='/api/backlinks/lookup'&&method==='POST'){await rateLimit(db,'lookup:'+user.id,20,3600000);const d=await body(request,z.object({domain}));return json(await backlinkSummary(d.domain,env));}
    const grouped=await groupApi(request,db,env,safeFetch,user);if(grouped!==undefined)return json(grouped);
    if(path==='/api/preferences'){
      if(method==='GET')return json(Object.fromEntries((await db.all('SELECT key,value FROM preferences WHERE user_id=?',[user.id])).map(r=>[r.key,JSON.parse(r.value)])));
      if(method==='POST'){const d=await body(request,z.object({key:z.enum(['columns','presets','activeProject','dismissNotice','emailAlerts']),value:z.unknown()}));if(JSON.stringify(d.value).length>20000)throw new ApiError(400,'Preference is too large.');await db.run('INSERT INTO preferences (user_id,key,value) VALUES (?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value',[user.id,d.key,JSON.stringify(d.value)]);return json({ok:true});}
    }
    if(path==='/api/account/password'&&method==='POST'){
      await rateLimit(db,'password:'+user.id,10,15*60000);
      const d=await body(request,z.object({current_password:z.string().max(128).default(''),new_password:z.string().min(8).max(128)}));
      // Accounts created with Google have no password yet and may set one without a current password.
      if(user.password_hash&&!equal(await passwordHash(d.current_password,user.password_hash.split(':')[1]),user.password_hash))throw new ApiError(400,'Current password is incorrect.');
      await db.batch([{sql:'UPDATE users SET password_hash=? WHERE id=?',args:[await passwordHash(d.new_password),user.id]},{sql:'DELETE FROM sessions WHERE user_id=?',args:[user.id]}]);
      return json({ok:true},200,{'Set-Cookie':await sessionCookie(db,user.id,url.protocol==='https:')});
    }
    if(path==='/api/decisions'){
      const project=url.searchParams.get('project')||'';
      if(method==='GET')return json({rows:await db.all('SELECT * FROM publisher_decisions WHERE user_id=? AND (project_id=? OR project_id=\'\')',[user.id,project])});
      if(method==='POST'){const d=await body(request,z.object({domain,project_id:z.string().default(''),decision:z.enum(['','yes','maybe','no','blacklist']).optional(),favorite:z.boolean().optional(),notes:z.string().max(5000).optional()}));if(d.project_id){const project=await projectAccess(db,d.project_id,user,d.decision==='yes');if(d.decision==='yes')await addProjectDomains(db,d.project_id,[d.domain],await domainLimit(db,project));}const old=await db.first('SELECT * FROM publisher_decisions WHERE user_id=? AND domain=? AND project_id=?',[user.id,d.domain,d.project_id]);await db.run('INSERT INTO publisher_decisions (id,user_id,domain,project_id,decision,favorite,notes) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,domain,project_id) DO UPDATE SET decision=excluded.decision,favorite=excluded.favorite,notes=excluded.notes',[id(),user.id,d.domain,d.project_id,d.decision??old?.decision??'',d.favorite===undefined?(old?.favorite??0):Number(d.favorite),d.notes??old?.notes??'']);return json({ok:true});}
    }
    if(path==='/api/price-check'&&method==='POST'){
      const data=await body(request,z.object({text:z.string().min(1).max(100000)}));const parsed=parseDomains(data.text);
      if(!parsed.domains.length||parsed.domains.length>500)throw new ApiError(400,'Enter between 1 and 500 valid unique domains.');
      const job=await reserve(db,user,'price-check',data.text,parsed.domains.length),sale=await pricing();
      try{const rows:Row[]=[];for(const item of parsed.domains){const found=await db.first(inventorySelect+' WHERE p.domain=? GROUP BY p.domain',[item.domain]),p=found&&sellRow(found,sale);rows.push({...item,...p,found:!!p,gap:p&&item.quoted!==null?Math.round((item.quoted-p.price)*100)/100:null});}const result={rows,invalid:parsed.invalid,job};await finish(db,job,result);return json(result);}catch(e){await refund(db,job,'Price check failed.');throw e;}
    }
    if(path==='/api/export'&&method==='POST'){
      const data=await body(request,z.object({domains:z.array(domain).min(1).max(500)}));const ds=[...new Set(data.domains)];
      const rows:Row[]=[],sale=await pricing();for(const d of ds){const p=await db.first(inventorySelect+' WHERE p.domain=? GROUP BY p.domain',[d]);if(p)rows.push(sellRow(p,sale))}
      if(!rows.length)throw new ApiError(400,'Select publishers with available data to export.');const job=await reserve(db,user,'export',ds.join('\n'),rows.length);
      const csv=[['Publisher','Best Price','Offers','AS','DR','Country','Traffic'].map(csvCell).join(','),...rows.map(p=>[p.domain,p.price,p.offers,p.authority,p.dr,p.country,p.traffic].map(csvCell).join(','))].join('\r\n');await finish(db,job,{rows:rows.length});return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="publishers.csv"','Cache-Control':'no-store'}});
    }
    if(path==='/api/projects'){
      if(method==='GET')return json({rows:await db.all("SELECT p.*,'owner' AS role,u.email AS owner_email,(SELECT COUNT(*) FROM project_domains d WHERE d.project_id=p.id) AS domain_count FROM projects p JOIN users u ON u.id=p.user_id WHERE p.user_id=? AND p.archived=0 UNION ALL SELECT p.*,m.role,u.email,(SELECT COUNT(*) FROM project_domains d WHERE d.project_id=p.id) FROM project_members m JOIN projects p ON p.id=m.project_id JOIN users u ON u.id=p.user_id WHERE m.user_id=? AND p.archived=0 ORDER BY created_at DESC",[user.id,user.id])});
      if(method==='POST'){const d=await body(request,z.object({name:str,domain:z.string().max(253).default(''),description:z.string().max(2000).default('')}));const pid=id();const count=await db.run('INSERT INTO projects (id,user_id,name,domain,description,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM projects WHERE user_id=? AND archived=0)<?',[pid,user.id,d.name,d.domain?normalizeDomain(d.domain):'',d.description,now(),user.id,limits[user.plan].projects]);if(!count)throw new ApiError(402,'Your plan project limit has been reached.');return json({id:pid},201);}
    }
    const projectMatch=path.match(/^\/api\/projects\/([^/]+)(?:\/(domains|members)(?:\/([^/]+))?)?$/);
    if(projectMatch){const project=await projectAccess(db,projectMatch[1],user,!['GET','HEAD'].includes(method)&&projectMatch[2]!=='members');
      if(projectMatch[2]==='domains'&&!projectMatch[3]){
        if(method==='GET')return json({project,rows:await db.all('SELECT * FROM project_domains WHERE project_id=? ORDER BY created_at DESC',[project.id])});
        if(method==='POST'){const d=await body(request,z.object({text:z.string().max(100000)})),parsed=parseDomains(d.text);if(!parsed.domains.length)throw new ApiError(400,'No valid domains found.');if(parsed.domains.length>500)throw new ApiError(400,'Add up to 500 domains at a time.');await addProjectDomains(db,project.id,parsed.domains.map(x=>x.domain),await domainLimit(db,project));return json({ok:true});}
      }else if(projectMatch[2]==='members'){
        if(method==='GET'&&!projectMatch[3])return json({role:project.role,rows:await db.all("SELECT u.id,u.email,u.name,'owner' AS role FROM users u WHERE u.id=? UNION ALL SELECT u.id,u.email,u.name,m.role FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=?",[project.user_id,project.id])});
        if(method==='POST'&&!projectMatch[3]){ownerOnly(project);const d=await body(request,z.object({email:z.string().email().max(254).transform(s=>s.toLowerCase()),role:z.enum(['viewer','editor'])}));const member=await db.first('SELECT id FROM users WHERE email=?',[d.email]);if(!member)throw new ApiError(404,'No account uses that email. Ask them to sign up first, then invite them again.');if(member.id===user.id)throw new ApiError(400,'You already own this project.');await db.run('INSERT INTO project_members (project_id,user_id,role,created_at) VALUES (?,?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role',[project.id,member.id,d.role,now()]);return json({ok:true},201);}
        // The owner removes anyone; a member may remove only themselves (leave the project).
        if(method==='DELETE'&&projectMatch[3]){if(projectMatch[3]!==user.id)ownerOnly(project);await db.run('DELETE FROM project_members WHERE project_id=? AND user_id=?',[project.id,projectMatch[3]]);return json({ok:true});}
      }else if(!projectMatch[2]){
        if(method==='DELETE'){ownerOnly(project);await db.run('UPDATE projects SET archived=1 WHERE id=?',[project.id]);return json({ok:true});}
        if(method==='PATCH'){ownerOnly(project);const d=await body(request,z.object({name:str,description:z.string().max(2000).default('')}));await db.run('UPDATE projects SET name=?,description=? WHERE id=?',[d.name,d.description,project.id]);return json({ok:true});}
      }
    }
    const domainMatch=path.match(/^\/api\/project-domains\/([^/]+)$/);
    if(domainMatch){const row=await db.first('SELECT * FROM project_domains WHERE id=?',[domainMatch[1]]);if(!row)throw new ApiError(404,'Domain not found.');await projectAccess(db,row.project_id,user,true).catch(e=>{throw e instanceof ApiError&&e.status===404?new ApiError(404,'Domain not found.'):e});if(method==='DELETE'){await db.run('DELETE FROM project_domains WHERE id=?',[row.id]);return json({ok:true});}if(method==='PATCH'){const d=await body(request,z.object({status:z.enum(['prospect','contacted','negotiating','ordered','published','rejected']),notes:z.string().max(5000)}));await db.run('UPDATE project_domains SET status=?,notes=? WHERE id=?',[d.status,d.notes,row.id]);return json({ok:true});}}
    if(path==='/api/orders'){
      if(method==='GET'){const p=await pricing();return json({rows:(await db.all('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC',[user.id])).map(o=>customerOrder(o,p))});}
      if(method==='POST'){const d=await body(request,z.object({offer_id:str,content:z.string().trim().min(20).max(100000),target_url:publicUrl,anchor:str}));const offer=await db.first('SELECT * FROM offers WHERE id=? AND active=1',[d.offer_id]);if(!offer)throw new ApiError(404,'Offer is no longer available.');if(isDemo(offer))throw new ApiError(400,'This is a demo listing and cannot be ordered.');// The customer pays the marked-up price; the publisher cost is kept for the admin's margin.
        const oid=id();await db.run('INSERT INTO orders (id,user_id,offer_id,domain,marketplace,price,cost,content,target_url,anchor,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[oid,user.id,offer.id,offer.domain,offer.marketplace,customerPrice(offer.price,(await pricing()).markup),offer.price,d.content,d.target_url,d.anchor,now()]);return json({id:oid},201);}
    }
    const orderMatch=path.match(/^\/api\/orders\/([^/]+)(?:\/(checkout))?$/);
    if(orderMatch){const order=await own(db,'orders',orderMatch[1],user);
      if(orderMatch[2]&&method==='POST'){if(order.status!=='draft')throw new ApiError(409,'Only a draft order can be paid.');const session=await checkout(env,{mode:'payment',client_reference_id:user.id,'metadata[order_id]':order.id,'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':String(Math.round(order.price*100)),'line_items[0][price_data][product_data][name]':`Publisher placement: ${order.domain}`,'line_items[0][quantity]':'1',success_url:`${env.APP_ORIGIN||url.origin}/my-orders/?payment=success`,cancel_url:`${env.APP_ORIGIN||url.origin}/my-orders/`});await db.run('UPDATE orders SET stripe_session=? WHERE id=?',[session.id,order.id]);return json({url:session.url});}
      if(method==='DELETE'){if(order.status!=='draft')throw new ApiError(409,'Paid orders require a support request to cancel.');await db.run("UPDATE orders SET status='cancelled' WHERE id=? AND status='draft'",[order.id]);return json({ok:true});}
    }
    if(path==='/api/requests'){
      if(method==='GET')return json({rows:await db.all('SELECT r.*,(SELECT body FROM messages m WHERE m.request_id=r.id ORDER BY created_at LIMIT 1) AS preview FROM support_requests r WHERE user_id=? ORDER BY created_at DESC',[user.id])});
      if(method==='POST'){const d=await body(request,z.object({subject:str,message:z.string().trim().min(1).max(10000)}));const rid=id();await db.batch([{sql:'INSERT INTO support_requests (id,user_id,subject,created_at) VALUES (?,?,?,?)',args:[rid,user.id,d.subject,now()]},{sql:'INSERT INTO messages VALUES (?,?,?,?,?)',args:[id(),rid,user.id,d.message,now()]}]);return json({id:rid},201);}
    }
    if(path==='/api/quotes'){
      if(method==='GET')return json({rows:await db.all('SELECT * FROM quote_requests WHERE user_id=? ORDER BY created_at DESC',[user.id])});
      if(method==='POST'){if(user.plan==='start')throw new ApiError(402,'Requests are part of paid plans.');const d=await body(request,z.object({domain,link_type:z.enum(['Guest Post','Link Insertion']),niche:z.string().max(100).default('General'),message:z.string().max(5000).default('Please check availability and price.')}));const qid=id(),rid=id();await db.batch([{sql:'INSERT INTO support_requests (id,user_id,subject,created_at) VALUES (?,?,?,?)',args:[rid,user.id,'Publisher request: '+d.domain,now()]},{sql:'INSERT INTO messages VALUES (?,?,?,?,?)',args:[id(),rid,user.id,d.message||'Please check availability and price.',now()]},{sql:'INSERT INTO quote_requests (id,user_id,domain,link_type,niche,request_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',args:[qid,user.id,d.domain,d.link_type,d.niche,rid,now(),now()]}]);return json({id:qid},201);}
    }
    const requestMatch=path.match(/^\/api\/requests\/([^/]+)$/);
    if(requestMatch){const r=await own(db,'support_requests',requestMatch[1],user);if(method==='GET')return json({request:r,messages:await db.all('SELECT m.*,u.name FROM messages m JOIN users u ON u.id=m.user_id WHERE request_id=? ORDER BY created_at',[r.id])});if(method==='POST'){const d=await body(request,z.object({message:z.string().trim().min(1).max(10000)}));await db.run('INSERT INTO messages VALUES (?,?,?,?,?)',[id(),r.id,user.id,d.message,now()]);return json({ok:true});}if(method==='PATCH'){const d=await body(request,z.object({status:z.enum(['open','closed'])}));await db.run('UPDATE support_requests SET status=? WHERE id=?',[d.status,r.id]);return json({ok:true});}}
    if(path==='/api/monitors'){
      if(method==='GET')return json({rows:await db.all('SELECT * FROM monitors WHERE user_id=? ORDER BY created_at DESC',[user.id])});
      if(method==='POST'){const d=await body(request,z.object({urls:z.array(publicUrl).min(1).max(100),target:domain}));await db.batch([...new Set(d.urls)].map(source=>({sql:'INSERT OR IGNORE INTO monitors (id,user_id,source_url,target_domain,created_at) VALUES (?,?,?,?,?)',args:[id(),user.id,source,d.target,now()]})));return json({ok:true},201);}
    }
    const monitorMatch=path.match(/^\/api\/monitors\/([^/]+)(?:\/(check|history))?$/);
    if(monitorMatch){const monitor=await own(db,'monitors',monitorMatch[1],user);
      if(method==='DELETE'){await db.batch([{sql:'DELETE FROM monitor_checks WHERE monitor_id=?',args:[monitor.id]},{sql:'DELETE FROM monitors WHERE id=? AND user_id=?',args:[monitor.id,user.id]}]);return json({ok:true});}
      if(monitorMatch[2]==='history'&&method==='GET')return json({rows:await db.all('SELECT * FROM monitor_checks WHERE monitor_id=? ORDER BY created_at DESC',[monitor.id])});
      if(monitorMatch[2]==='check'&&method==='POST'){
        const job=await reserve(db,user,'monitor',monitor.source_url,1);
        try{const result=await inspectBacklink(monitor.source_url,monitor.target_domain,safeFetch);await db.batch([{sql:'UPDATE monitors SET status=?,anchor=?,rel=?,http_status=?,error=?,last_checked=? WHERE id=?',args:[result.status,result.anchor,result.rel,result.http_status,result.error,now(),monitor.id]},{sql:'INSERT INTO monitor_checks (id,monitor_id,status,previous_status,anchor,rel,http_status,error,created_at) VALUES (?,?,?,?,?,?,?,?,?)',args:[id(),monitor.id,result.status,monitor.status,result.anchor,result.rel,result.http_status,result.error,now()]}]);await finish(db,job,result);return json(result);}catch(e){await refund(db,job,'Unable to check source page.');throw e;}
      }
    }
    if(path==='/api/scans'&&method==='GET')return json({rows:await db.all('SELECT j.*,s.country,s.language,s.targets,s.project_id,s.model FROM jobs j LEFT JOIN scan_details s ON s.job_id=j.id WHERE user_id=? ORDER BY created_at DESC LIMIT 50',[user.id])});
    if(path==='/api/scans'&&method==='POST'){
      const d=await body(request,z.object({kind:z.enum(['google','backlinks','ai']),query:str,country:z.enum(['United States','United Kingdom','India','Canada','Australia','Germany']).default('United States'),language:z.enum(['en','hi','fr','de','es']).default('en'),depth:z.number().int().min(10).max(200).default(100),project_id:z.string().default(''),targets:z.array(domain).max(100).default([])}));
      if(!providerStatus(env)[d.kind])throw new ApiError(503,'This scanner is not connected. Ask the administrator to configure the provider.','provider_unavailable');
      if(d.kind==='backlinks'&&!normalizeDomain(d.query))throw new ApiError(400,'Enter a valid competitor domain.');
      if(d.project_id)await projectAccess(db,d.project_id,user);
      const cost=d.kind==='ai'?10:d.kind==='google'?Math.ceil(d.depth/10):d.depth;
      const job=await reserve(db,user,d.kind,d.query,cost);
      try{await db.run('INSERT INTO scan_details (job_id,country,language,project_id,targets,model) VALUES (?,?,?,?,?,?)',[job,d.country,d.language,d.project_id||null,JSON.stringify(d.targets),d.kind==='ai'?'Perplexity Agent':'']);const result=await scanProvider(d.kind,d.query,d.country,d.depth,env,d.language);const rows:Row[]=[],sale=await pricing();for(const row of result.rows){const found=await db.first(inventorySelect+' WHERE p.domain=? GROUP BY p.domain',[row.domain]),p=found&&sellRow(found,sale);rows.push({...row,...p,found:!!p,target:d.targets.includes(row.domain)});}const data={...result,rows,job};await finish(db,job,data,d.kind==='backlinks'?Math.max(0,cost-rows.length):0);return json(data);}catch(e){await refund(db,job,'Provider could not complete the scan.');throw e;}
    }
    if(path==='/api/usage'&&method==='GET')return json({user:safeUser(user),rows:await db.all('SELECT * FROM ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 100',[user.id])});
    if(path==='/api/billing/checkout'&&method==='POST'){const d=await body(request,z.object({plan:z.enum(['pro','advanced'])}));const origin=env.APP_ORIGIN||url.origin;
      // A customer who already pays switches or cancels in the Stripe portal, never through a second subscription.
      if(user.stripe_subscription&&user.stripe_customer&&user.plan!=='start')return json({url:(await billingPortal(env,user.stripe_customer,origin+'/pricing/')).url,portal:true});
      const price=d.plan==='pro'?env.STRIPE_PRO_PRICE_ID:env.STRIPE_ADVANCED_PRICE_ID;if(env.STRIPE_SECRET_KEY&&!price)throw new ApiError(503,'This plan is not connected to billing yet.','provider_unavailable');
      const session=await checkout(env,{mode:'subscription',client_reference_id:user.id,'metadata[user_id]':user.id,'subscription_data[metadata][user_id]':user.id,'line_items[0][price]':price||'','line_items[0][quantity]':'1',...(user.stripe_customer?{customer:user.stripe_customer}:{customer_email:user.email}),allow_promotion_codes:'true',success_url:`${origin}/pricing/?checkout=success`,cancel_url:`${origin}/pricing/?checkout=cancelled`});return json({url:session.url});}
    if(path==='/api/billing/portal'&&method==='POST'){if(!user.stripe_customer)throw new ApiError(400,'There is no paid subscription on this account yet.');return json({url:(await billingPortal(env,user.stripe_customer,(env.APP_ORIGIN||url.origin)+'/pricing/')).url});}
    if(path.startsWith('/api/admin/')){
      admin(user);
      if(path==='/api/admin/users'&&method==='GET'){
        const search=(url.searchParams.get('search')||'').slice(0,254),page=Math.max(1,Math.min(100000,Number(url.searchParams.get('page'))||1));
        const filter=' WHERE email LIKE ? OR name LIKE ?',args=['%'+search+'%','%'+search+'%'];
        return json({rows:await db.all('SELECT id,email,name,role,plan,units,created_at FROM users'+filter+' ORDER BY created_at DESC LIMIT 50 OFFSET ?', [...args,(page-1)*50]),total:(await db.first('SELECT COUNT(*) AS n FROM users'+filter,args))!.n,page});
      }
      const adminUser=path.match(/^\/api\/admin\/users\/([^/]+)$/);
      if(adminUser&&method==='GET'){
        const uid=adminUser[1],account=await db.first('SELECT id,email,name,role,plan,units,created_at FROM users WHERE id=?',[uid]);
        if(!account)throw new ApiError(404,'User not found.');
        const collections:Record<string,Row[]>={};
        for(const table of ['projects','orders','support_requests','jobs','ledger','monitors','monitor_groups','publisher_decisions','quote_requests'])collections[table]=await db.all(`SELECT * FROM ${table} WHERE user_id=? LIMIT 100`,[uid]);
        collections.project_domains=await db.all('SELECT d.* FROM project_domains d JOIN projects p ON p.id=d.project_id WHERE p.user_id=? LIMIT 100',[uid]);
        collections.messages=await db.all('SELECT m.* FROM messages m JOIN support_requests r ON r.id=m.request_id WHERE r.user_id=? ORDER BY m.created_at DESC LIMIT 100',[uid]);
        collections.monitor_checks=await db.all('SELECT c.* FROM monitor_checks c JOIN monitors m ON m.id=c.monitor_id WHERE m.user_id=? ORDER BY c.created_at DESC LIMIT 100',[uid]);
        collections.monitor_group_history=await db.all('SELECT h.* FROM monitor_group_history h JOIN monitor_groups g ON g.id=h.group_id WHERE g.user_id=? ORDER BY h.created_at DESC LIMIT 100',[uid]);
        const count=async(sql:string)=>Number((await db.first(sql,[uid]))?.n||0);
        const summary={projects:await count('SELECT COUNT(*) AS n FROM projects WHERE user_id=?'),priceChecks:await count("SELECT COUNT(*) AS n FROM jobs WHERE user_id=? AND kind='price-check'"),scans:await count("SELECT COUNT(*) AS n FROM jobs WHERE user_id=? AND kind IN ('google','ai','backlinks')"),monitors:await count('SELECT COUNT(*) AS n FROM monitor_groups WHERE user_id=?'),orders:await count('SELECT COUNT(*) AS n FROM orders WHERE user_id=?'),support:await count('SELECT COUNT(*) AS n FROM support_requests WHERE user_id=?'),unitsUsed:await count('SELECT COALESCE(SUM(-amount),0) AS n FROM ledger WHERE user_id=? AND amount<0'),lastActive:(await db.first('SELECT MAX(created_at) AS at FROM jobs WHERE user_id=?',[uid]))?.at||null};
        return json({account,collections,summary});
      }
      if(path==='/api/admin/overview'&&method==='GET'){
        const since=(days:number)=>new Date(Date.now()-days*86400000).toISOString(),day=since(1),week=since(7),month=since(30);
        const n=async(sql:string,args:unknown[]=[])=>Number((await db.first(sql,args))?.n||0);
        return json({
          users:{total:await n('SELECT COUNT(*) AS n FROM users'),today:await n('SELECT COUNT(*) AS n FROM users WHERE created_at>=?',[day]),week:await n('SELECT COUNT(*) AS n FROM users WHERE created_at>=?',[week]),activeWeek:await n('SELECT COUNT(DISTINCT user_id) AS n FROM jobs WHERE created_at>=?',[week])},
          usage:{priceChecks:await n("SELECT COUNT(*) AS n FROM jobs WHERE kind='price-check'"),priceChecksWeek:await n("SELECT COUNT(*) AS n FROM jobs WHERE kind='price-check' AND created_at>=?",[week]),scans:await n("SELECT COUNT(*) AS n FROM jobs WHERE kind IN ('google','ai','backlinks')"),monitors:await n('SELECT COUNT(*) AS n FROM monitor_groups WHERE archived=0'),unitsWeek:await n('SELECT COALESCE(SUM(-amount),0) AS n FROM ledger WHERE amount<0 AND created_at>=?',[week])},
          projects:await n('SELECT COUNT(*) AS n FROM projects WHERE archived=0'),
          orders:{total:await n('SELECT COUNT(*) AS n FROM orders'),drafts:await n("SELECT COUNT(*) AS n FROM orders WHERE status='draft'"),paid:await n("SELECT COUNT(*) AS n FROM orders WHERE status IN ('paid','in_progress','published')"),revenue:await n("SELECT COALESCE(SUM(price),0) AS n FROM orders WHERE status IN ('paid','in_progress','published')")},
          support:{open:await n("SELECT COUNT(*) AS n FROM support_requests WHERE status='open'")},
          listings:{pending:await n("SELECT COUNT(*) AS n FROM publisher_submissions WHERE status='pending'")},
          topUsers:await db.all('SELECT u.id,u.email,u.name,u.plan,COUNT(j.id) AS jobs,MAX(j.created_at) AS last_active FROM jobs j JOIN users u ON u.id=j.user_id WHERE j.created_at>=? GROUP BY u.id,u.email,u.name,u.plan ORDER BY jobs DESC LIMIT 5',[month]),
        });
      }
      // One timeline of what every customer did, newest first; filter by kind, customer or email.
      if(path==='/api/admin/activity'&&method==='GET'){
        const type=url.searchParams.get('type')||'',uid=url.searchParams.get('user')||'',search=(url.searchParams.get('search')||'').slice(0,254),page=Math.max(1,Math.min(10000,Number(url.searchParams.get('page'))||1)),size=50;
        const parts=Object.entries(activitySources).filter(([k])=>!type||k===type).map(([,sql])=>sql);
        if(!parts.length)throw new ApiError(400,'Unknown activity type.');
        const where:string[]=[],args:unknown[]=[];
        if(uid){where.push('e.user_id=?');args.push(uid)}
        if(search){where.push('(u.email LIKE ? OR u.name LIKE ?)');args.push('%'+search+'%','%'+search+'%')}
        const rows=await db.all(`SELECT e.*,u.email,u.name FROM (${parts.join(' UNION ALL ')}) e LEFT JOIN users u ON u.id=e.user_id${where.length?' WHERE '+where.join(' AND '):''} ORDER BY e.at DESC LIMIT ? OFFSET ?`,[...args,size+1,(page-1)*size]);
        return json({rows:rows.slice(0,size),page,more:rows.length>size});
      }
      if(path==='/api/admin/status')return json({providers:providerStatus(env),publishers:(await db.first('SELECT COUNT(*) AS n FROM publishers'))!.n,offers:(await db.first('SELECT COUNT(*) AS n FROM offers'))!.n,users:(await db.first('SELECT COUNT(*) AS n FROM users'))!.n,submissions:(await db.first("SELECT COUNT(*) AS n FROM publisher_submissions WHERE status='pending'"))!.n,demo:await demoCount(db)});
      if(path==='/api/admin/demo'&&method==='POST'){const d=await body(request,z.object({action:z.enum(['load','clear'])}));if(d.action==='load')await loadDemo(db);else await clearDemo(db);return json({demo:await demoCount(db)});}
      if(path==='/api/admin/submissions'&&method==='GET')return json({rows:await db.all("SELECT * FROM publisher_submissions ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,created_at DESC LIMIT 200")});
      const submissionMatch=path.match(/^\/api\/admin\/submissions\/([^/]+)$/);
      if(submissionMatch&&method==='PATCH'){
        const d=await body(request,z.object({action:z.enum(['approve','reject']),note:z.string().trim().max(1000).default('')}));
        const s=await db.first('SELECT * FROM publisher_submissions WHERE id=?',[submissionMatch[1]]);
        if(!s)throw new ApiError(404,'Submission not found.');
        if(s.status!=='pending')throw new ApiError(409,'This submission was already reviewed.');
        await db.batch([...(d.action==='approve'?approvalStatements(s):[]),{sql:"UPDATE publisher_submissions SET status=?,review_note=?,reviewed_at=? WHERE id=? AND status='pending'",args:[d.action==='approve'?'approved':'rejected',d.note,now(),s.id]}]);
        if(emailConfigured(env))await sendEmail(env,s.contact_email,d.action==='approve'?`${s.domain} is now listed`:`About your listing request for ${s.domain}`,d.action==='approve'?`Thanks, ${s.contact_name}. ${s.domain} is now listed in the marketplace with the prices you sent.${d.note?`\n\nNote from the team: ${d.note}`:''}`:`Thanks, ${s.contact_name}. We could not list ${s.domain} right now.${d.note?`\n\nReason: ${d.note}`:''}`).catch(()=>console.error('Submission email failed.'));
        return json({ok:true});
      }
      if(path==='/api/admin/inventory'&&method==='POST'){
        const data=await body(request,z.object({rows:z.array(z.unknown()).min(1).max(250),dryRun:z.boolean().default(false)}));
        // Validate every row first and report each problem by row and column; nothing is written unless all rows are valid.
        const valid:z.infer<typeof inventoryRow>[]=[],issues:{row:number,field:string,message:string}[]=[];
        data.rows.forEach((raw,row)=>{const r=inventoryRow.safeParse(raw);if(r.success)valid.push(r.data);else for(const x of r.error.issues)issues.push({row,field:String(x.path[0]??''),message:x.message});});
        if(issues.length)return json({error:`${new Set(issues.map(x=>x.row)).size} of ${data.rows.length} rows have problems. Nothing was saved.`,code:'invalid_rows',issues:issues.slice(0,200)},400);
        if(data.dryRun)return json({valid:valid.length});
        // Never seed invented prices: every offer comes from the uploaded or typed row.
        const statements:Statement[]=[];for(const p of valid){statements.push({sql:'INSERT INTO publishers (domain,title,category,language,country,authority,dr,traffic,referring_domains,traffic_top,all_traffic_top,all_traffic,monthly_min,updated_at,metrics_source,niches) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(domain) DO UPDATE SET title=excluded.title,category=excluded.category,language=excluded.language,country=excluded.country,authority=excluded.authority,dr=excluded.dr,traffic=excluded.traffic,referring_domains=excluded.referring_domains,traffic_top=excluded.traffic_top,all_traffic_top=excluded.all_traffic_top,all_traffic=excluded.all_traffic,monthly_min=excluded.monthly_min,updated_at=excluded.updated_at,metrics_source=excluded.metrics_source,niches=excluded.niches',args:[p.domain,p.title,p.category,p.language,p.country,p.authority,p.dr,p.traffic,p.referring_domains,p.traffic_top,p.all_traffic_top,p.all_traffic,p.monthly_min,now(),p.metrics_source,p.niches]},{sql:'INSERT INTO offers (id,domain,marketplace,price,type,follow,sponsored,restricted,url,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(domain,marketplace,type) DO UPDATE SET price=excluded.price,follow=excluded.follow,sponsored=excluded.sponsored,restricted=excluded.restricted,url=excluded.url,active=1,updated_at=excluded.updated_at',args:[id(),p.domain,p.marketplace,p.price,p.type,p.follow,p.sponsored,p.restricted||(p.niches?1:0),p.url,now()]})}await db.batch(statements);return json({imported:valid.length});
      }
      if(path==='/api/admin/inventory/export'&&method==='GET'){
        const rows=await db.all('SELECT o.domain,o.marketplace,o.price,o.type,p.title,p.category,p.language,p.country,p.authority,p.dr,p.traffic,p.referring_domains,p.traffic_top,p.all_traffic_top,p.all_traffic,p.monthly_min,o.follow,o.sponsored,o.restricted,p.niches,o.url,p.metrics_source FROM offers o JOIN publishers p ON p.domain=o.domain WHERE o.active=1 ORDER BY o.domain,o.marketplace,o.type');
        const csv=[inventoryColumns.join(','),...rows.map(r=>inventoryColumns.map(c=>csvCell(r[c])).join(','))].join('\r\n');
        return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="inventory.csv"','Cache-Control':'no-store'}});
      }
      // Removing a publisher hides its offers from Marketplaces and Price Finder; existing orders keep their offer.
      const publisherMatch=path.match(/^\/api\/admin\/publishers\/([^/]+)$/);
      if(publisherMatch&&method==='DELETE'){const d=normalizeDomain(decodeURIComponent(publisherMatch[1]));if(!d||!await db.run('UPDATE offers SET active=0 WHERE domain=? AND active=1',[d]))throw new ApiError(404,'Publisher not found in the marketplace.');return json({ok:true});}
      if(path==='/api/admin/settings'){
        if(method==='GET')return json(await settings());
        if(method==='PUT'){const d=await body(request,z.object({markup:z.coerce.number().min(0,'The markup cannot be negative.').max(500,'Use a markup of 500% or less.'),scanners:z.boolean()}));await saveSettings(db,{markup:Math.round(d.markup*100)/100,scanners:d.scanners});return json(await loadSettings(db));}
      }
      if(path==='/api/admin/orders'&&method==='GET')return json({rows:await db.all('SELECT o.*,u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC')});
      if(path==='/api/admin/quotes'&&method==='GET')return json({rows:await db.all('SELECT q.*,u.email FROM quote_requests q JOIN users u ON u.id=q.user_id ORDER BY q.created_at DESC')});
      const quoteMatch=path.match(/^\/api\/admin\/quotes\/([^/]+)$/);if(quoteMatch&&method==='PATCH'){const d=await body(request,z.object({status:z.enum(['pending','checking','quoted','unavailable']),price:z.number().min(0).max(1000000).nullable()}));if(d.status==='quoted'&&d.price===null)throw new ApiError(400,'A price is required for a quote.');if(!await db.run('UPDATE quote_requests SET status=?,price=?,updated_at=? WHERE id=?',[d.status,d.price,now(),quoteMatch[1]]))throw new ApiError(404,'Request not found.');return json({ok:true});}
      if(path==='/api/admin/requests'&&method==='GET')return json({rows:await db.all('SELECT r.*,u.email FROM support_requests r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC')});
      const supportMatch=path.match(/^\/api\/admin\/requests\/([^/]+)$/);if(supportMatch){if(method==='GET')return json({messages:await db.all('SELECT m.*,u.name FROM messages m JOIN users u ON u.id=m.user_id WHERE request_id=? ORDER BY created_at',[supportMatch[1]])});if(method==='POST'){const d=await body(request,z.object({message:z.string().min(1).max(10000)}));if(!await db.first('SELECT id FROM support_requests WHERE id=?',[supportMatch[1]]))throw new ApiError(404,'Request not found.');await db.run('INSERT INTO messages VALUES (?,?,?,?,?)',[id(),supportMatch[1],user.id,d.message,now()]);return json({ok:true});}}
      const updateOrder=path.match(/^\/api\/admin\/orders\/([^/]+)$/);if(updateOrder&&method==='PATCH'){const d=await body(request,z.object({status:z.enum(['in_progress','published']),placement_url:z.union([publicUrl,z.literal('')]).default('')}));const order=await db.first('SELECT * FROM orders WHERE id=?',[updateOrder[1]]);if(!order||!['paid','in_progress'].includes(order.status))throw new ApiError(409,'Only paid orders can enter fulfillment.');if(d.status==='published'&&!d.placement_url)throw new ApiError(400,'A published placement URL is required.');await db.run('UPDATE orders SET status=?,placement_url=? WHERE id=?',[d.status,d.placement_url,order.id]);return json({ok:true});}
    }
    throw new ApiError(404,'API route not found.');
  }catch(error){if(error instanceof ApiError)return json({error:error.message,code:error.code},error.status);console.error('API failure',error instanceof Error?error.message:'Unknown error');return json({error:'The server could not complete this request. Please try again.'},500);}
}

