import type {Database,Row} from './db';
import {isDemo} from '../shared/domain';
// Site settings an administrator changes in Administration: the service markup and whether scanners are on.
export type Settings={markup:number,scanners:boolean};
export async function loadSettings(db:Database):Promise<Settings>{
 const rows=await db.all('SELECT key,value FROM app_settings');
 const get=(k:string)=>rows.find(r=>r.key===k)?.value;
 return {markup:Math.min(500,Math.max(0,Number(get('markup'))||0)),scanners:get('scanners')==='1'};
}
export async function saveSettings(db:Database,s:Settings){
 await db.batch([['markup',String(s.markup)],['scanners',s.scanners?'1':'0']].map(([k,v])=>({sql:'INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',args:[k,v]})));
}
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
 return hideSource(p)&&!isDemo(offer)?{...sold,marketplace:'FatGrid',url:''}:sold;
}
// Orders keep the real marketplace and cost for the admin; customers see neither while a markup applies.
export function customerOrder(order:Row,p:Pricing){
 const {cost,...rest}=order;
 return p.admin?order:hideSource(p)?{...rest,marketplace:'FatGrid'}:rest;
}
