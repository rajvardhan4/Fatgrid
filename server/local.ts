import { createServer } from 'node:http';
import { lookup } from 'node:dns/promises';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { Agent, fetch as undiciFetch } from 'undici';
import { openDatabase } from './local-db';
import { api, recoverStaleJobs } from './api';
import {processGroups} from './monitoring';
import { ApiError } from './auth';
import { isPublicIPv4, publicURL } from './providers';
try{process.loadEnvFile('.env.local')}catch{}
const db=openDatabase(),port=Number(process.env.API_PORT||3001);
const env={...process.env,AUTH_MODE:'local' as const,APP_ORIGIN:process.env.APP_ORIGIN||'http://localhost:3000'};
async function safeFetch(url:string){
  const u=publicURL(url);const addresses=await lookup(u.hostname,{all:true,family:4});if(!addresses.length||addresses.some(a=>!isPublicIPv4(a.address)))throw new ApiError(400,'The URL resolves to a non-public address.');
  // Pin validated DNS addresses in the actual connection to prevent DNS rebinding.
  const dispatcher=new Agent({connect:{lookup:((host:any,options:any,callback:any)=>{if(options?.all)callback(null,addresses);else callback(null,addresses[0].address,4)}) as any}});
  const response=await undiciFetch(u.href,{redirect:'manual',dispatcher,signal:AbortSignal.timeout(15000),headers:{'User-Agent':'FatGridClone-LinkMonitor/1.0','Accept':'text/html'}});
  setTimeout(()=>dispatcher.close().catch(()=>{}),20000).unref();return response as unknown as Response;
}
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain','.json':'application/json'};
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/',env.APP_ORIGIN);
    if(url.pathname.startsWith('/api/')){
      const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1_000_000){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk)}
      const headers=new Headers();for(const [key,val] of Object.entries(req.headers))if(val)headers.set(key,Array.isArray(val)?val.join(','):val);
      headers.set('x-client-ip',req.socket.remoteAddress||'unknown');
      // Ignore all platform identity headers on the local server.
      for(const key of [...headers.keys()])if(key.startsWith('oai-'))headers.delete(key);
      const request=new Request(url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method||'GET')?undefined:Buffer.concat(chunks)});
      const response=await api(request,db,env,safeFetch);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const root=path.resolve('out'),relative=decodeURIComponent(url.pathname);let file=path.resolve(root,'.'+relative);
    if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}
    if(existsSync(file)&&statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!existsSync(file)){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(readFileSync(file));
  }catch(e){console.error(e instanceof Error?e.message:'Request failed');res.writeHead(500);res.end('Server error');}
}).listen(port,'127.0.0.1',()=>console.log(`Backend ready at http://127.0.0.1:${port} (${process.env.DATABASE_PATH||'data/fatgrid.sqlite'})`));
recoverStaleJobs(db).catch(console.error);
let ticking=false; setInterval(async()=>{if(ticking)return;ticking=true;try{await processGroups(db,env,safeFetch);await recoverStaleJobs(db)}catch(e){console.error(e)}finally{ticking=false}},30000).unref();

