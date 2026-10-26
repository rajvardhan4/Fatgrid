import mysql from 'mysql2/promise';
import {openDatabase} from '../server/local-db';
import {migrateMySQL,mysqlDatabase,mysqlOptions} from '../server/mysql-db';
export async function openTestDatabase(_filename=':memory:'){
 if(!process.env.MYSQL_TEST_URL)return openDatabase(':memory:');
 const options=mysqlOptions({MYSQL_URL:process.env.MYSQL_TEST_URL,MYSQL_SSL:'false'});
 const control=mysql.createPool(options),name='fg_test_'+crypto.randomUUID().replaceAll('-','');
 await control.query('CREATE DATABASE `'+name+'`');
 const pool=mysql.createPool({...options,database:name});
 try{await migrateMySQL(pool)}catch(e){await pool.end();await control.query('DROP DATABASE `'+name+'`');await control.end();throw e}
 return {...mysqlDatabase(pool),close:()=>{void pool.end().then(()=>control.query('DROP DATABASE `'+name+'`')).finally(()=>control.end())}};
}
