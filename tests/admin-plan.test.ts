import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openTestDatabase as openDatabase} from './database-fixture';
import {api} from '../server/api';
const env={AUTH_MODE:'local' as const,APP_ORIGIN:'http://localhost:3000'};
function caller(db:any){return async(path:string,method='GET',data?:any,cookie='')=>{const r=await api(new Request('http://localhost:3000/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:3000',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)}),db,env,async()=>new Response(''));const text=await r.text();let value:any=text;try{value=JSON.parse(text)}catch{}return {status:r.status,data:value};};}
async function login(db:any,email:string){const r=await api(new Request('http://localhost:3000/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3000'},body:JSON.stringify({email,password:'pass-word-123'})}),db,env,async()=>new Response(''));return r.headers.get('set-cookie')!.split(';')[0];}

test('an admin activates, renews and removes a plan by hand, and it is logged',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db);
 try{
  const admin=await login(db,'boss@example.com'),member=await login(db,'buyer@example.com');
  await db.run("UPDATE users SET role='admin' WHERE email='boss@example.com'");
  const uid=(await call('/session','GET',undefined,member)).data.user.id;
  assert.equal((await call('/admin/users/'+uid,'PATCH',{plan:'pro'},member)).status,403);
  assert.equal((await call('/admin/users/'+uid,'PATCH',{plan:'gold'},admin)).status,400);
  assert.equal((await call('/admin/users/missing','PATCH',{plan:'pro'},admin)).status,404);
  const pro=await call('/admin/users/'+uid,'PATCH',{plan:'pro'},admin);
  assert.equal(pro.status,200);assert.deepEqual([pro.data.account.plan,pro.data.account.units],['pro',10000]);
  const me=(await call('/session','GET',undefined,member)).data.user;assert.deepEqual([me.plan,me.units],['pro',10000]);
  // Renewing the same plan refills the units.
  await db.run('UPDATE users SET units=12 WHERE id=?',[uid]);
  assert.equal((await call('/admin/users/'+uid,'PATCH',{plan:'pro'},admin)).data.account.units,10000);
  assert.equal((await call('/admin/users/'+uid,'PATCH',{plan:'start'},admin)).data.account.units,10);
  const detail=(await call('/admin/users/'+uid,'GET',undefined,admin)).data;
  assert.deepEqual(detail.collections.ledger.filter((r:any)=>r.reason.startsWith('plan ')).map((r:any)=>r.amount).sort((a:number,b:number)=>a-b),[-9990,9988,9990]);
  const activity=(await call('/admin/activity?type=plan&user='+uid,'GET',undefined,admin)).data.rows;
  assert.equal(activity.length,3);assert.ok(activity.every((e:any)=>/^plan (pro|start) by boss@example\.com$/.test(e.a)));
  // Stripe subscribers are changed through Stripe, not by hand.
  await db.run("UPDATE users SET stripe_subscription='sub_1' WHERE id=?",[uid]);
  const blocked=await call('/admin/users/'+uid,'PATCH',{plan:'advanced'},admin);
  assert.deepEqual([blocked.status,blocked.data.code],[409,'stripe_managed']);
  assert.equal((await call('/admin/users/'+uid,'GET',undefined,admin)).data.account.stripe,1);
 }finally{db.close()}
});
