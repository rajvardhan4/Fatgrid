import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

headers = {
    'Content-Type': 'application/json',
    'Origin': 'https://go.fatgrid.com',
    'Referer': 'https://go.fatgrid.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

req = urllib.request.Request(
    'https://api.fatgrid.com/api/domains/list',
    data=json.dumps({'database': 'us', 'page': 1, 'limit': 2}).encode('utf-8'),
    headers=headers
)
res = urllib.request.urlopen(req)
d = json.loads(res.read().decode('utf-8'))
it = d['items'][0]
print(json.dumps(it, indent=2))
