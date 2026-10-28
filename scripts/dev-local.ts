// Runs the site on this computer against the local SQLite file in data/, never the live MySQL from .env.local.
// The first run loads the demo listings so the marketplace has rows to show. Usage: npx tsx scripts/dev-local.ts
import {spawn} from 'node:child_process';
import {openDatabase} from '../server/local-db';
import {demoCount,loadDemo} from '../server/demo';
// Values already set win over .env.local, so blanking them keeps the live database and site address out.
Object.assign(process.env,{MYSQL_URL:'',MYSQL_SSL_CA:'',APP_ORIGIN:''});
async function main(){
 const db=openDatabase();
 if(!await demoCount(db))console.log(`Loaded ${await loadDemo(db)} demo listings into data/fatgrid.sqlite.`);
 db.close();
 console.log('Open http://127.0.0.1:3000 — this uses the local database only.');
 spawn('npm run dev',{stdio:'inherit',shell:true,env:process.env}).on('exit',code=>process.exit(code??0));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
