import mysql from 'mysql2/promise';

process.loadEnvFile('.env.local');

async function testTiDB() {
  const tidbUrl = process.env.TIDB_URL;
  console.log('Connecting to TiDB Cloud...');
  const conn = await mysql.createConnection({
    uri: tidbUrl,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
  });
  console.log('Connected to TiDB!');

  const [pubs] = await conn.query('SELECT count(*) as count FROM publishers');
  console.log('Publishers in TiDB:', pubs);

  const [rows] = await conn.query('SELECT domain, seq FROM publishers ORDER BY seq ASC LIMIT 5');
  console.log('Top 5 in TiDB:', rows);

  const [p2] = await conn.query('SELECT domain, seq FROM publishers ORDER BY seq ASC LIMIT 5 OFFSET 100');
  console.log('Rank 101 to 105 in TiDB:', p2);

  await conn.end();
}

testTiDB().catch(e => {
  console.error('TiDB connection failed:', e);
  process.exit(1);
});
