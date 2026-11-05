import sqlite3
import csv
import sys
import uuid
import datetime

sys.stdout.reconfigure(encoding='utf-8')

db_path = r"C:\Projects\Claude\Fatgird\data\fatgrid.sqlite"
csv_path = r"C:\Users\digit\Documents\AI-Chats\Fatgrid-Data-Scraper\outputs\fatgrid_marketplace_perfect_full.csv"

con = sqlite3.connect(db_path)
cur = con.cursor()

# Clear existing demo data or old single-offer data if desired, or upsert
with open(csv_path, "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    rows = list(reader)

print(f"Loading {len(rows)} rows into {db_path}...")

now = datetime.datetime.now(datetime.timezone.utc).isoformat()

# Collect unique publishers
publishers = {}
offers = []

for r in rows:
    domain = r['Publisher'].strip().lower()
    if domain not in publishers:
        publishers[domain] = (
            domain,
            r['Title'],
            r['Categories'],
            r['Language'],
            r['Top Country'],
            int(r['AS']) if r['AS'] else None,
            int(r['DR']) if r['DR'] else None,
            int(r['Organic (total)']) if r['Organic (total)'] else None,
            int(r['Ref Domains']) if r['Ref Domains'] else None,
            int(r['Organic (top)']) if r['Organic (top)'] else None,
            int(r['All Ch. (top)']) if r['All Ch. (top)'] else None,
            int(r['All Ch. (total)']) if r['All Ch. (total)'] else None,
            int(r['Min Monthly']) if r['Min Monthly'] else None,
            now,
            'FatGrid Real',
            r['Restricted Niches']
        )
    offers.append((
        str(uuid.uuid4()),
        domain,
        r['Marketplace'],
        float(r['Best Price']),
        r['Type'],
        r['Follow'],
        int(r['Sponsored']),
        int(r['Restricted']),
        '',
        1,
        now
    ))

print(f"Upserting {len(publishers)} unique publishers...")
cur.executemany("""
    INSERT INTO publishers (
        domain, title, category, language, country, authority, dr,
        traffic, referring_domains, traffic_top, all_traffic_top,
        all_traffic, monthly_min, updated_at, metrics_source, niches
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(domain) DO UPDATE SET
        title=excluded.title, category=excluded.category, language=excluded.language,
        country=excluded.country, authority=excluded.authority, dr=excluded.dr,
        traffic=excluded.traffic, referring_domains=excluded.referring_domains,
        traffic_top=excluded.traffic_top, all_traffic_top=excluded.all_traffic_top,
        all_traffic=excluded.all_traffic, monthly_min=excluded.monthly_min,
        updated_at=excluded.updated_at, metrics_source=excluded.metrics_source,
        niches=excluded.niches
""", list(publishers.values()))

print(f"Upserting {len(offers)} offers...")
cur.executemany("""
    INSERT INTO offers (
        id, domain, marketplace, price, type, follow, sponsored,
        restricted, url, active, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(domain, marketplace, type) DO UPDATE SET
        price=excluded.price, follow=excluded.follow, sponsored=excluded.sponsored,
        restricted=excluded.restricted, active=1, updated_at=excluded.updated_at
""", offers)

con.commit()

cur.execute("SELECT count(*) FROM publishers")
p_count = cur.fetchone()[0]
cur.execute("SELECT count(*) FROM offers")
o_count = cur.fetchone()[0]
con.close()

print(f"DONE! Local SQLite now has {p_count} publishers and {o_count} active marketplace offers!")
