import type {NextApiRequest,NextApiResponse} from 'next';
import {vercelApi} from '../../server/vercel-api';
export const config={api:{bodyParser:false,responseLimit:'4mb'},maxDuration:60};
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 try{
  const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
  // Vercel overwrites x-vercel-forwarded-for; never use a browser-supplied identity.
  headers.set('x-client-ip',String(req.headers['x-vercel-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim());
  const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1_000_000){res.status(413).json({error:'Request too large.'});return}chunks.push(Buffer.from(chunk))}
  const host=String(req.headers.host||process.env.VERCEL_URL||'localhost:3000'),protocol=process.env.VERCEL==='1'?'https':'http';
  const request=new Request(new URL(req.url||'/api/session',`${protocol}://${host}`),{method:req.method,headers,body:['GET','HEAD'].includes(req.method||'GET')?undefined:Buffer.concat(chunks)});
  const response=await vercelApi(request);res.status(response.status);response.headers.forEach((value,key)=>res.setHeader(key,value));res.send(Buffer.from(await response.arrayBuffer()));
 }catch{res.status(500).json({error:'The API could not complete this request.'})}
}
