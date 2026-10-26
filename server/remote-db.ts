import {createClient,type Client,type InValue} from '@libsql/client/web';
import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {ApiError,type Env} from './auth';
import type {Database,Row} from './db';
export function databaseCredentials(env:Env){return {url:env.TURSO_DATABASE_URL||env.LIBSQL_DATABASE_URL,authToken:env.TURSO_AUTH_TOKEN||env.LIBSQL_AUTH_TOKEN};}
export function remoteDatabaseConfigured(env:Env){const c=databaseCredentials(env);return !!(c.url&&c.authToken)}
export function libsqlDatabase(client:Client):Database{
 const args=(values:unknown[]=[])=>values.map(x=>x===undefined?null:typeof x==='boolean'?Number(x):x) as InValue[];
 return {
  all:async(sql,values)=>(await client.execute({sql,args:args(values)})).rows as any,
  first:async(sql,values)=>((await client.execute({sql,args:args(values)})).rows[0]||null) as any,
  run:async(sql,values)=>(await client.execute({sql,args:args(values)})).rowsAffected,
  batch:async statements=>(await client.batch(statements.map(s=>({sql:s.sql,args:args(s.args)})),'write')).map(r=>r.rows as unknown as Row[]),
 };
}
export async function migrateRemote(client:Client,directory=path.join(process.cwd(),'drizzle')){
 await client.execute('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)');
 for(const filename of readdirSync(directory).filter(f=>f.endsWith('.sql')).sort()){
  const tx=await client.transaction('write');
  try{
   if(!(await tx.execute({sql:'SELECT name FROM _migrations WHERE name=?',args:[filename]})).rows.length){
    const sql=readFileSync(path.join(directory,filename),'utf8');
    for(const statement of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await tx.execute(statement);
    await tx.execute({sql:'INSERT INTO _migrations (name) VALUES (?)',args:[filename]});
   }
   await tx.commit();
  }catch(e){await tx.rollback();throw e}finally{tx.close()}
 }
}
let ready:Promise<Database>|undefined;
export function getRemoteDatabase(env:Env):Promise<Database>{
 if(!remoteDatabaseConfigured(env))throw new ApiError(503,'Database setup required. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to Vercel environment variables, then redeploy.','database_not_configured');
 if(!ready)ready=(async()=>{const credentials=databaseCredentials(env);if(!/^(libsql|https):\/\//.test(credentials.url))throw new ApiError(503,'Use a remote libSQL database URL; local files are not persistent on Vercel.','database_not_configured');const client=createClient({...credentials,intMode:'number'});try{await migrateRemote(client);return libsqlDatabase(client)}catch(e){client.close();throw e}})().catch(e=>{ready=undefined;throw e});
 return ready;
}
