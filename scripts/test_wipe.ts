import { getMySQLDatabase } from '../server/mysql-db';

process.loadEnvFile('.env.local');

async function testWipe() {
  const db = await getMySQLDatabase(process.env);
  console.log('Running test wipe...');
  const count1 = await db.all('SELECT count(*) as c FROM publishers');
  console.log('Publishers before wipe:', count1);

  const changes1 = await db.run('DELETE FROM offers');
  console.log('Offers deleted changes:', changes1);

  const changes2 = await db.run('DELETE FROM publishers');
  console.log('Publishers deleted changes:', changes2);

  const count2 = await db.all('SELECT count(*) as c FROM publishers');
  console.log('Publishers after wipe:', count2);

  process.exit(0);
}

testWipe().catch(e => {
  console.error(e);
  process.exit(1);
});
