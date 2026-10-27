import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {libsqlDatabase,migrateRemote} from '../server/remote-db';
import {vercelApi} from '../server/vercel-api';
import {api} from '../server/api';

test('Vercel reports missing persistent storage without pretending the database is healthy',async()=>{
 const session=await vercelApi(new Request('https://app.example/api/session'),{});assert.equal(session.status,200);const value=await session.json();assert.equal(value.databaseConfigured,false);assert.equal(value.user,null);assert.equal(value.providers.scheduling,false);assert.match(value.setupRequired,/MYSQL_URL/);
 const health=await vercelApi(new Request('https://app.example/api/health'),{});assert.equal(health.status,503);assert.equal((await health.json()).code,'database_not_configured');
 const register=await vercelApi(new Request('https://app.example/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),{});assert.equal(register.status,503);
});
test('libSQL migrations are idempotent, shared auth works, and failed SQL batches roll back',async()=>{
 const client=createClient({url:'file::memory:',intMode:'number'});
 try{
  await migrateRemote(client);await migrateRemote(client);const db=libsqlDatabase(client);
  const count=await db.first('SELECT COUNT(*) AS n FROM _migrations');assert.equal(count!.n,5);
  const response=await api(new Request('https://app.example/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'vercel@example.test',password:'fixture-password-123!'})}),db,{AUTH_MODE:'local',APP_ORIGIN:'https://app.example'},async()=>new Response(''));
  assert.equal(response.status,200);assert.match(response.headers.get('set-cookie')||'',/Secure/);
  const user=(await db.first('SELECT * FROM users'))!;
  await assert.rejects(()=>db.batch([{sql:'UPDATE users SET units=0 WHERE id=?',args:[user.id]},{sql:'INSERT INTO nonexistent_table VALUES (1)'}]));
  assert.equal((await db.first('SELECT units FROM users WHERE id=?',[user.id]))!.units,10);
  const session=await api(new Request('https://app.example/api/session',{headers:{Cookie:response.headers.get('set-cookie')!.split(';')[0]}}),db,{AUTH_MODE:'local'},async()=>new Response(''));assert.equal((await session.json()).user.email,'vercel@example.test');
 }finally{client.close()}
});
