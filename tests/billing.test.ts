import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openTestDatabase as openDatabase} from './database-fixture';
import {api} from '../server/api';
const base={AUTH_MODE:'local' as const,APP_ORIGIN:'http://localhost:3000'};
const stripe={...base,STRIPE_SECRET_KEY:'sk_test_x',STRIPE_WEBHOOK_SECRET:'whsec_test',STRIPE_PRO_PRICE_ID:'price_pro',STRIPE_ADVANCED_PRICE_ID:'price_adv'};
function caller(db:any,env:Record<string,any>){return async(path:string,method='GET',data?:any,cookie='',headers:Record<string,string>={},raw?:string)=>{const r=await api(new Request('http://localhost:3000/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:3000',Cookie:cookie,...headers},body:raw??(data===undefined?undefined:JSON.stringify(data))}),db,env,async()=>new Response(''));return {status:r.status,data:await r.json()};};}
async function signed(event:any){const raw=JSON.stringify(event),t=Math.floor(Date.now()/1000),key=await crypto.subtle.importKey('raw',new TextEncoder().encode('whsec_test'),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${t}.${raw}`)))].map(b=>b.toString(16).padStart(2,'0')).join('');return {raw,header:`t=${t},v1=${sig}`};}
async function withFetch(handler:(url:string,body:URLSearchParams)=>any,fn:()=>Promise<void>){const original=globalThis.fetch;globalThis.fetch=(async(input:any,init?:RequestInit)=>Response.json(handler(String(input),new URLSearchParams(String(init?.body||''))))) as typeof fetch;try{await fn()}finally{globalThis.fetch=original}}

test('without Stripe keys, plan checkout explains that payments are not set up and charges nothing',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db,base);
 try{
  const reg=await api(new Request('http://localhost:3000/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3000'},body:JSON.stringify({email:'a@example.com',password:'a-pass-1234'})}),db,base,async()=>new Response(''));
  const c=reg.headers.get('set-cookie')!.split(';')[0];
  const r=await call('/billing/checkout','POST',{plan:'pro'},c);
  assert.equal(r.status,503);assert.equal(r.data.code,'provider_unavailable');assert.match(r.data.error,/not set up/);
  assert.equal((await call('/billing/portal','POST',{},c)).status,400);
  assert.equal((await call('/session','GET',undefined,c)).data.providers.billing,false);
 }finally{db.close()}
});

test('Stripe flow: checkout, paid invoice, portal switch and cancellation work on every database',async()=>{
 const db=await openDatabase(':memory:'),call=caller(db,stripe),sent:{url:string,body:URLSearchParams}[]=[];
 try{
  const login=await api(new Request('http://localhost:3000/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3000'},body:JSON.stringify({email:'buyer@example.com',password:'buyer-pass-1'})}),db,stripe,async()=>new Response(''));
  const c=login.headers.get('set-cookie')!.split(';')[0],uid=(await login.json()).user.id;
  await withFetch((url,body)=>{sent.push({url,body});return url.includes('billing_portal')?{url:'https://billing.stripe.com/p/session'}:{id:'cs_1',url:'https://checkout.stripe.com/c/pay/cs_1'}},async()=>{
   assert.equal((await call('/billing/portal','POST',{},c)).status,400);
   const first=await call('/billing/checkout','POST',{plan:'pro'},c);
   assert.equal(first.status,200);assert.equal(first.data.url,'https://checkout.stripe.com/c/pay/cs_1');
   const b=sent[0].body;assert.match(sent[0].url,/checkout\/sessions$/);
   assert.equal(b.get('mode'),'subscription');assert.equal(b.get('line_items[0][price]'),'price_pro');assert.equal(b.get('customer_email'),'buyer@example.com');assert.equal(b.get('client_reference_id'),uid);
   assert.equal(b.get('success_url'),'http://localhost:3000/pricing/?checkout=success');assert.equal(b.get('cancel_url'),'http://localhost:3000/pricing/?checkout=cancelled');
   // Stripe confirms: checkout completed, then the paid invoice grants the plan and units.
   for(const event of [{id:'evt_1',type:'checkout.session.completed',data:{object:{mode:'subscription',customer:'cus_1',subscription:'sub_1',client_reference_id:uid}}},{id:'evt_2',type:'invoice.paid',data:{object:{customer:'cus_1',subscription:'sub_1',lines:{data:[{price:{id:'price_pro'}}]}}}}]){const s=await signed(event);assert.equal((await call('/billing/webhook','POST',undefined,'',{'stripe-signature':s.header},s.raw)).status,200);}
   let me=(await call('/session','GET',undefined,c)).data.user;
   assert.equal(me.plan,'pro');assert.equal(me.units,10000);assert.equal(me.stripe_subscription,'sub_1');
   // A paying customer choosing another plan goes to the portal instead of a second subscription.
   const sw=await call('/billing/checkout','POST',{plan:'advanced'},c);
   assert.equal(sw.data.portal,true);assert.equal(sw.data.url,'https://billing.stripe.com/p/session');
   assert.equal(sent.at(-1)!.body.get('customer'),'cus_1');assert.equal(sent.at(-1)!.body.get('return_url'),'http://localhost:3000/pricing/');
   assert.equal((await call('/billing/portal','POST',{},c)).data.url,'https://billing.stripe.com/p/session');
   let s=await signed({id:'evt_3',type:'customer.subscription.updated',data:{object:{id:'sub_1',status:'active',items:{data:[{price:{id:'price_adv'}}]}}}});
   await call('/billing/webhook','POST',undefined,'',{'stripe-signature':s.header},s.raw);
   assert.equal((await call('/session','GET',undefined,c)).data.user.plan,'advanced');
   s=await signed({id:'evt_4',type:'customer.subscription.deleted',data:{object:{id:'sub_1',status:'canceled'}}});
   assert.equal((await call('/billing/webhook','POST',undefined,'',{'stripe-signature':s.header},s.raw)).status,200);
   me=(await call('/session','GET',undefined,c)).data.user;
   assert.equal(me.plan,'start');assert.equal(me.units,10);assert.equal(me.stripe_subscription,null);
   // Back on the free plan, the next checkout reuses the same Stripe customer.
   await call('/billing/checkout','POST',{plan:'pro'},c);
   assert.equal(sent.at(-1)!.body.get('customer'),'cus_1');assert.equal(sent.at(-1)!.body.get('customer_email'),null);
  });
  const bad=await call('/billing/webhook','POST',undefined,'',{'stripe-signature':'t=1,v1=00'},'{"id":"x","data":{"object":{}}}');
  assert.equal(bad.status,400);
 }finally{db.close()}
});
