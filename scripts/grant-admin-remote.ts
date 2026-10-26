import {getRemoteDatabase} from '../server/remote-db';
try{process.loadEnvFile('.env.local')}catch{}
async function main(){
 const email=process.argv[2]?.toLowerCase();if(!email||!email.includes('@'))throw new Error('Usage: npm run admin:grant:remote -- existing-account@example.com');
 const db=await getRemoteDatabase(process.env),user=await db.first('SELECT id FROM users WHERE email=?',[email]);if(!user)throw new Error('Register the account on the Vercel app first.');
 await db.run("UPDATE users SET role='admin' WHERE id=?",[user.id]);console.log('Administrator access granted to the existing remote account.');
}
main().then(()=>process.exit(0)).catch(()=>{console.error('Could not grant access. Verify the existing account and remote database configuration.');process.exit(1)});
