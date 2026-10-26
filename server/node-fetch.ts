import {lookup} from 'node:dns/promises';
import {Agent,fetch as undiciFetch} from 'undici';
import {ApiError} from './auth';
import {isPublicIPv4,publicURL} from './providers';
export async function safeNodeFetch(url:string){
 const u=publicURL(url),addresses=await lookup(u.hostname,{all:true,family:4});
 if(!addresses.length||addresses.some(a=>!isPublicIPv4(a.address)))throw new ApiError(400,'The URL resolves to a non-public address.');
 const dispatcher=new Agent({connect:{lookup:((_host:any,options:any,callback:any)=>{if(options?.all)callback(null,addresses);else callback(null,addresses[0].address,4)}) as any}});
 try{return await undiciFetch(u.href,{redirect:'manual',dispatcher,signal:AbortSignal.timeout(15000),headers:{'User-Agent':'FatGridClone-LinkMonitor/1.0',Accept:'text/html'}}) as unknown as Response}
 finally{setTimeout(()=>dispatcher.close().catch(()=>{}),20000).unref()}
}
