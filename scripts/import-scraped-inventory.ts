import fs from 'fs';
import { openDatabase } from '../server/local-db';
import { csvParse } from '../app/ui';
import { normalizeInventoryRows } from '../shared/inventory-csv';
import { parseNiches } from '../shared/domain';

async function importAll() {
  const csvPath = 'C:\\Users\\digit\\Documents\\AI-Chats\\Fatgrid-Data-Scraper\\outputs\\fatgrid_full_inventory.csv';
  console.log('Reading CSV...');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const rawRows = csvParse(content);
  console.log(`Parsed ${rawRows.length} rows.`);

  // Transform raw rows so that Country DB maps to country, and niches are parsed cleanly
  const transformedRows = rawRows.map(r => {
    // Extract niche names from "casino: $1537; crypto: $1390"
    const nicheMatches = (r['Best Niche Prices'] || '').match(/([a-zA-Z_]+):\s*\$/g) || [];
    const niches = nicheMatches.map(m => m.replace(/:\s*\$/, '').trim()).join(',');

    return {
      Publisher: r['Domain'],
      'Best Price': r['Best Price ($)'],
      DR: r['DR'],
      'Authority Score': r['Authority Score'],
      'Organic Traffic': r['Organic Traffic'],
      'Total Traffic': r['Total Traffic'],
      'Ref Domains': r['Ref Domains'],
      Country: r['Country DB'] ? r['Country DB'].toUpperCase() : '',
      Language: r['Language'] || 'English',
      Categories: r['Categories'] || '',
      Title: r['Title'] || '',
      Niches: parseNiches(niches),
      Restricted: niches ? '1' : '0',
      Marketplace: 'FatGrid'
    };
  });

  const normalized = normalizeInventoryRows(transformedRows);
  console.log('Normalized rows:', normalized.rows.length);
  console.log('Mapped columns:', normalized.mapped);
  console.log('Ignored columns:', normalized.ignored);

  const db = openDatabase();

  console.log('Inserting into data/fatgrid.sqlite...');
  const BATCH = 500;
  let inserted = 0;

  for (let i = 0; i < normalized.rows.length; i += BATCH) {
    const batch = normalized.rows.slice(i, i + BATCH);
    const statements = [];

    for (const p of batch) {
      const now = new Date().toISOString();
      const domain = p.domain;
      const title = p.title || '';
      const category = p.category || '';
      const language = p.language || 'English';
      const country = p.country || '';
      const authority = p.authority ? Number(p.authority) : null;
      const dr = p.dr ? Number(p.dr) : null;
      const traffic = p.traffic ? Number(p.traffic) : null;
      const referring_domains = p.referring_domains ? Number(p.referring_domains) : null;
      const niches = p.niches || '';
      const price = Number(p.price);
      const marketplace = p.marketplace || 'FatGrid';
      const type = 'Guest Post';
      const follow = 'dofollow';
      const sponsored = 0;
      const restricted = niches ? 1 : 0;
      const offerId = crypto.randomUUID();

      statements.push({
        sql: `INSERT INTO publishers (domain,title,category,language,country,authority,dr,traffic,referring_domains,traffic_top,all_traffic_top,all_traffic,monthly_min,updated_at,metrics_source,niches) 
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) 
              ON CONFLICT(domain) DO UPDATE SET title=excluded.title,category=excluded.category,language=excluded.language,country=excluded.country,authority=excluded.authority,dr=excluded.dr,traffic=excluded.traffic,referring_domains=excluded.referring_domains,updated_at=excluded.updated_at,metrics_source=excluded.metrics_source,niches=excluded.niches`,
        args: [domain, title, category, language, country, authority, dr, traffic, referring_domains, null, null, null, null, now, 'FatGrid Scraper', niches]
      });

      statements.push({
        sql: `INSERT INTO offers (id,domain,marketplace,price,type,follow,sponsored,restricted,url,updated_at,active) 
              VALUES (?,?,?,?,?,?,?,?,?,?,1) 
              ON CONFLICT(domain,marketplace,type) DO UPDATE SET price=excluded.price,follow=excluded.follow,sponsored=excluded.sponsored,restricted=excluded.restricted,active=1,updated_at=excluded.updated_at`,
        args: [offerId, domain, marketplace, price, type, follow, sponsored, restricted, '', now]
      });
    }

    await db.batch(statements);
    inserted += batch.length;
    if (inserted % 2000 === 0 || inserted === normalized.rows.length) {
      console.log(`Inserted ${inserted} / ${normalized.rows.length} records...`);
    }
  }

  const pubCount = await db.first('SELECT COUNT(*) as c FROM publishers');
  const offCount = await db.first('SELECT COUNT(*) as c FROM offers');
  console.log(`Finished! Total publishers in database: ${pubCount.c}, Total offers: ${offCount.c}`);
  db.close();
}

importAll().catch(console.error);
