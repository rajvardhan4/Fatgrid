import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openTestDatabase as openDatabase} from './database-fixture';
import {api} from '../server/api';
import {alertLostLinks} from '../server/monitoring';
import {sha} from '../server/auth';
const base={AUTH_MODE:'local' as const,APP_ORIGIN:'http://localhost:3000'};
const page=async()=>new Response('<html></html>',{headers:{'content-type':'text/html'}});
function caller(db:any,env:Record<string,any>=base){return async(path:string,method='GET',data?:any,cookie='',extra:Record<string,string>={})=>{const r=await api(new Request('http://localhost:3000/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:3000',Cookie:cookie,...extra},body:data===undefined?undefined:JSON.stringify(data)}),db,env,page);const value=r.headers.get('content-type')?.includes('json')?await r.json():await r.text();return {status:r.status,data:value,cookie:r.headers.get('set-cookie')?.split(';')[0]||'',location:r.headers.get('location')||''};};}
async function register(call:any,email:string,password='first-pass-123'){const r=await call('/auth/register','POST',{email,password,name:email.split('@')[0]});assert.equal(r.status,200);return r.cookie as string;}
// Replace global fetch for provider calls (Resend, Google) and restore it afterwards.
async function withFetch(handler:(url:string,init?:RequestInit)=>Response|Promise<Response>,fn:()=>Promise<void>){const original=globalThis.fetch;globalThis.fetch=(async(input:any,init?:RequestInit)=>handler(String(input),init)) as typeof fetch;try{await fn()}finally{globalThis.fetch=original}}

test('password change requires the current password and signs out other sessions',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db);
 try{
  const cookie=await register(call,'pw@example.com');
  assert.equal((await call('/session','GET',undefined,cookie)).data.user.has_password,true);
  assert.equal((await call('/account/password','POST',{current_password:'wrong-pass-000',new_password:'second-pass-456'},cookie)).status,400);
  const changed=await call('/account/password','POST',{current_password:'first-pass-123',new_password:'second-pass-456'},cookie);
  assert.equal(changed.status,200);assert.ok(changed.cookie);
  assert.equal((await call('/session','GET',undefined,cookie)).data.user,null);
  assert.equal((await call('/session','GET',undefined,changed.cookie)).data.user.email,'pw@example.com');
  assert.equal((await call('/auth/login','POST',{email:'pw@example.com',password:'first-pass-123'})).status,401);
  assert.equal((await call('/auth/login','POST',{email:'pw@example.com',password:'second-pass-456'})).status,200);
 }finally{db.close()}
});

test('password reset emails a single-use, expiring link without revealing accounts',async()=>{
 const db=await openDatabase(':memory:');
 try{
  assert.equal((await caller(db)('/auth/forgot','POST',{email:'x@example.com'})).status,503);
  const call=caller(db,{...base,RESEND_API_KEY:'re_test',EMAIL_FROM:'FatGrid <no-reply@example.com>'}),sent:any[]=[];
  const old=await register(call,'reset@example.com');
  await withFetch((url,init)=>{assert.equal(url,'https://api.resend.com/emails');sent.push(JSON.parse(String(init!.body)));return Response.json({id:'1'})},async()=>{
   assert.equal((await call('/auth/forgot','POST',{email:'nobody@example.com'})).status,200);
   assert.equal(sent.length,0);
   assert.equal((await call('/auth/forgot','POST',{email:'Reset@Example.com'})).status,200);
  });
  assert.equal(sent.length,1);assert.deepEqual(sent[0].to,['reset@example.com']);
  const token=sent[0].text.match(/token=([0-9a-f]{64})/)[1];
  assert.equal((await call('/auth/reset','POST',{token:'0'.repeat(64),password:'new-pass-789'})).status,400);
  const reset=await call('/auth/reset','POST',{token,password:'new-pass-789'});
  assert.equal(reset.status,200);assert.ok(reset.cookie);
  assert.equal((await call('/auth/reset','POST',{token,password:'another-pass-000'})).status,400);
  assert.equal((await call('/session','GET',undefined,old)).data.user,null);
  assert.equal((await call('/auth/login','POST',{email:'reset@example.com',password:'new-pass-789'})).status,200);
  await db.run('INSERT INTO password_resets (token_hash,user_id,expires_at,used) SELECT ?,id,?,0 FROM users',[await sha('e'.repeat(64)),Date.now()-1]);
  assert.equal((await call('/auth/reset','POST',{token:'e'.repeat(64),password:'new-pass-789'})).status,400);
 }finally{db.close()}
});

test('shared projects: viewers read, editors change domains, only the owner manages members',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db);
 try{
  const a=await register(call,'owner@example.com'),b=await register(call,'member@example.com'),c=await register(call,'outsider@example.com');
  const pid=(await call('/projects','POST',{name:'Shared campaign',domain:'mysite.com'},a)).data.id;
  await call(`/projects/${pid}/domains`,'POST',{text:'one.com\ntwo.com'},a);
  assert.equal((await call(`/projects/${pid}/domains`,'GET',undefined,b)).status,404);
  assert.equal((await call(`/projects/${pid}/members`,'POST',{email:'missing@example.com',role:'viewer'},a)).status,404);
  assert.equal((await call(`/projects/${pid}/members`,'POST',{email:'owner@example.com',role:'viewer'},a)).status,400);
  assert.equal((await call(`/projects/${pid}/members`,'POST',{email:'Member@Example.com',role:'viewer'},a)).status,201);
  const listed=(await call('/projects','GET',undefined,b)).data.rows;
  assert.equal(listed.length,1);assert.equal(listed[0].role,'viewer');assert.equal(listed[0].owner_email,'owner@example.com');assert.equal(listed[0].domain_count,2);
  const domains=(await call(`/projects/${pid}/domains`,'GET',undefined,b)).data.rows;assert.equal(domains.length,2);
  assert.equal((await call(`/projects/${pid}/domains`,'POST',{text:'three.com'},b)).status,403);
  assert.equal((await call('/project-domains/'+domains[0].id,'PATCH',{status:'contacted',notes:'x'},b)).status,403);
  assert.equal((await call('/project-domains/'+domains[0].id,'PATCH',{status:'contacted',notes:'x'},c)).status,404);
  assert.equal((await call(`/projects/${pid}`,'DELETE',undefined,b)).status,403);
  assert.equal((await call('/decisions','POST',{domain:'four.com',project_id:pid,decision:'yes'},b)).status,403);
  assert.equal((await call(`/projects/${pid}/members`,'POST',{email:'member@example.com',role:'editor'},a)).status,201);
  assert.equal((await call(`/projects/${pid}/domains`,'POST',{text:'three.com'},b)).status,200);
  assert.equal((await call('/project-domains/'+domains[0].id,'PATCH',{status:'contacted',notes:'Editor note'},b)).status,200);
  assert.equal((await call('/decisions','POST',{domain:'four.com',project_id:pid,decision:'yes'},b)).status,200);
  assert.equal((await call(`/projects/${pid}/domains`,'GET',undefined,a)).data.rows.length,4);
  assert.equal((await call(`/projects/${pid}/members`,'POST',{email:'outsider@example.com',role:'viewer'},b)).status,403);
  assert.equal((await call(`/projects/${pid}`,'PATCH',{name:'Renamed'},b)).status,403);
  const members=(await call(`/projects/${pid}/members`,'GET',undefined,b)).data;
  assert.equal(members.role,'editor');assert.deepEqual(members.rows.map((m:any)=>m.role),['owner','editor']);
  assert.equal((await call('/projects','POST',{name:'B own project'},b)).status,201);
  const bid=members.rows[1].id;
  assert.equal((await call(`/projects/${pid}/members/${bid}`,'DELETE',undefined,c)).status,404);
  assert.equal((await call(`/projects/${pid}/members/${bid}`,'DELETE',undefined,b)).status,200);
  assert.equal((await call(`/projects/${pid}/domains`,'GET',undefined,b)).status,404);
  assert.equal((await call('/projects','GET',undefined,c)).data.rows.length,0);
 }finally{db.close()}
});

test('Google sign-in checks state, requires a verified email and reuses the account',async()=>{
 const db=await openDatabase(':memory:'),env={...base,GOOGLE_CLIENT_ID:'client-id',GOOGLE_CLIENT_SECRET:'client-secret'},call=caller(db,env);
 try{
  assert.equal((await caller(db)('/auth/google/start')).status,503);
  assert.equal((await caller(db)('/session')).data.providers.googleAuth,false);
  assert.equal((await call('/session')).data.providers.googleAuth,true);
  const start=await call('/auth/google/start');
  assert.equal(start.status,302);assert.match(start.location,/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  const state=new URL(start.location).searchParams.get('state')!;assert.equal(start.cookie,'fg_oauth='+state);
  assert.equal(new URL(start.location).searchParams.get('redirect_uri'),'http://localhost:3000/api/auth/google/callback/');
  assert.equal((await call(`/auth/google/callback?code=abc&state=${state}`,'GET',undefined,'fg_oauth=other')).location,'http://localhost:3000/auth/login/?error=google');
  let verified=true;
  await withFetch(url=>url.startsWith('https://oauth2.googleapis.com/token')?Response.json({access_token:'at'}):Response.json({email:'G.User@Example.com',email_verified:verified,name:'G User'}),async()=>{
   const first=await call(`/auth/google/callback?code=abc&state=${state}`,'GET',undefined,start.cookie);
   assert.equal(first.status,302);assert.equal(first.location,'http://localhost:3000/');
   const user=(await call('/session','GET',undefined,first.cookie)).data.user;
   assert.equal(user.email,'g.user@example.com');assert.equal(user.has_password,false);assert.equal(user.role,'member');
   const second=await call(`/auth/google/callback?code=def&state=${state}`,'GET',undefined,start.cookie);
   assert.equal((await call('/session','GET',undefined,second.cookie)).data.user.id,user.id);
   assert.equal((await call('/account/password','POST',{new_password:'set-later-123'},second.cookie)).status,200);
   verified=false;
   assert.equal((await call(`/auth/google/callback?code=ghi&state=${state}`,'GET',undefined,start.cookie)).location,'http://localhost:3000/auth/login/?error=google_unverified');
  });
  assert.equal((await db.first('SELECT COUNT(*) AS n FROM users'))!.n,1);
 }finally{db.close()}
});

test('scheduler tick accepts Vercel Cron GET only with the secret',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db,{...base,CRON_SECRET:'cron-secret-value'});
 try{
  assert.equal((await call('/internal/tick')).status,401);
  assert.equal((await call('/internal/tick','GET',undefined,'',{Authorization:'Bearer wrong'})).status,401);
  const ok=await call('/internal/tick','GET',undefined,'',{Authorization:'Bearer cron-secret-value'});
  assert.equal(ok.status,200);assert.equal(ok.data.ok,true);
 }finally{db.close()}
});

test('backlink alerts email only links that stopped being live, and respect the opt-out',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db),env={...base,RESEND_API_KEY:'re_test',EMAIL_FROM:'alerts@example.com'},sent:any[]=[];
 try{
  const cookie=await register(call,'alerts@example.com');const uid=(await call('/session','GET',undefined,cookie)).data.user.id;
  const g={user_id:uid,name:'October placements'};
  const before=[{source:'https://a.com/x',links:[{target:'mysite.com',status:'live'},{target:'blog.mysite.com',status:'nofollow'}]},{source:'https://b.com/y',links:[{target:'mysite.com',status:'live'}]}];
  const after=[{source:'https://a.com/x',links:[{target:'mysite.com',status:'missing'},{target:'blog.mysite.com',status:'missing'}]},{source:'https://b.com/y',links:[],error:'HTTP 500'}];
  await withFetch((_url,init)=>{sent.push(JSON.parse(String(init!.body)));return Response.json({id:'1'})},async()=>{
   assert.equal(await alertLostLinks(db,{...base},g,before,after),0);
   assert.equal(await alertLostLinks(db,env,g,before,before),0);
   assert.equal(await alertLostLinks(db,env,g,before,after),2);
   await call('/preferences','POST',{key:'emailAlerts',value:false},cookie);
   assert.equal(await alertLostLinks(db,env,g,before,after),0);
  });
  assert.equal(sent.length,1);assert.deepEqual(sent[0].to,['alerts@example.com']);
  assert.match(sent[0].text,/https:\/\/a\.com\/x → mysite\.com: missing/);assert.match(sent[0].text,/https:\/\/b\.com\/y → mysite\.com: page unreachable/);
  assert.doesNotMatch(sent[0].text,/blog\.mysite\.com/);
 }finally{db.close()}
});
