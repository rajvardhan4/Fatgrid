import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openTestDatabase as openDatabase} from './database-fixture';
import {api} from '../server/api';
test('admin user directory denies members and excludes authentication secrets',async()=>{
 const db= await openDatabase(':memory:');
 const call=async(path:string,cookie='',body?:unknown)=>api(new Request('https://app.example/api'+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),db,{AUTH_MODE:'local',APP_ORIGIN:'https://app.example'},async()=>new Response(''));
 try{
  const response=await call('/auth/register','',{email:'admin-test@example.com',password:'safe-fixture-pass-123!',name:'Owner'}),cookie=response.headers.get('set-cookie')!.split(';')[0];
  const uid=(await response.json()).user.id;
  assert.equal((await call('/admin/users')).status,401);
  assert.equal((await call('/admin/users',cookie)).status,403);
  assert.equal((await call('/admin/users/'+uid,cookie)).status,403);
  await db.run("UPDATE users SET role='admin' WHERE id=?",[uid]);
  const users=await (await call('/admin/users?search=admin-test',cookie)).json();assert.equal(users.total,1);assert.equal(users.rows[0].email,'admin-test@example.com');assert.equal('password_hash' in users.rows[0],false);
  const detail=await (await call('/admin/users/'+uid,cookie)).json();assert.equal(detail.account.id,uid);assert.equal('password_hash' in detail.account,false);assert.equal('sessions' in detail.collections,false);
  assert.equal((await call('/admin/users/missing',cookie)).status,404);
 }finally{db.close()}
});
