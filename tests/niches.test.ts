import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openTestDatabase as openDatabase} from './database-fixture';
import {api} from '../server/api';
import {parseNiches,parseNichePrices} from '../shared/domain';
import {normalizeInventoryRows} from '../shared/inventory-csv';
import {countryCode,countryName,flag} from '../shared/countries';
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
  // Favorites only shows the signed-in account's starred publishers.
  assert.equal((await call('/decisions','POST',{domain:'imported.com',project_id:'',favorite:true},admin)).status,200);
  assert.deepEqual((await call('/inventory?type=All&favorites=1','GET',undefined,admin)).data.rows.map((r:any)=>r.domain),['imported.com']);
  assert.deepEqual((await call('/inventory?type=All&favorites=1')).data.rows,[]);
 }finally{db.close()}
});

test('countries show their full name whether stored as a code or a name',()=>{
 assert.equal(countryName('IN'),'India');assert.equal(countryName('usa'),'United States');assert.equal(countryName('uk'),'United Kingdom');
 assert.equal(countryName('Spain'),'Spain');assert.equal(countryName('Atlantis'),'Atlantis');assert.equal(flag('RU'),flag('Russia'));
});

test('each restricted niche keeps its own price from CSV to the marketplace',async()=>{
 const csv=normalizeInventoryRows([{Publisher:'a.com','Best Price':'$100','Casino Price':'$57','Dating Price':'191','Restricted':'No'}]).rows[0];
 assert.equal(csv.niche_prices,'casino:57,dating:191');assert.equal(csv.niches,'casino,dating');assert.equal(csv.restricted,'1');
 assert.equal(parseNichePrices('Casino: $57; Finance: $1,200; casino: 40'),'casino:40,forex:1200');
 const db=await openDatabase(':memory:'),call=caller(db);
 try{
  const admin=(await call('/auth/register','POST',{email:'admin@example.com',password:'admin-pass-123'})).cookie;
  await db.run("UPDATE users SET role='admin' WHERE email='admin@example.com'");
  assert.equal((await call('/admin/inventory','POST',{rows:[
   {domain:'priced.com',marketplace:'M1',price:100,niche_prices:'Casino: $57; Dating: $191'},
   {domain:'priced.com',marketplace:'M2',price:120,type:'Link Insertion',niche_prices:'casino:50,finance:131'}]},admin)).status,200);
  const row=(await call('/inventory?type=All')).data.rows[0];
  // The table shows each niche's cheapest price across offers, and the niches count as accepted.
  assert.equal(row.niche_prices,'casino:50,dating:191,forex:131');assert.equal(row.niches,'casino,dating,forex');assert.equal(row.restricted,1);
  assert.deepEqual((await call('/inventory?type=All&niche=dating')).data.rows.map((r:any)=>r.domain),['priced.com']);
  const offers=(await call('/offers?domain=priced.com')).data.offers;
  assert.deepEqual(offers.map((o:any)=>o.niche_prices),['casino:57,dating:191','casino:50,forex:131']);
  // Pro customers pay the managed-service markup on niche prices too.
  const pro=(await call('/auth/register','POST',{email:'pro@example.com',password:'pro-pass-1234'})).cookie;
  await db.run("UPDATE users SET plan='pro' WHERE email='pro@example.com'");
  assert.equal((await call('/inventory?type=All','GET',undefined,pro)).data.rows[0].niche_prices,'casino:75,dating:287,forex:197');
 }finally{db.close()}
});
