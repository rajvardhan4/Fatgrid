import {openDatabase} from '../server/local-db';
try{process.loadEnvFile('.env.local')}catch{}
const email=process.argv[2]?.toLowerCase();if(!email||!email.includes('@'))throw new Error('Usage: npm run admin:grant -- email@example.com');
async function main(){const db=openDatabase();const user=await db.first('SELECT id FROM users WHERE email=?',[email]);if(!user)throw new Error('Register this account first.');await db.run("UPDATE users SET role='admin' WHERE id=?",[user.id]);db.close();console.log('Administrator access granted to the existing local account.');

} main().catch(e=>{console.error(e.message);process.exitCode=1});
