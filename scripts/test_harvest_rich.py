import urllib.request
import json
import time

def fetch_rich_domains(database='us', limit=5):
    payload = {
        'database': database,
        'page': 1,
        'limit': limit
    }
    req = urllib.request.Request(
        'https://api.fatgrid.com/api/domains/list',
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Origin': 'https://go.fatgrid.com',
            'Referer': 'https://go.fatgrid.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))

data = fetch_rich_domains('us', 3)
for it in data['items']:
    print('Domain:', it['url'])
    print('  Best Price:', it.get('bestPrice'))
    print('  Resources Count (Offers):', it.get('resourcesCount'))
    print('  DR:', it.get('dr'))
    print('  Authority Score (AS):', it.get('authorityScore'))
    print('  Ref Domains:', it.get('refDomains'))
    print('  Top Country:', it.get('database'))
    print('  Organic (top):', it.get('traffic'))
    print('  All Ch. (top):', it.get('totalOrganicTraffic'))
    print('  Organic (total):', it.get('organicTraffic'))
    print('  Min Monthly:', it.get('minMonthlyOrganicTraffic'))
    print('  All Ch. (total):', it.get('totalTraffic'))
    print('  Follow:', it.get('linkFollow'))
    print('  Sponsored:', it.get('sponsored'))
    print('  Title:', it.get('title'))
    print('  Categories:', it.get('categories'))
    print('  Niches count:', len(it.get('bestNichePrices', [])))
    print('-'*50)
