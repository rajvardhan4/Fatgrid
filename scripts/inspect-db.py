import urllib.request
import json

req = urllib.request.Request(
    'https://api.fatgrid.com/api/domains/databases',
    headers={
        'Origin': 'https://go.fatgrid.com',
        'Referer': 'https://go.fatgrid.com/',
        'User-Agent': 'Mozilla/5.0'
    }
)
with urllib.request.urlopen(req) as res:
    data = json.loads(res.read().decode())
    print('Total databases:', len(data))
    total_domains = sum(d.get('domainsCount', 0) for d in data)
    print('Sum of domainsCount across all DBs:', total_domains)
    data.sort(key=lambda x: x.get('domainsCount', 0), reverse=True)
    for d in data[:15]:
        print(f"  {d['database']}: {d['domainsCount']} domains")
