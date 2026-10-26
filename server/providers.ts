import { load } from 'cheerio/slim';
import { ApiError, type Env } from './auth';
import { normalizeDomain } from '../shared/domain';
export type PublicFetch = (url:string) => Promise<Response>;
export function publicURL(input:string) {
  let u:URL;try{u=new URL(input)}catch{throw new ApiError(400,'Enter a valid public URL.');}
  const host=u.hostname.toLowerCase();
  // Literal IPs, local names and non-standard ports are never crawler targets.
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port)||!normalizeDomain(host)||/^\d+\./.test(host)||/\.(local|internal|localhost|test|invalid|home|lan)$/i.test(host))throw new ApiError(400,'Only public HTTP(S) hostnames are supported.');
  return u;
}
export function isPublicIPv4(address:string){const p=address.split('.').map(Number);return p.length===4&&p.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&![0,10,127].includes(p[0])&&p[0]<224&&!(p[0]===169&&p[1]===254)&&!(p[0]===172&&p[1]>=16&&p[1]<=31)&&!(p[0]===192&&(p[1]===168||p[1]===0||p[1]===2))&&!(p[0]===100&&p[1]>=64&&p[1]<=127)&&!(p[0]===198&&(p[1]===18||p[1]===19||p[1]===51))&&!(p[0]===203&&p[1]===0&&p[2]===113);}
export async function readLimited(response:Response,max=2000000){
  const reader=response.body?.getReader();if(!reader)return '';const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new ApiError(422,'Page exceeds the 2 MB crawl limit.');chunks.push(value)}}finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return new TextDecoder().decode(bytes);
}
export async function inspectBacklink(source:string,target:string,safeFetch:PublicFetch){
  let url=publicURL(source).href;let response:Response|undefined;
  for(let i=0;i<5;i++){response=await safeFetch(url);if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)break;url=publicURL(new URL(location,url).href).href;continue;}break;}
  if(!response)throw new ApiError(502,'Unable to fetch page.');
  if(!response.ok)return {status:'unreachable',http_status:response.status,anchor:'',rel:'',error:`HTTP ${response.status}`};
  if(!(response.headers.get('content-type')||'').includes('text/html'))return {status:'not_html',http_status:response.status,anchor:'',rel:'',error:'Source is not an HTML page.'};
  const html=await readLimited(response),$=load(html);let found:{anchor:string;rel:string}[]=[];
  $('a[href]').each((_,el)=>{try{const link=new URL($(el).attr('href')!,url);const host=normalizeDomain(link.hostname);if(host===target)found.push({anchor:$(el).text().trim().slice(0,500),rel:($(el).attr('rel')||'').toLowerCase()})}catch{}});
  const followed=found.find(x=>!/(^|\s)(nofollow|sponsored|ugc)(\s|$)/.test(x.rel));const link=followed||found[0];
  return {status:followed?'live':link?'nofollow':'missing',http_status:response.status,anchor:link?.anchor||'',rel:link?.rel||'',error:null};
}
export function providerStatus(env:Env){return {google:!!(env.DATAFORSEO_LOGIN&&env.DATAFORSEO_PASSWORD),backlinks:!!(env.DATAFORSEO_LOGIN&&env.DATAFORSEO_PASSWORD),ai:!!env.PERPLEXITY_API_KEY,billing:!!(env.STRIPE_SECRET_KEY&&env.STRIPE_WEBHOOK_SECRET),scheduling:env.AUTH_MODE!=='platform'||!!env.CRON_SECRET||env.PRIVATE_SCHEDULER==='1'};}
export async function backlinkSummary(target:string,env:Env){
 if(!providerStatus(env).backlinks)throw new ApiError(503,'Backlink data is not connected. Configure DataForSEO server credentials.');
 const response=await fetch('https://api.dataforseo.com/v3/backlinks/summary/live',{method:'POST',headers:{Authorization:`Basic ${btoa(env.DATAFORSEO_LOGIN+':'+env.DATAFORSEO_PASSWORD)}`,'Content-Type':'application/json'},body:JSON.stringify([{target,include_subdomains:false}]),signal:AbortSignal.timeout(30000)});
 const data=await response.json() as any,task=data.tasks?.[0];if(!response.ok||task?.status_code!==20000)throw new ApiError(502,'Provider could not look up this domain.');const r=task.result?.[0]||{};return {domain:target,rank:r.rank,referring_domains:r.referring_domains,source:'DataForSEO'};
}
export async function scanProvider(kind:string,query:string,country:string,depth:number,env:Env,language='en'){
  if(kind==='ai'){
    if(!env.PERPLEXITY_API_KEY)throw new ApiError(503,'AI Search is not connected. Configure PERPLEXITY_API_KEY in the server environment.','provider_unavailable');
    const response=await fetch('https://api.perplexity.ai/v1/agent',{method:'POST',headers:{Authorization:`Bearer ${env.PERPLEXITY_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({effort:'fast',input:query}),signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw new ApiError(502,'AI provider could not complete the search. No units were charged.');
    const data=await response.json() as any;const rows=(data.output||[]).filter((x:any)=>x.type==='search_results').flatMap((x:any)=>x.results||[]);
    return {answer:(data.output||[]).filter((x:any)=>x.type==='message').flatMap((x:any)=>x.content||[]).filter((x:any)=>x.type==='output_text').map((x:any)=>x.text).join('\n'),rows:rows.map((r:any,i:number)=>({domain:normalizeDomain(r.url),url:r.url,title:r.title,rank:i+1})).filter((r:any)=>r.domain)};
  }
  if(!env.DATAFORSEO_LOGIN||!env.DATAFORSEO_PASSWORD)throw new ApiError(503,'This scanner needs DataForSEO credentials. Configure them in the server environment.','provider_unavailable');
  const endpoint=kind==='google'?'serp/google/organic/live/advanced':'backlinks/referring_domains/live';
  const payload=kind==='google'?{keyword:query,location_name:country,language_code:language,depth}:{target:normalizeDomain(query),limit:depth,backlinks_status_type:'live'};
  const response=await fetch(`https://api.dataforseo.com/v3/${endpoint}`,{method:'POST',headers:{Authorization:`Basic ${btoa(env.DATAFORSEO_LOGIN+':'+env.DATAFORSEO_PASSWORD)}`,'Content-Type':'application/json'},body:JSON.stringify([payload]),signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new ApiError(502,'Search provider is unavailable.');
  const data=await response.json() as any,task=data.tasks?.[0];
  if(task?.status_code!==20000)throw new ApiError(502,'Provider rejected the scan. Check your provider subscription and balance.');
  const items=task.result?.[0]?.items||[];
  return {rows:items.filter((r:any)=>kind!=='google'||r.type==='organic').map((r:any,i:number)=>({domain:normalizeDomain(r.domain||r.url),url:r.url||`https://${r.domain}`,title:r.title||r.domain,rank:r.rank_absolute||i+1,backlinks:r.backlinks})).filter((r:any)=>r.domain)};
}

