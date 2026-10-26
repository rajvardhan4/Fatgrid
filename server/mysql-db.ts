import mysql, {type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader} from 'mysql2/promise';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {ApiError,type Env} from './auth';
import type {Database,Row,Statement} from './db';

// Translate the small, audited SQLite dialect used by the shared API.
export function mysqlSQL(sql:string){
 return sql.replace(/INSERT OR IGNORE INTO (monitors|webhook_events)([\s\S]*)/i,(_,table,rest)=>`INSERT INTO ${table}${rest} ON DUPLICATE KEY UPDATE id=id`)
 .replace(/ON CONFLICT\([^)]*\) DO UPDATE SET/gi,'ON DUPLICATE KEY UPDATE')
 .replace(/excluded\.(\w+)/g,'VALUES($1)')
 .replace(/(?<!`)\b(key|query|rank)\b(?!`)(?=(?:[^']*'[^']*')*[^']*$)/g,'`$1`');
}
export function mysqlConfigured(env:Env){return !!env.MYSQL_URL}
export function mysqlOptions(env:Env){
 if(!env.MYSQL_URL)throw new ApiError(503,'MySQL setup required. Add MYSQL_URL to Vercel environment variables, then redeploy.','database_not_configured');
 let url:URL;try{url=new URL(env.MYSQL_URL.trim())}catch{throw new ApiError(503,'MYSQL_URL must be a valid mysql:// connection URL.','database_not_configured')}
 if(url.protocol!=='mysql:'||!url.hostname||url.pathname.length<2)throw new ApiError(503,'MYSQL_URL must include the MySQL host and database name.','database_not_configured');
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(env.VERCEL&&local)throw new ApiError(503,'Use a cloud MySQL host on Vercel, not localhost.','database_not_configured');
 return {host:url.hostname,port:Number(url.port||3306),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:decodeURIComponent(url.pathname.slice(1)),connectionLimit:3,waitForConnections:true,queueLimit:30,connectTimeout:10000,decimalNumbers:true,supportBigNumbers:true,charset:'utf8mb4',ssl:local&&env.MYSQL_SSL==='false'?undefined:{rejectUnauthorized:true,...(env.MYSQL_SSL_CA?{ca:env.MYSQL_SSL_CA.replace(/\\n/g,'\n')}: {})}};
}
async function execute(c:PoolConnection,s:Statement):Promise<{rows:Row[],changes:number}>{
 const args=(s.args||[]).map(v=>v===undefined?null:typeof v==='boolean'?Number(v):v);
 if(s.sql.includes('json_each')){
  if(s.sql.startsWith('SELECT COUNT')){
   const domains=JSON.parse(String(args[0])) as string[];
   const [existing]=await c.query<RowDataPacket[]>('SELECT domain FROM project_domains WHERE project_id=?',[args[1]]);
   return {rows:[{n:domains.filter(d=>!existing.some(r=>r.domain===d)).length}],changes:0};
  }
  const [projectId,created,serialized,,,,,limit]=args;
  await c.query('SELECT id FROM projects WHERE id=? FOR UPDATE',[projectId]);
  const [existing]=await c.query<RowDataPacket[]>('SELECT domain FROM project_domains WHERE project_id=?',[projectId]);
  const additions=(JSON.parse(String(serialized)) as string[]).filter(d=>!existing.some(r=>r.domain===d));
  if(existing.length+additions.length>Number(limit))return {rows:[],changes:0};
  for(const domain of additions)await c.query('INSERT INTO project_domains (id,project_id,domain,created_at) VALUES (?,?,?,?)',[crypto.randomUUID(),projectId,domain,created]);
  return {rows:[],changes:additions.length};
 }
 const returning=s.sql.match(/ RETURNING (\w+)$/);
 const sql=mysqlSQL(s.sql.replace(/ RETURNING \w+$/,''));
 const [result]=await c.query(sql,args);
 if(Array.isArray(result))return {rows:result as Row[],changes:0};
 const changes=(result as ResultSetHeader).affectedRows;
 if(returning){
  if(s.sql.startsWith('INSERT INTO rate_limits')){
   const [rows]=await c.query<RowDataPacket[]>('SELECT count FROM rate_limits WHERE `key`=?',[args[0]]);return {rows,changes};
  }
  if(s.sql.startsWith('UPDATE users SET units=units-')){
   const [rows]=await c.query<RowDataPacket[]>('SELECT units FROM users WHERE id=? AND EXISTS(SELECT 1 FROM jobs WHERE id=?)',[args[1],args[2]]);return {rows:changes?rows:[],changes};
  }
  throw new Error('Unsupported RETURNING statement');
 }
 return {rows:[],changes};
}
export function mysqlDatabase(pool:Pool):Database{
 // Serialize writes per database, across serverless instances. Keep each multi-step
 // debit/refund/webhook in a single transaction; release locks on every exit path.
 async function work(statements:Statement[]){
  const c=await pool.getConnection();let locked=false;
  try{
   if(statements.some(s=>!/^\s*SELECT\b/i.test(s.sql))){
    const [locks]=await c.query<RowDataPacket[]>("SELECT GET_LOCK(CONCAT('fg:',DATABASE()),15) AS acquired");
    if(locks[0].acquired!==1)throw new Error('Database busy');locked=true;
   }
   await c.beginTransaction();const results:{rows:Row[],changes:number}[]=[];for(const statement of statements)results.push(await execute(c,statement));await c.commit();return results;
  }catch(e){await c.rollback();throw e}finally{try{if(locked)await c.query("SELECT RELEASE_LOCK(CONCAT('fg:',DATABASE()))")}finally{c.release()}}
 }
 return {
  all:async(sql,args)=>(await work([{sql,args}]))[0].rows as any,
  first:async(sql,args)=>(await work([{sql,args}]))[0].rows[0] as any||null,
  run:async(sql,args)=>(await work([{sql,args}]))[0].changes,
  batch:async statements=>(await work(statements)).map(r=>r.rows),
 };
}
export async function migrateMySQL(pool:Pool){
 const c=await pool.getConnection();let locked=false;
 try{
  const [locks]=await c.query<RowDataPacket[]>("SELECT GET_LOCK(CONCAT('fg:migrate:',DATABASE()),30) AS acquired");
  if(locks[0].acquired!==1)throw new Error('Migration busy');locked=true;
  await c.query('CREATE TABLE IF NOT EXISTS _mysql_migrations (name VARCHAR(100) PRIMARY KEY)');
  const [done]=await c.query<RowDataPacket[]>('SELECT name FROM _mysql_migrations WHERE name=?',['0001_initial']);
  if(!done.length){
   // MySQL DDL commits implicitly. Each statement is restart-safe.
   for(const sql of readFileSync(path.join(process.cwd(),'mysql/0001_initial.sql'),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await c.query(sql);
   await c.query('INSERT INTO _mysql_migrations VALUES (?)',['0001_initial']);
  }
 }finally{try{if(locked)await c.query("SELECT RELEASE_LOCK(CONCAT('fg:migrate:',DATABASE()))")}finally{c.release()}}
}
let ready:Promise<Database>|undefined;
export function getMySQLDatabase(env:Env):Promise<Database>{
 const options=mysqlOptions(env);
 if(!ready)ready=(async()=>{const pool=mysql.createPool(options);try{await migrateMySQL(pool);return mysqlDatabase(pool)}catch(e){await pool.end();throw e}})().catch(e=>{ready=undefined;throw e});
 return ready;
}
