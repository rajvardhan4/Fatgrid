import assets from 'virtual:assets';
import { api, recoverStaleJobs } from '../server/api';
import { d1Database } from '../server/db';
import { ApiError } from '../server/auth';
import { isPublicIPv4, publicURL } from '../server/providers';
async function safeFetch(url:string){
  const u=publicURL(url);
  // Workers' external fetch cannot access private networks; reject private DNS answers as well.
  const dns=await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(u.hostname)}&type=A`,{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(5000)});
  const data=await dns.json() as any;const ips=(data.Answer||[]).filter((r:any)=>r.type===1).map((r:any)=>r.data);
  if(!ips.length||ips.some((ip:string)=>!isPublicIPv4(ip)))throw new ApiError(400,'URL does not resolve to a public address.');
  return fetch(u.href,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'FatGridClone-LinkMonitor/1.0','Accept':'text/html'}});
}
export default {
  async fetch(request:Request,env:any,ctx:any){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/')){
      if(!env.DB)return Response.json({error:'Database binding is unavailable.'},{status:503});
      return api(request,d1Database(env.DB),{...env,AUTH_MODE:'platform',APP_ORIGIN:url.origin},safeFetch);
    }
    let key=url.pathname;if(key.endsWith('/'))key+='index.html';else if(!key.split('/').pop()?.includes('.'))key+='/index.html';
    const asset=(assets as Record<string,[string,string]>)[key];if(!asset)return new Response('Not found',{status:404});
    const raw=atob(asset[1]),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return new Response(bytes,{headers:{'Content-Type':asset[0],'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':key.startsWith('/_next/static/')?'public, max-age=31536000, immutable':'no-cache'}});
  },
  async scheduled(_event:any,env:any,ctx:any){ctx.waitUntil(recoverStaleJobs(d1Database(env.DB)));},
};
