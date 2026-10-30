import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openTestDatabase as openDatabase} from './database-fixture';
import {api} from '../server/api';
import {parseNiches} from '../shared/domain';
import {countryCode,flag} from '../shared/countries';
const env={AUTH_MODE:'local' as const,APP_ORIGIN:'http://localhost:3000'};
function caller(db:any){return async(path:string,method='GET',data?:any,cookie='')=>{const r=await api(new Request('http://localhost:3000/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:3000',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)}),db,env,async()=>new Response(''));return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||''};};}

test('niche lists are normalized and country names map to flags',()=>{
 assert.equal(parseNiches('Gambling; CBD | crypto, crypto, unknown'),'casino,cbd,crypto');
 assert.equal(parseNiches(''),'');
 assert.equal(countryCode('United Kingdom'),'GB');assert.equal(countryCode('in'),'IN');assert.equal(countryCode('Atlantis'),'');
 assert.equal(flag('India'),'\u{1F1EE}\u{1F1F3}');assert.equal(flag(''),'');
});

test('restricted niches flow from CSV import and publisher listings into the marketplace',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db);
 try{
  const admin=(await call('/auth/register','POST',{email:'admin@example.com',password:'admin-pass-123'})).cookie;
  await db.run("UPDATE users SET role='admin' WHERE email='admin@example.com'");
  assert.equal((await call('/admin/inventory','POST',{rows:[{domain:'imported.com',marketplace:'M',price:40,niches:'Gambling; CBD',traffic_top:'1200',all_traffic_top:'5400',monthly_min:'300'}]},admin)).status,200);
  let row=(await call('/inventory?type=All')).data.rows[0];
  assert.equal(row.niches,'casino,cbd');assert.equal(row.restricted,1);assert.equal(row.traffic_top,1200);assert.equal(row.monthly_min,300);assert.equal(row.types,'Guest Post');
  await call('/submissions','POST',{domain:'listed.com',guest_post_price:50,contact_name:'A',contact_email:'a@listed.com',niches:['crypto','dating','bogus']});
  const sub=(await call('/admin/submissions','GET',undefined,admin)).data.rows[0];
  assert.equal(sub.niches,'crypto,dating');assert.equal(sub.restricted,1);
  await call('/admin/submissions/'+sub.id,'PATCH',{action:'approve'},admin);
  row=(await call('/inventory?q=listed.com&type=All')).data.rows[0];
  assert.equal(row.niches,'crypto,dating');assert.equal(row.restricted,1);
  // Clicking a niche icon filters to publishers that accept it.
  const by=async(n:string)=>(await call('/inventory?type=All&niche='+n)).data.rows.map((r:any)=>r.domain).sort();
  assert.deepEqual(await by('cbd'),['imported.com']);assert.deepEqual(await by('crypto'),['listed.com']);assert.deepEqual(await by('forex'),[]);
  assert.equal((await call('/inventory?type=All&niche=x%27')).data.rows.length,2);
 }finally{db.close()}
});
