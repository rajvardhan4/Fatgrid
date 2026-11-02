import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openTestDatabase as openDatabase} from './database-fixture';
import {api} from '../server/api';
import {normalizeInventoryRows,cleanNumber} from '../shared/inventory-csv';
const env={AUTH_MODE:'local' as const,APP_ORIGIN:'http://localhost:3000'};
function caller(db:any){return async(path:string,method='GET',data?:any,cookie='')=>{const r=await api(new Request('http://localhost:3000/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:3000',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)}),db,env,async()=>new Response(''));const text=await r.text();let value:any=text;try{value=JSON.parse(text)}catch{}return {status:r.status,data:value,cookie:r.headers.get('set-cookie')?.split(';')[0]||'',type:r.headers.get('content-type')||''};};}

test('spreadsheet columns and values are recognized',()=>{
 assert.equal(cleanNumber('$1,200'),'1200');assert.equal(cleanNumber('10.12K'),'10120');assert.equal(cleanNumber('1.5M'),'1500000');assert.equal(cleanNumber('abc'),'abc');
 const parsed=normalizeInventoryRows([{'Publisher':'https://www.Example.com/','Best Price':'$1,200','DR':'66','Categories':'Business, Technology','Top Country':'India','Organic (top)':'10.12K','Link Type':'Dofollow','Restricted':'casino, crypto','Type':'guest post','Sponsored':'Yes','Notes':'ignore me'}]);
 assert.deepEqual(parsed.missing,[]);assert.deepEqual(parsed.ignored,['Notes']);
 assert.deepEqual(parsed.rows[0],{domain:'https://www.Example.com/',price:'1200',dr:'66',category:'Business, Technology',country:'India',traffic_top:'10120',follow:'dofollow',niches:'casino, crypto',restricted:'1',type:'Guest Post',sponsored:'1'});
 assert.deepEqual(normalizeInventoryRows([{Site:'a.com',Cost:'5'}]).missing,[]);
 assert.deepEqual(normalizeInventoryRows([{Name:'A'}]).missing,['domain','price']);
});

test('admins check, import, export and remove their own inventory',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db);
 try{
  const admin=(await call('/auth/register','POST',{email:'admin@example.com',password:'admin-pass-123'})).cookie;
  const member=(await call('/auth/register','POST',{email:'member@example.com',password:'member-pass-123'})).cookie;
  await db.run("UPDATE users SET role='admin' WHERE email='admin@example.com'");
  assert.equal((await call('/admin/inventory','POST',{rows:[{domain:'a.com',price:5}]},member)).status,403);
  assert.equal((await call('/admin/inventory/export','GET',undefined,member)).status,403);
  assert.equal((await call('/admin/inventory','POST',{rows:Array.from({length:251},(_,i)=>({domain:`s${i}.com`,price:5}))},admin)).status,400);
  const bad=await call('/admin/inventory','POST',{rows:[{domain:'good.com',price:'10'},{domain:'not a domain',price:'10'},{domain:'zero.com',price:'0'},{domain:'dr.com',price:'9',dr:'150'}]},admin);
  assert.equal(bad.status,400);assert.equal(bad.data.code,'invalid_rows');assert.match(bad.data.error,/3 of 4 rows/);
  assert.deepEqual(bad.data.issues.map((x:any)=>[x.row,x.field]),[[1,'domain'],[2,'price'],[3,'dr']]);
  assert.equal((await call('/admin/status','GET',undefined,admin)).data.offers,0);
  const dry=await call('/admin/inventory','POST',{rows:[{domain:'good.com',price:'10'}],dryRun:true},admin);
  assert.equal(dry.data.valid,1);assert.equal((await call('/admin/status','GET',undefined,admin)).data.offers,0);
  const ok=await call('/admin/inventory','POST',{rows:[{domain:'good.com',price:'10',dr:'',traffic:'',category:'Business, Tech',niches:'casino'},{domain:'other.com',price:'25',marketplace:'Seller X',type:'Link Insertion'}]},admin);
  assert.equal(ok.data.imported,2);
  const good=(await call('/offers?domain=good.com')).data;
  assert.equal(good.offers[0].marketplace,'Own inventory');assert.equal(good.publisher.dr,null);assert.equal(good.publisher.traffic,null);assert.equal(good.offers[0].restricted,1);
  const csv=await call('/admin/inventory/export','GET',undefined,admin);
  assert.match(csv.type,/text\/csv/);const lines=csv.data.split('\r\n');
  assert.equal(lines[0],'domain,marketplace,price,type,title,category,language,country,authority,dr,traffic,referring_domains,traffic_top,all_traffic_top,all_traffic,monthly_min,follow,sponsored,restricted,niches,url,metrics_source');
  assert.equal(lines.length,3);assert.match(lines[1],/^"good\.com","Own inventory","10","Guest Post"/);
  // An order placed before removal keeps working; the publisher just disappears from the marketplace.
  const order=await call('/orders','POST',{offer_id:good.offers[0].id,content:'Article content long enough.',target_url:'https://mysite.com/',anchor:'mysite'},member);
  assert.equal(order.status,201);
  assert.equal((await call('/admin/publishers/good.com','DELETE',undefined,member)).status,403);
  assert.equal((await call('/admin/publishers/good.com','DELETE',undefined,admin)).status,200);
  assert.equal((await call('/admin/publishers/good.com','DELETE',undefined,admin)).status,404);
  assert.equal((await call('/inventory?type=All')).data.total,1);
  assert.equal((await call('/orders','GET',undefined,member)).data.rows[0].domain,'good.com');
  assert.equal((await call('/admin/inventory/export','GET',undefined,admin)).data.split('\r\n').length,2);
  assert.equal((await call('/admin/inventory','POST',{rows:[{domain:'good.com',price:'12'}]},admin)).status,200);
  assert.equal((await call('/offers?domain=good.com')).data.offers[0].price,12);
 }finally{db.close()}
});

test('a full 250-row chunk is saved in three statements, later duplicates winning',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db);
 try{
  const admin=(await call('/auth/register','POST',{email:'admin@example.com',password:'admin-pass-123'})).cookie;
  await db.run("UPDATE users SET role='admin' WHERE email='admin@example.com'");
  const sizes:number[]=[],batch=db.batch.bind(db);(db as any).batch=async(s:any[])=>{sizes.push(s.length);return batch(s)};
  const rows:any[]=Array.from({length:250},(_,i)=>({domain:`site${i%200}.com`,marketplace:i<200?'M1':'M2',price:10+i,dr:String(i%100)}));
  rows[249]={domain:'site0.com',marketplace:'M1',price:999};
  const r=await call('/admin/inventory','POST',{rows},admin);
  assert.equal(r.status,200);assert.deepEqual(sizes,[3]); // upload-order reset, publishers, offers
  const status=(await call('/admin/status','GET',undefined,admin)).data;
  assert.deepEqual([status.publishers,status.offers],[200,249]);
  assert.equal((await db.first("SELECT price FROM offers WHERE domain='site0.com' AND marketplace='M1'"))!.price,999);
 }finally{db.close()}
});

test('admins remove several publishers at once, or everything matching a search',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db);
 try{
  const admin=(await call('/auth/register','POST',{email:'admin@example.com',password:'admin-pass-123'})).cookie;
  const member=(await call('/auth/register','POST',{email:'member@example.com',password:'member-pass-123'})).cookie;
  await db.run("UPDATE users SET role='admin' WHERE email='admin@example.com'");
  await call('/admin/inventory','POST',{rows:['a.com','b.com','c.com','shop-a.net','shop-b.net'].map(domain=>({domain,price:10}))},admin);
  const total=async()=>(await call('/inventory?type=All')).data.total;
  assert.equal((await call('/admin/publishers/remove','POST',{domains:['a.com']},member)).status,403);
  assert.equal((await call('/admin/publishers/remove','POST',{domains:['not a domain']},admin)).status,400);
  assert.deepEqual((await call('/admin/publishers/remove','POST',{domains:['a.com','B.com','a.com','missing.com']},admin)).data,{removed:2});
  assert.equal(await total(),3);
  assert.deepEqual((await call('/admin/publishers/remove','POST',{all:true,q:'shop-'},admin)).data,{removed:2});
  assert.deepEqual((await call('/inventory?type=All')).data.rows.map((r:any)=>r.domain),['c.com']);
  assert.deepEqual((await call('/admin/publishers/remove','POST',{all:true,q:''},admin)).data,{removed:1});
  assert.equal(await total(),0);
 }finally{db.close()}
});

test('the marketplace lists publishers in upload order unless another sort is chosen',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db);
 try{
  const admin=(await call('/auth/register','POST',{email:'admin@example.com',password:'admin-pass-123'})).cookie;
  await db.run("UPDATE users SET role='admin' WHERE email='admin@example.com'");
  const list=async(q='&sort=position')=>(await call('/inventory?type=All'+q)).data.rows.map((r:any)=>r.domain);
  await call('/admin/inventory','POST',{rows:[{domain:'zeta.com',price:30},{domain:'alpha.com',price:10},{domain:'zeta.com',marketplace:'Other',price:20}]},admin);
  await call('/admin/inventory','POST',{rows:[{domain:'mid.com',price:50}]},admin);
  assert.deepEqual(await list(),['zeta.com','alpha.com','mid.com']);
  assert.deepEqual(await list('&sort=domain'),['alpha.com','mid.com','zeta.com']);
  // Re-importing a listed publisher keeps its place; after removal, a new upload sets a new order.
  await call('/admin/inventory','POST',{rows:[{domain:'zeta.com',price:31}]},admin);
  assert.deepEqual(await list(),['zeta.com','alpha.com','mid.com']);
  await call('/admin/publishers/remove','POST',{all:true,q:''},admin);
  await call('/admin/inventory','POST',{rows:[{domain:'mid.com',price:50},{domain:'zeta.com',price:30}]},admin);
  assert.deepEqual(await list(),['mid.com','zeta.com']);
 }finally{db.close()}
});

test('re-importing a publisher replaces its offers instead of piling them up',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db);
 try{
  const admin=(await call('/auth/register','POST',{email:'admin@example.com',password:'admin-pass-123'})).cookie;
  await db.run("UPDATE users SET role='admin' WHERE email='admin@example.com'");
  const markets=async()=>(await call('/offers?domain=big.com')).data.offers.map((o:any)=>o.marketplace).sort();
  const send=(rows:any[],extra:any={})=>call('/admin/inventory','POST',{rows,...extra},admin);
  await send([{domain:'big.com',marketplace:'M1',price:10},{domain:'big.com',marketplace:'M2',price:20},{domain:'other.com',marketplace:'M1',price:5}]);
  const since=async(rows:any[])=>(await send(rows,{dryRun:true})).data.now;
  // A new upload in replace mode leaves only the file's offers for that publisher; other publishers are untouched.
  let s=await since([{domain:'big.com',marketplace:'M3',price:30}]);
  await new Promise(r=>setTimeout(r,5));
  await send([{domain:'big.com',marketplace:'M3',price:30}],{replaceSince:s});
  assert.deepEqual(await markets(),['M3']);
  assert.equal((await call('/offers?domain=other.com')).data.offers.length,1);
  // Two chunks of one upload both keep their offers.
  s=await since([{domain:'big.com',marketplace:'M4',price:40}]);
  await new Promise(r=>setTimeout(r,5));
  await send([{domain:'big.com',marketplace:'M4',price:40}],{replaceSince:s});
  await new Promise(r=>setTimeout(r,5));
  await send([{domain:'big.com',marketplace:'M5',price:50}],{replaceSince:s});
  assert.deepEqual(await markets(),['M4','M5']);
  // Without replace mode, offers are added or updated and the rest stay.
  await send([{domain:'big.com',marketplace:'M6',price:60}]);
  assert.deepEqual(await markets(),['M4','M5','M6']);
 }finally{db.close()}
});
