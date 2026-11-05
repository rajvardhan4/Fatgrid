import urllib.request
import json
import time
import sys

sys.stdout.reconfigure(encoding='utf-8')

DATABASES_ENDPOINT = "https://api.fatgrid.com/api/domains/databases"
LIST_ENDPOINT = "https://api.fatgrid.com/api/domains/list"

HEADERS = {
    'Content-Type': 'application/json',
    'Origin': 'https://go.fatgrid.com',
    'Referer': 'https://go.fatgrid.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def get_databases():
    req = urllib.request.Request(DATABASES_ENDPOINT, headers=HEADERS)
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode('utf-8'))
        data.sort(key=lambda x: x.get('domainsCount', 0), reverse=True)
        return [(d['database'], d.get('domainsCount', 0)) for d in data if d.get('database')]

def query_domains(database, page=1, limit=100):
    payload = {'database': database, 'page': page, 'limit': limit}
    req = urllib.request.Request(LIST_ENDPOINT, data=json.dumps(payload).encode('utf-8'), headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return json.loads(res.read().decode('utf-8'))
    except Exception as e:
        print(f"Error on {database} page {page}: {e}")
        return None

t0 = time.time()
dbs = get_databases()
print(f"Loaded {len(dbs)} databases.")
# Test fetching 5 pages from top database (US)
total = 0
for page in range(1, 6):
    data = query_domains('us', page=page, limit=100)
    if data and 'items' in data:
        total += len(data['items'])
        print(f"Page {page}: fetched {len(data['items'])} items.")
    time.sleep(0.1)

print(f"Total fetched: {total} in {time.time()-t0:.2f}s")
