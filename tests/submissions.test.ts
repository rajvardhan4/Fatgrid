import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openTestDatabase as openDatabase} from './database-fixture';
import {api} from '../server/api';
const env={AUTH_MODE:'local' as const,APP_ORIGIN:'http://localhost:3000'};
function caller(db:any){return async(path:string,method='GET',data?:any,cookie='',ip='203.0.113.7')=>{const r=await api(new Request('http://localhost:3000/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:3000',Cookie:cookie,'x-client-ip':ip},body:data===undefined?undefined:JSON.stringify(data)}),db,env,async()=>new Response(''));return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||''};};}
const listing={domain:'https://www.Publisher-Site.com/blog',title:'Publisher Site',category:'Technology',country:'India',language:'English',guest_post_price:'120',link_insertion_price:80,follow:'dofollow',sponsored:true,restricted:false,sample_url:'https://publisher-site.com/sample-post',contact_name:'Asha',contact_email:'Owner@Publisher-Site.com',notes:'Fast turnaround'};

test('publishers submit listings publicly; invalid, bot and flood submissions are not stored',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db);
 try{
  assert.equal((await call('/submissions','POST',{...listing,guest_post_price:'',link_insertion_price:null})).status,400);
  assert.equal((await call('/submissions','POST',{...listing,domain:'not a domain'})).status,400);
  assert.equal((await call('/submissions','POST',{...listing,sample_url:'http://127.0.0.1/x'})).status,400);
  assert.equal((await call('/submissions','POST',{...listing,contact_email:'nope'})).status,400);
  assert.equal((await call('/submissions','POST',{...listing,website:'spam.example'})).status,201);
  assert.equal((await db.first('SELECT COUNT(*) AS n FROM publisher_submissions'))!.n,0);
  const r=await call('/submissions','POST',listing,'','198.51.100.1');assert.equal(r.status,201);
  const row=(await db.first('SELECT * FROM publisher_submissions'))!;
  assert.equal(row.domain,'publisher-site.com');assert.equal(row.contact_email,'owner@publisher-site.com');assert.equal(row.guest_post_price,120);assert.equal(row.link_insertion_price,80);assert.equal(row.status,'pending');assert.equal(row.sponsored,1);
  for(let i=0;i<5;i++)await call('/submissions','POST',{...listing,domain:`site${i}.com`},'','192.0.2.9');
  assert.equal((await call('/submissions','POST',{...listing,domain:'site6.com'},'','192.0.2.9')).status,429);
  assert.equal((await call('/inventory')).data.total,0);
 }finally{db.close()}
});

test('only admins review submissions; approval lists offers, keeps existing metrics, and cannot repeat',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db);
 try{
  const admin=(await call('/auth/register','POST',{email:'admin@example.com',password:'admin-pass-123'})).cookie;
  const member=(await call('/auth/register','POST',{email:'member@example.com',password:'member-pass-123'})).cookie;
  await db.run("UPDATE users SET role='admin' WHERE email='admin@example.com'");
  await call('/submissions','POST',listing);
  await call('/submissions','POST',{...listing,domain:'spammy.com',guest_post_price:5,link_insertion_price:null});
  assert.equal((await call('/admin/submissions','GET',undefined,member)).status,403);
  assert.equal((await call('/admin/submissions')).status,401);
  const rows=(await call('/admin/submissions','GET',undefined,admin)).data.rows;
  assert.equal(rows.length,2);assert.equal((await call('/admin/status','GET',undefined,admin)).data.submissions,2);
  const good=rows.find((r:any)=>r.domain==='publisher-site.com'),spam=rows.find((r:any)=>r.domain==='spammy.com');
  // An existing CSV-imported publisher keeps its metrics when a direct offer is approved.
  await call('/admin/inventory','POST',{rows:[{domain:'publisher-site.com',marketplace:'Marketplace A',price:150,title:'Imported title',dr:61,traffic:42000}]},admin);
  assert.equal((await call('/admin/submissions/'+good.id,'PATCH',{action:'approve'},member)).status,403);
  assert.equal((await call('/admin/submissions/'+good.id,'PATCH',{action:'approve',note:'Welcome'},admin)).status,200);
  assert.equal((await call('/admin/submissions/'+good.id,'PATCH',{action:'reject'},admin)).status,409);
  assert.equal((await call('/admin/submissions/'+spam.id,'PATCH',{action:'reject',note:'Price looks wrong'},admin)).status,200);
  assert.equal((await call('/admin/submissions/missing','PATCH',{action:'approve'},admin)).status,404);
  const offers=(await call('/offers?domain=publisher-site.com')).data;
  assert.equal(offers.publisher.dr,61);assert.equal(offers.publisher.title,'Imported title');
  assert.deepEqual(offers.offers.map((o:any)=>[o.marketplace,o.type,o.price]),[['Direct from publisher','Link Insertion',80],['Direct from publisher','Guest Post',120],['Marketplace A','Guest Post',150]]);
  assert.equal(offers.offers[0].sponsored,1);assert.equal(offers.offers[0].url,'https://publisher-site.com/sample-post');
  assert.equal((await call('/offers?domain=spammy.com')).data.publisher,null);
  const check=await call('/price-check','POST',{text:'publisher-site.com $150'},member);
  assert.equal(check.data.rows[0].price,80);assert.equal(check.data.rows[0].offers,3);
  const reviewed=(await call('/admin/submissions','GET',undefined,admin)).data.rows;
  assert.deepEqual(reviewed.map((r:any)=>r.status).sort(),['approved','rejected']);
  assert.equal(reviewed.find((r:any)=>r.domain==='spammy.com').review_note,'Price looks wrong');
  assert.equal((await call('/admin/status','GET',undefined,admin)).data.submissions,0);
 }finally{db.close()}
});
