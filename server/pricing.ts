import type {Database,Row} from './db';
import {isDemo} from '../shared/domain';
// Site settings an administrator changes in Administration. Scanners are switched on only on the server (FEATURE_SCANNERS=1).
// The service markup depends on the customer's plan: Free sees publisher prices as listed; Pro and Advanced
// pay a managed-service markup (50% unless an admin changes it) and the team handles the placement.
export type Settings={markupPro:number,markupAdvanced:number};
const clampMarkup=(v:unknown,fallback:number)=>{const n=v==null||v===''?fallback:Number(v);return Number.isFinite(n)?Math.min(500,Math.max(0,n)):fallback};
export async function loadSettings(db:Database):Promise<Settings>{
 const rows=await db.all('SELECT key,value FROM app_settings');
 const get=(k:string)=>rows.find(r=>r.key===k)?.value;
 return {markupPro:clampMarkup(get('markup_pro'),50),markupAdvanced:clampMarkup(get('markup_advanced'),50)};
}
export async function saveSettings(db:Database,s:Settings){
 await db.batch([['markup_pro',s.markupPro],['markup_advanced',s.markupAdvanced]].map(([k,v])=>({sql:'INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',args:[k,String(v)]})));
}
export const planMarkup=(s:Settings,plan?:string)=>plan==='pro'?s.markupPro:plan==='advanced'?s.markupAdvanced:0;
// Managed service pricing: customers see the publisher's cost plus the markup, rounded up to whole dollars.
// With a markup the source marketplace stays private, because the service handles the placement.
export type Pricing={markup:number,admin:boolean};
export const customerPrice=(cost:unknown,markup:number)=>cost==null?null:markup>0?Math.ceil(Number(cost)*(1+markup/100)):Number(cost);
// Turns a customer price filter into the stored cost it corresponds to.
export const costFor=(price:number,markup:number)=>markup>0?price/(1+markup/100):price;
export const hideSource=(p:Pricing)=>p.markup>0&&!p.admin;
export function sellRow<T extends Row>(row:T,p:Pricing):T{
 if(!row||row.price==null)return row;
 return {...row,price:customerPrice(row.price,p.markup),...(p.admin?{cost:row.price}:{})};
}
export function sellOffer(offer:Row,p:Pricing){
 const sold=sellRow(offer,p);
 return hideSource(p)&&!isDemo(offer)?{...sold,marketplace:'The Sponsored Post',url:''}:sold;
}
// Orders keep the real marketplace and cost for the admin; customers see neither while a markup applies.
export function customerOrder(order:Row,p:Pricing){
 const {cost,...rest}=order;
 return p.admin?order:hideSource(p)?{...rest,marketplace:'The Sponsored Post'}:rest;
}
