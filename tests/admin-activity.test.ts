import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openTestDatabase as openDatabase} from './database-fixture';
import {api} from '../server/api';
const env={AUTH_MODE:'local' as const,APP_ORIGIN:'http://localhost:3000'};
function caller(db:any){return async(path:string,method='GET',data?:any,cookie='')=>{const r=await api(new Request('http://localhost:3000/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:3000',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)}),db,env,async()=>new Response(''));return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||''};};}

test('admins see every customer, an activity timeline and an overview; members cannot',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db);
 try{
  const admin=(await call('/auth/register','POST',{email:'boss@example.com',password:'boss-pass-123',name:'Boss'})).cookie;
  const asha=(await call('/auth/register','POST',{email:'asha@example.com',password:'asha-pass-123',name:'Asha'})).cookie;
  const ravi=(await call('/auth/register','POST',{email:'ravi@example.com',password:'ravi-pass-123',name:'Ravi'})).cookie;
  await db.run("UPDATE users SET role='admin' WHERE email='boss@example.com'");
  await call('/admin/inventory','POST',{rows:[{domain:'forbes.com',price:150}]},admin);
  await call('/price-check','POST',{text:'forbes.com $200\nwired.com'},asha);
  await call('/projects','POST',{name:'Asha campaign',domain:'asha-site.com'},asha);
  await call('/requests','POST',{subject:'Need help',message:'Hello'},ravi);
  const offer=(await call('/offers?domain=forbes.com')).data.offers[0];
  await call('/orders','POST',{offer_id:offer.id,content:'Article content long enough.',target_url:'https://ravi.com/',anchor:'ravi'},ravi);
  await call('/submissions','POST',{domain:'listed.com',guest_post_price:40,contact_name:'P',contact_email:'p@listed.com'});

  for(const path of ['/admin/overview','/admin/activity'])assert.equal((await call(path,'GET',undefined,asha)).status,403);
  assert.equal((await call('/admin/activity','GET')).status,401);

  const all=(await call('/admin/activity','GET',undefined,admin)).data;
  const kinds=all.rows.map((r:any)=>r.type);
  for(const k of ['signup','job','project','support','order','listing'])assert.ok(kinds.includes(k),'missing '+k);
  assert.ok(all.rows.every((r:any,i:number,a:any[])=>i===0||a[i-1].at>=r.at),'newest first');
  const check=all.rows.find((r:any)=>r.type==='job'&&r.a==='price-check');
  assert.equal(check.email,'asha@example.com');assert.equal(check.c,2);assert.match(check.d,/forbes\.com/);
  const order=all.rows.find((r:any)=>r.type==='order');assert.equal(order.name,'Ravi');assert.equal(order.a,'forbes.com');assert.equal(order.c,150);

  const ashaId=(await call('/admin/users?search=asha','GET',undefined,admin)).data.rows[0].id;
  const mine=(await call('/admin/activity?user='+ashaId,'GET',undefined,admin)).data.rows;
  assert.ok(mine.length>=3&&mine.every((r:any)=>r.email==='asha@example.com'));
  assert.deepEqual([...new Set((await call('/admin/activity?type=signup','GET',undefined,admin)).data.rows.map((r:any)=>r.type))],['signup']);
  assert.ok((await call('/admin/activity?search=ravi','GET',undefined,admin)).data.rows.every((r:any)=>r.email==='ravi@example.com'));
  assert.equal((await call('/admin/activity?type=bogus','GET',undefined,admin)).status,400);

  const o=(await call('/admin/overview','GET',undefined,admin)).data;
  assert.equal(o.users.total,3);assert.equal(o.users.week,3);assert.equal(o.users.activeWeek,1);
  assert.equal(o.usage.priceChecks,1);assert.equal(o.projects,1);assert.equal(o.orders.total,1);assert.equal(o.orders.drafts,1);assert.equal(o.orders.revenue,0);
  assert.equal(o.support.open,1);assert.equal(o.listings.pending,1);assert.equal(o.usage.unitsWeek,2);
  assert.equal(o.topUsers[0].email,'asha@example.com');

  const detail=(await call('/admin/users/'+ashaId,'GET',undefined,admin)).data;
  assert.deepEqual({p:detail.summary.projects,c:detail.summary.priceChecks,u:detail.summary.unitsUsed},{p:1,c:1,u:2});
  assert.ok(detail.summary.lastActive);assert.equal('password_hash' in detail.account,false);
 }finally{db.close()}
});
