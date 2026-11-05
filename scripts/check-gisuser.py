import sqlite3

conn = sqlite3.connect(r'C:\Projects\Claude\Fatgird\data\fatgrid.sqlite')
c = conn.cursor()
c.execute("""SELECT p.domain, p.traffic_top, p.all_traffic_top, p.traffic, p.monthly_min, p.all_traffic, COUNT(o.id) as offers, MIN(o.price) as price 
             FROM publishers p 
             JOIN offers o ON o.domain=p.domain 
             WHERE p.domain='gisuser.com' 
             GROUP BY p.domain""")
print('Result for gisuser.com:', c.fetchall())
conn.close()
