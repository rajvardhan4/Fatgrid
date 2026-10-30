import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openTestDatabase as openDatabase} from './database-fixture';
import {api} from '../server/api';
import {customerPrice} from '../server/pricing';
const env={AUTH_MODE:'local' as const,APP_ORIGIN:'http://localhost:3000'};
function caller(db:any,environment:Record<string,string>=env){return async(path:string,method='GET',data?:any,cookie='')=>{const r=await api(new Request('http://localhost:3000/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:3000',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)}),db,environment as any,async()=>new Response(''));const text=await r.text();let value:any=text;try{value=JSON.parse(text)}catch{}return {status:r.status,data:value};};}
async function login(db:any,email:string){const r=await api(new Request('http://localhost:3000/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3000'},body:JSON.stringify({email,password:'pass-word-123'})}),db,env,async()=>new Response(''));return r.headers.get('set-cookie')!.split(';')[0];}

test('customer price adds the markup and rounds up to whole dollars',()=>{
 assert.equal(customerPrice(100,50),150);assert.equal(customerPrice(15,50),23);assert.equal(customerPrice(6,50),9);
 assert.equal(customerPrice(10.5,0),10.5);assert.equal(customerPrice(null,50),null);
});

test('scanners stay hidden unless the server switches them on',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db);
 try{
  const admin=await login(db,'boss@example.com'),member=await login(db,'buyer@example.com');
  await db.run("UPDATE users SET role='admin' WHERE email='boss@example.com'");
  assert.equal((await call('/session','GET',undefined,member)).data.features.scanners,false);
  for(const [path,method,data] of [['/scans','POST',{kind:'google',query:'x'}],['/monitor-groups','GET',undefined],['/monitors','GET',undefined],['/backlinks/lookup','POST',{domain:'a.com'}]] as const){
   const r=await call(path,method,data,member);assert.equal(r.status,404,path);assert.equal(r.data.code,'feature_disabled');
  }
  assert.equal((await call('/scans','GET',undefined,member)).status,200);
  // The admin settings no longer switch scanners on, even if asked to.
  assert.deepEqual((await call('/admin/settings','PUT',{markup:0,scanners:true},admin)).data,{markup:0});
  await db.run("INSERT INTO app_settings (key,value) VALUES ('scanners','1')");
  assert.equal((await call('/session','GET',undefined,member)).data.features.scanners,false);
  const on=caller(db,{...env,FEATURE_SCANNERS:'1'});
  assert.equal((await on('/session','GET',undefined,member)).data.features.scanners,true);
  assert.equal((await on('/scans','POST',{kind:'google',query:'x'},member)).data.code,'provider_unavailable');
  assert.equal((await on('/monitor-groups','GET',undefined,member)).status,200);
 }finally{db.close()}
});

test('a markup is charged everywhere customers see a price, and the source stays private',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db);
 try{
  const admin=await login(db,'boss@example.com'),member=await login(db,'buyer@example.com');
  await db.run("UPDATE users SET role='admin' WHERE email='boss@example.com'");
  await call('/admin/inventory','POST',{rows:[{domain:'big.com',marketplace:'Seller X',price:100,url:'https://seller-x.com/big'},{domain:'small.com',marketplace:'Seller Y',price:15}]},admin);
  await call('/admin/demo','POST',{action:'load'},admin);
  // Without a markup, nothing changes.
  assert.equal((await call('/offers?domain=big.com','GET',undefined,member)).data.offers[0].marketplace,'Seller X');
  assert.equal((await call('/admin/settings','PUT',{markup:-5},admin)).status,400);
  assert.equal((await call('/admin/settings','PUT',{markup:50},member)).status,403);
  assert.deepEqual((await call('/admin/settings','PUT',{markup:50},admin)).data,{markup:50});
  assert.equal((await call('/admin/settings','GET',undefined,admin)).data.markup,50);
  const list=(await call('/inventory?type=All&q=.com&size=100','GET',undefined,member)).data.rows;
  const big=list.find((r:any)=>r.domain==='big.com'),small=list.find((r:any)=>r.domain==='small.com');
  assert.equal(big.price,150);assert.equal(small.price,23);assert.equal('cost' in big,false);
  const filtered=(await call('/inventory?type=All&minPrice=140&maxPrice=160','GET',undefined,member)).data.rows.map((r:any)=>r.domain);
  assert.ok(filtered.includes('big.com'));assert.ok(!filtered.includes('small.com'));
  const offer=(await call('/offers?domain=big.com','GET',undefined,member)).data.offers[0];
  assert.deepEqual([offer.price,offer.marketplace,offer.url,'cost' in offer],[150,'The Sponsored Post','',false]);
  const adminOffer=(await call('/offers?domain=big.com','GET',undefined,admin)).data.offers[0];
  assert.deepEqual([adminOffer.price,adminOffer.cost,adminOffer.marketplace],[150,100,'Seller X']);
  assert.equal((await call('/offers?domain=techpulse.example','GET',undefined,member)).data.offers[0].marketplace,'Demo sample');
  assert.deepEqual((await call('/inventory/options','GET',undefined,member)).data.marketplaces,[]);
  assert.ok((await call('/inventory/options','GET',undefined,admin)).data.marketplaces.length>0);
  const check=(await call('/price-check','POST',{text:'big.com $200'},member)).data.rows[0];
  assert.equal(check.price,150);assert.equal(check.gap,50);
  const csv=(await call('/export','POST',{domains:['big.com']},member)).data;assert.match(csv.split('\r\n')[1],/^"big\.com","150"/);
  assert.equal((await call('/orders','POST',{offer_id:offer.id,content:'Article content long enough.',target_url:'https://buyer.com/',anchor:'buyer'},member)).status,201);
  const mine=(await call('/orders','GET',undefined,member)).data.rows[0];
  assert.deepEqual([mine.price,mine.marketplace,'cost' in mine],[150,'The Sponsored Post',false]);
  const all=(await call('/admin/orders','GET',undefined,admin)).data.rows[0];
  assert.deepEqual([all.price,all.cost,all.marketplace],[150,100,'Seller X']);
 }finally{db.close()}
});
