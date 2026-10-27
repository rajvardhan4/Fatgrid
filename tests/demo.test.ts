import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openTestDatabase as openDatabase} from './database-fixture';
import {api} from '../server/api';
import {demoRows} from '../server/demo';
const env={AUTH_MODE:'local' as const,APP_ORIGIN:'http://localhost:3000'};
function caller(db:any){return async(path:string,method='GET',data?:any,cookie='')=>{const r=await api(new Request('http://localhost:3000/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:3000',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)}),db,env,async()=>new Response(''));return {status:r.status,data:await r.json()};};}

test('demo listings use reserved .example domains with unique names',()=>{
 const rows=demoRows();
 assert.equal(rows.length,40);assert.equal(new Set(rows.map(r=>r.domain)).size,40);
 assert.ok(rows.every(r=>r.domain.endsWith('.example')&&r.price>0&&r.dr>=0&&r.dr<=100));
});

test('admins load and remove clearly marked demo listings that cannot be ordered',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db);
 try{
  const reg=async(email:string)=>{const r=await api(new Request('http://localhost:3000/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3000'},body:JSON.stringify({email,password:'demo-pass-123'})}),db,env,async()=>new Response(''));return r.headers.get('set-cookie')!.split(';')[0];};
  const admin=await reg('admin@example.com'),member=await reg('member@example.com');
  await db.run("UPDATE users SET role='admin' WHERE email='admin@example.com'");
  assert.equal((await call('/admin/demo','POST',{action:'load'},member)).status,403);
  await call('/admin/inventory','POST',{rows:[{domain:'real-site.com',marketplace:'Marketplace A',price:200,dr:50}]},admin);
  assert.equal((await call('/admin/demo','POST',{action:'load'},admin)).data.demo,40);
  assert.equal((await call('/admin/demo','POST',{action:'load'},admin)).data.demo,40);
  assert.equal((await call('/admin/status','GET',undefined,admin)).data.demo,40);
  const all=(await call('/inventory?type=All&size=100')).data;
  assert.equal(all.total,41);
  assert.equal(all.rows.filter((r:any)=>r.metrics_source==='Demo sample').length,40);
  const offers=(await call('/offers?domain=techpulse.example')).data.offers;
  assert.ok(offers.length>=1);assert.ok(offers.every((o:any)=>o.marketplace==='Demo sample'));
  const order=await call('/orders','POST',{offer_id:offers[0].id,content:'This is long enough article content.',target_url:'https://mysite.com/',anchor:'my site'},member);
  assert.equal(order.status,400);assert.match(order.data.error,/demo/i);
  const check=(await call('/price-check','POST',{text:'techpulse.example\nreal-site.com'},member)).data.rows;
  assert.equal(check.find((r:any)=>r.domain==='techpulse.example').metrics_source,'Demo sample');
  assert.equal((await call('/admin/demo','POST',{action:'clear'},admin)).data.demo,0);
  const after=(await call('/inventory?type=All')).data;
  assert.equal(after.total,1);assert.equal(after.rows[0].domain,'real-site.com');
  assert.equal((await db.first("SELECT COUNT(*) AS n FROM publishers WHERE domain LIKE '%.example'"))!.n,0);
 }finally{db.close()}
});
