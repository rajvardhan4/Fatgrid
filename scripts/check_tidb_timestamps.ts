import mysql from 'mysql2/promise';

process.loadEnvFile('.env.local');

async function checkTimestamps() {
  const conn = await mysql.createConnection({
    uri: process.env.TIDB_URL,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
  });
  const [rows] = await conn.query('SELECT domain, seq, updated_at FROM publishers ORDER BY updated_at DESC LIMIT 5');
  console.log('Latest updated in TiDB:');
  for (const r of rows as any[]) {
    console.log(`  domain=${r.domain} seq=${r.seq} updated=${r.updated_at}`);
  }
  await conn.end();
}

checkTimestamps().catch(console.error);
