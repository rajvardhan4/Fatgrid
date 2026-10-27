// Turns a spreadsheet export into inventory rows the import API accepts. Column names are matched
// loosely ("Best Price", "Publisher", "DR"...) and values such as "$1,200", "10.12K" or "Yes" are cleaned.
const aliases: Record<string, string> = {
  domain: 'domain', publisher: 'domain', website: 'domain', site: 'domain', domainname: 'domain', sitename: 'domain',
  marketplace: 'marketplace', source: 'marketplace', vendor: 'marketplace', seller: 'marketplace',
  price: 'price', bestprice: 'price', cost: 'price', guestpostprice: 'price', gpprice: 'price',
  type: 'type', offertype: 'type', linktype: 'follow',
  title: 'title', name: 'title',
  category: 'category', categories: 'category', niche: 'category',
  language: 'language', lang: 'language',
  country: 'country', topcountry: 'country',
  authority: 'authority', as: 'authority', authorityscore: 'authority', semrushas: 'authority',
  dr: 'dr', domainrating: 'dr', ahrefsdr: 'dr',
  referringdomains: 'referring_domains', refdomains: 'referring_domains', rd: 'referring_domains',
  traffic: 'traffic', organictraffic: 'traffic', organictotal: 'traffic', organic: 'traffic',
  traffictop: 'traffic_top', organictop: 'traffic_top',
  alltraffictop: 'all_traffic_top', allchtop: 'all_traffic_top',
  alltraffic: 'all_traffic', allchtotal: 'all_traffic', allch: 'all_traffic',
  monthlymin: 'monthly_min', minmonthly: 'monthly_min',
  follow: 'follow', dofollow: 'follow',
  sponsored: 'sponsored',
  restricted: 'restricted',
  niches: 'niches', restrictedniches: 'niches',
  url: 'url', sampleurl: 'url', samplepost: 'url', link: 'url',
  metricssource: 'metrics_source',
};
const numberFields = ['authority', 'dr', 'traffic', 'referring_domains', 'traffic_top', 'all_traffic_top', 'all_traffic', 'monthly_min'];
const key = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');
export function mapHeaders(headers: string[]) {
  const mapped: Record<string, string> = {}, ignored: string[] = [];
  for (const h of headers) { const field = aliases[key(h)]; if (field && !Object.values(mapped).includes(field)) mapped[h] = field; else if (h.trim()) ignored.push(h); }
  return { mapped, ignored };
}
// "10.12K" → 10120, "1.5M" → 1500000, "$1,200" → 1200; anything else stays as typed so the server can reject it.
export function cleanNumber(value: string) {
  const v = value.trim().replace(/[$€£₹,\s]/g, '');
  const m = v.match(/^(\d+(?:\.\d+)?)([kKmM]?)$/);
  if (!m) return v;
  const n = Number(m[1]) * (m[2].toLowerCase() === 'k' ? 1e3 : m[2].toLowerCase() === 'm' ? 1e6 : 1);
  return String(Math.round(n * 100) / 100);
}
const yes = (v: string) => /^(1|yes|y|true)$/i.test(v.trim()) ? '1' : /^(0|no|n|false|)$/i.test(v.trim()) ? '0' : v;
export function normalizeInventoryRows(rows: Record<string, string>[]) {
  const { mapped, ignored } = mapHeaders(Object.keys(rows[0] || {}));
  const out = rows.map(raw => {
    const row: Record<string, string> = {};
    for (const [header, field] of Object.entries(mapped)) {
      let v = String(raw[header] ?? '').trim();
      if (!v) continue;
      if (field === 'price' || numberFields.includes(field)) v = cleanNumber(v);
      if (field === 'type') v = /insert/i.test(v) ? 'Link Insertion' : /guest|post/i.test(v) ? 'Guest Post' : v;
      if (field === 'follow') v = /no/i.test(v) ? 'nofollow' : /do|follow|yes/i.test(v) ? 'dofollow' : v.toLowerCase();
      if (field === 'sponsored' || field === 'restricted') v = yes(v);
      // A Restricted column that lists niches ("casino, crypto") fills niches and marks the offer restricted.
      if (field === 'restricted' && !/^[01]$/.test(v)) { row.niches = row.niches || v; v = '1'; }
      row[field] = v;
    }
    return row;
  });
  return { rows: out, mapped, ignored, missing: ['domain', 'price'].filter(f => !Object.values(mapped).includes(f)) };
}
