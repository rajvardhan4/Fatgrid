import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Database, Row, Statement } from './db';
export function openDatabase(filename=process.env.DATABASE_PATH||'data/fatgrid.sqlite'):Database & {close:()=>void}{
  if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true});
  const connection=new DatabaseSync(filename);
  connection.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  connection.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)');
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
    if(connection.prepare('SELECT name FROM _migrations WHERE name=?').get(file))continue;
    connection.exec('BEGIN IMMEDIATE');try{connection.exec(readFileSync(path.join('drizzle',file),'utf8'));connection.prepare('INSERT INTO _migrations VALUES (?)').run(file);connection.exec('COMMIT')}catch(e){connection.exec('ROLLBACK');throw e;}
  }
  const values=(args:unknown[]=[])=>args.map(x=>x===undefined?null:x) as any[];
  const all=(sql:string,args:unknown[]=[])=>connection.prepare(sql).all(...values(args)) as Row[];
  return {
    all:async(sql,args)=>all(sql,args) as any,
    first:async(sql,args)=>(connection.prepare(sql).get(...values(args))||null) as any,
    run:async(sql,args)=>Number(connection.prepare(sql).run(...values(args)).changes),
    batch:async(statements:Statement[])=>{connection.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>all(s.sql,s.args));connection.exec('COMMIT');return result}catch(e){connection.exec('ROLLBACK');throw e;}},
    close:()=>connection.close(),
  };
}
