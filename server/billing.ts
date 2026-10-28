import { ApiError, equal, now, type Env } from './auth';
import type { Database } from './db';
async function stripePost(env:Env,path:string,body:Record<string,string>){
  if(!env.STRIPE_SECRET_KEY)throw new ApiError(503,'Online payments are not set up yet. No payment has been taken.','provider_unavailable');
  const response=await fetch(`https://api.stripe.com/v1/${path}`,{method:'POST',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),signal:AbortSignal.timeout(15000)});
  const result=await response.json() as any;if(!response.ok||!result.url)throw new ApiError(502,'Unable to reach the payment provider. Please try again later.');return result;
}
export const checkout=(env:Env,body:Record<string,string>)=>stripePost(env,'checkout/sessions',body);
// Stripe's hosted Customer Portal: change plan, cancel, update the card and download invoices.
export const billingPortal=(env:Env,customer:string,returnUrl:string)=>stripePost(env,'billing_portal/sessions',{customer,return_url:returnUrl});
const planFor=(env:Env,price:string|undefined)=>price&&price===env.STRIPE_PRO_PRICE_ID?'pro':price&&price===env.STRIPE_ADVANCED_PRICE_ID?'advanced':null;
export async function stripeWebhook(request:Request,db:Database,env:Env){
  if(!env.STRIPE_WEBHOOK_SECRET)throw new ApiError(503,'Webhook not configured.');
  const raw=await request.text();const header=request.headers.get('stripe-signature')||'';const parts=header.split(',');const t=parts.find(x=>x.startsWith('t='))?.slice(2);const signatures=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));
  if(!t||!Number.isFinite(Number(t))||Math.abs(Date.now()/1000-Number(t))>300)throw new ApiError(400,'Invalid webhook signature.');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${t}.${raw}`)));const digest=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(!signatures.some(s=>equal(s,digest)))throw new ApiError(400,'Invalid webhook signature.');
  const event=JSON.parse(raw);if(!event.id||!event.data?.object)throw new ApiError(400,'Invalid event.');const object=event.data.object;
  const statements:any[]=[];
  // Back on the free plan; units drop to the free allowance (portable SQL, no SQLite-only MIN(a,b)).
  const downgrade=(subscription:string)=>({sql:"UPDATE users SET plan='start',units=CASE WHEN units>10 THEN 10 ELSE units END,stripe_subscription=NULL WHERE stripe_subscription=? AND NOT EXISTS(SELECT 1 FROM webhook_events WHERE id=?)",args:[subscription,event.id]});
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&object.mode==='payment'&&object.payment_status==='paid'&&object.currency==='usd'){
    statements.push({sql:"UPDATE orders SET status='paid' WHERE stripe_session=? AND id=? AND status='draft' AND ROUND(price*100)=? AND user_id=? AND NOT EXISTS(SELECT 1 FROM webhook_events WHERE id=?)",args:[object.id,object.metadata?.order_id||'',object.amount_total,object.client_reference_id||'',event.id]});
  }
  // Subscription entitlement is granted only after a verified paid invoice, never from a client redirect.
  if(event.type==='invoice.paid'){
    const subscription=object.subscription||object.parent?.subscription_details?.subscription;
    const plan=planFor(env,object.lines?.data?.[0]?.price?.id||object.lines?.data?.[0]?.pricing?.price_details?.price);
    const userId=object.parent?.subscription_details?.metadata?.user_id||object.subscription_details?.metadata?.user_id||'';
    if(plan&&subscription)statements.push({sql:'UPDATE users SET plan=?,units=?,period=?,stripe_customer=?,stripe_subscription=? WHERE (stripe_customer=? OR id=?) AND NOT EXISTS(SELECT 1 FROM webhook_events WHERE id=?)',args:[plan,plan==='pro'?10000:500000,new Date().toISOString().slice(0,7),object.customer,subscription,object.customer,userId,event.id]});
  }
  if(event.type==='checkout.session.completed'&&object.mode==='subscription')statements.push({sql:'UPDATE users SET stripe_customer=?,stripe_subscription=? WHERE id=?',args:[object.customer,object.subscription,object.client_reference_id]});
  // Plan switches and cancellations made in the Customer Portal.
  if(event.type==='customer.subscription.updated'){
    const plan=planFor(env,object.items?.data?.[0]?.price?.id);
    if(['canceled','unpaid','incomplete_expired'].includes(object.status))statements.push(downgrade(object.id));
    else if(plan&&['active','trialing'].includes(object.status))statements.push({sql:'UPDATE users SET plan=? WHERE stripe_subscription=? AND NOT EXISTS(SELECT 1 FROM webhook_events WHERE id=?)',args:[plan,object.id,event.id]});
  }
  if(event.type==='customer.subscription.deleted')statements.push(downgrade(object.id));
  statements.push({sql:'INSERT OR IGNORE INTO webhook_events VALUES (?,?)',args:[event.id,now()]});
  await db.batch(statements);return {received:true};
}
