import {getMySQLDatabase as getRemoteDatabase} from '../server/mysql-db';
try{process.loadEnvFile('.env.local')}catch{}
getRemoteDatabase(process.env).then(()=>{console.log('Remote database migrations applied.');process.exit(0)}).catch(()=>{console.error('Migration failed. Check MYSQL_URL.');process.exit(1)});
