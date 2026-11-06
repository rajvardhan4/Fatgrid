import { getMySQLDatabase } from '../server/mysql-db';

process.loadEnvFile('.env.local');

async function check() {
  const db = await getMySQLDatabase(process.env);
  const rows = await db.all('SELECT domain, seq, updated_at FROM publishers ORDER BY seq ASC LIMIT 10');
  console.log('Top 10 publishers by seq:');
  for (const r of rows) {
    console.log(`  domain=${r.domain} seq=${r.seq} updated=${r.updated_at}`);
  }

  const p2 = await db.all('SELECT domain, seq, updated_at FROM publishers ORDER BY seq ASC LIMIT 10 OFFSET 100');
  console.log('\nRank 101 to 110 by seq:');
  for (const r of p2) {
    console.log(`  domain=${r.domain} seq=${r.seq} updated=${r.updated_at}`);
  }

  process.exit(0);
}

check().catch(e => {
  console.error(e);
  process.exit(1);
});
