import {getMySQLDatabase} from '../server/mysql-db';

try {
  process.loadEnvFile('.env.local');
} catch {}

async function test() {
  const db = await getMySQLDatabase(process.env);
  console.log('[*] Testing remote MySQL batch write...');
  
  // Test inserting a test offer or reading
  const pCount = await db.first('SELECT COUNT(*) as n FROM publishers');
  const oCount = await db.first('SELECT COUNT(*) as n FROM offers');
  console.log(`[*] Remote DB currently has: ${pCount.n} publishers, ${oCount.n} offers.`);
  process.exit(0);
}

test().catch(e => {
  console.error(e);
  process.exit(1);
});

