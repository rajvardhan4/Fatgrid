import {getMySQLDatabase} from '../server/mysql-db';

try {
  process.loadEnvFile('.env.local');
} catch {}

async function main() {
  console.log('Connecting to remote MySQL...');
  const db = await getMySQLDatabase(process.env);
  console.log('Connected! Checking publishers count...');
  const res = await db.first('SELECT COUNT(*) as n FROM publishers');
  console.log('Current remote publishers count:', res?.n);
  const top = await db.first('SELECT p.domain, o.price FROM publishers p JOIN offers o ON o.domain=p.domain ORDER BY p.seq ASC LIMIT 1');
  console.log('Current remote top publisher:', top);
  await db.close();
  console.log('Done!');
  process.exit(0);
}

main().catch(e => {
  console.error('Remote error:', e);
  process.exit(1);
});
