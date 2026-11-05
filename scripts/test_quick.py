import urllib.request
import json
import sys

headers = {
    'Content-Type': 'application/json',
    'Origin': 'https://go.fatgrid.com',
    'Referer': 'https://go.fatgrid.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

print("Testing databases endpoint...", flush=True)
try:
    req = urllib.request.Request("https://api.fatgrid.com/api/domains/databases", headers=headers)
    with urllib.request.urlopen(req, timeout=5) as res:
        data = json.loads(res.read().decode('utf-8'))
        print(f"Databases: {len(data)}", flush=True)
except Exception as e:
    print(f"Databases error: {e}", flush=True)

print("Testing list endpoint with page 1...", flush=True)
try:
    req = urllib.request.Request("https://api.fatgrid.com/api/domains/list", data=json.dumps({'database':'us','page':1,'limit':100}).encode('utf-8'), headers=headers)
    with urllib.request.urlopen(req, timeout=5) as res:
        data = json.loads(res.read().decode('utf-8'))
        print(f"List page 1: {len(data.get('items', []))} items", flush=True)
except Exception as e:
    print(f"List error: {e}", flush=True)

print("Testing list endpoint with page 2...", flush=True)
try:
    req = urllib.request.Request("https://api.fatgrid.com/api/domains/list", data=json.dumps({'database':'us','page':2,'limit':100}).encode('utf-8'), headers=headers)
    with urllib.request.urlopen(req, timeout=5) as res:
        data = json.loads(res.read().decode('utf-8'))
        print(f"List page 2: {len(data.get('items', []))} items", flush=True)
except Exception as e:
    print(f"List error: {e}", flush=True)
