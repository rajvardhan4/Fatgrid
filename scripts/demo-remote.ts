import {getMySQLDatabase as getRemoteDatabase} from '../server/mysql-db';
import {clearDemo,demoCount,loadDemo} from '../server/demo';
try{process.loadEnvFile('.env.local')}catch{}
// Usage: npx tsx scripts/demo-remote.ts load|clear  (uses MYSQL_URL from .env.local)
async function main(){
 const action=process.argv[2];if(!['load','clear'].includes(action))throw new Error('Usage: npx tsx scripts/demo-remote.ts load|clear');
 const db=await getRemoteDatabase(process.env);
 if(action==='load')await loadDemo(db);else await clearDemo(db);
 console.log(`Demo listings now in the database: ${await demoCount(db)}`);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e instanceof Error?e.message:'Demo update failed. Check MYSQL_URL.');process.exit(1)});
