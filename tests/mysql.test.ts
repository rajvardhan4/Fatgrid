import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {mysqlOptions,mysqlSQL} from '../server/mysql-db';
import {openTestDatabase} from './database-fixture';
import {rateLimit} from '../server/auth';
test('MySQL configuration requires a remote database in production and verifies TLS',()=>{
 assert.throws(()=>mysqlOptions({}));assert.throws(()=>mysqlOptions({MYSQL_URL:'file:local.sqlite'}));assert.throws(()=>mysqlOptions({MYSQL_URL:'mysql://root@localhost/db',VERCEL:'1'}));
 const options=mysqlOptions({MYSQL_URL:'mysql://user:p%40ss@db.example:3306/fatgrid',MYSQL_SSL:'false'});assert.equal(options.password,'p@ss');assert.equal(options.ssl?.rejectUnauthorized,true);
 assert.equal(mysqlSQL("SELECT `key`,query FROM jobs WHERE kind='query'"),"SELECT `key`,`query` FROM jobs WHERE kind='query'");
});
test('every MySQL table has a primary key, as managed hosts require (sql_require_primary_key)',()=>{
 const tables=readFileSync(path.join(process.cwd(),'mysql/0001_initial.sql'),'utf8').split('--> statement-breakpoint').filter(s=>/CREATE TABLE/i.test(s));
 assert.ok(tables.length>0);for(const sql of tables)assert.match(sql,/PRIMARY KEY/i,sql.match(/`(\w+)`/)?.[1]);
});
test('MySQL batches roll back and rate limits increment atomically',{skip:!process.env.MYSQL_TEST_URL},async()=>{
 const db=await openTestDatabase();
 try{
  await db.run("INSERT INTO users (id,email,name,period,created_at) VALUES ('fixture','mysql@example.test','Fixture','2026-10','2026-10-01')");
  await assert.rejects(()=>db.batch([{sql:"UPDATE users SET units=0 WHERE id='fixture'"},{sql:'INSERT INTO missing_table VALUES (1)'}]));
  assert.equal((await db.first("SELECT units FROM users WHERE id='fixture'"))!.units,10);
  await Promise.all(Array.from({length:5},()=>rateLimit(db,'same-client',5)));
  await assert.rejects(()=>rateLimit(db,'same-client',5),/Too many requests/);
 }finally{db.close()}
});
