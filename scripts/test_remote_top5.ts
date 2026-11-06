import {getMySQLDatabase} from '../server/mysql-db';

try {
  process.loadEnvFile('.env.local');
} catch {}

async function test() {
  const db = await getMySQLDatabase(process.env);
  const rows = await db.all('SELECT p.domain, p.seq, MIN(o.price) as price, COUNT(o.id) as offers FROM publishers p JOIN offers o ON o.domain=p.domain GROUP BY p.domain ORDER BY p.seq IS NULL, p.seq ASC LIMIT 5');
  console.log('Remote top 5 publishers:', rows);
  process.exit(0);
}

test().catch(e => {
  console.error(e);
  process.exit(1);
});

