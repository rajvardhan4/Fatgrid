import {getRemoteDatabase} from '../server/remote-db';
try{process.loadEnvFile('.env.local')}catch{}
getRemoteDatabase(process.env).then(()=>{console.log('Remote database migrations applied.');process.exit(0)}).catch(()=>{console.error('Migration failed. Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.');process.exit(1)});
