import { getMySQLDatabase } from '../server/mysql-db';

process.loadEnvFile('.env.local');

async function test() {
  const db = await getMySQLDatabase(process.env);
  const total = await db.first('SELECT COUNT(DISTINCT p.domain) as count FROM publishers p JOIN offers o ON o.domain=p.domain AND o.active=1');
  console.log('Total in MySQL via getMySQLDatabase:', total);

  const pubs = await db.all('SELECT domain, seq FROM publishers ORDER BY seq ASC');
  console.log('Total rows returned by SELECT:', pubs.length);
  console.log('Row 1:', pubs[0]);
  console.log('Row 101:', pubs[100]);
  console.log('Row 102:', pubs[101]);

  process.exit(0);
}

test().catch(e => {
  console.error(e);
  process.exit(1);
});
