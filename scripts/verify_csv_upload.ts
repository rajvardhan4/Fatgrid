import fs from 'fs';
import { z } from 'zod';
import { normalizeInventoryRows } from '../shared/inventory-csv';
import { parseNiches, normalizeDomain } from '../shared/domain';

// Exact validation logic from server/api.ts
const domain = z.string().trim().min(1).max(253).transform(normalizeDomain).refine((d): d is string => d !== '' && d.includes('.'), { message: 'Enter a domain name, e.g. example.com.' });
const metric = (max?: number) => z.preprocess(v => v === '' || v == null ? null : v, z.coerce.number({ error: 'Enter a whole number, e.g. 45 or 10.5K.' }).int('Enter a whole number.').min(0, 'Cannot be negative.').max(max ?? Number.MAX_SAFE_INTEGER, `Must be ${max} or less.`).nullable()).optional().transform(v => v ?? null);
const publicUrl = z.string().trim().url().max(1000);

const inventoryRow = z.object({
  domain,
  marketplace: z.string().trim().max(300).optional().transform(v => v || 'Own inventory'),
  price: z.coerce.number({ error: 'Enter the price as a number, e.g. 150 or $150.' }).positive('Price must be more than 0.').max(1000000, 'Price must be $1,000,000 or less.'),
  type: z.enum(['Guest Post', 'Link Insertion']).default('Guest Post'),
  title: z.string().max(500).default(''),
  category: z.string().max(300).default(''),
  country: z.string().max(100).default(''),
  language: z.string().max(100).default('English'),
  authority: metric(100),
  dr: metric(100),
  traffic: metric(),
  referring_domains: metric(),
  traffic_top: metric(),
  all_traffic_top: metric(),
  all_traffic: metric(),
  monthly_min: metric(),
  follow: z.enum(['dofollow', 'nofollow']).default('dofollow'),
  sponsored: z.coerce.number().min(0).max(1).default(0),
  restricted: z.coerce.number().min(0).max(1).default(0),
  url: z.union([publicUrl, z.literal('')]).default(''),
  metrics_source: z.string().max(100).default('Imported'),
  niches: z.string().max(300).default('').transform(parseNiches)
});

// Simple CSV parser
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return [];
  
  function parseLine(line: string): string[] {
    const values: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        values.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    values.push(cur);
    return values;
  }

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = vals[idx] ?? '';
    });
    rows.push(obj);
  }
  return rows;
}

const csvPath = process.argv[2] || 'C:/Users/digit/Documents/AI-Chats/Fatgrid-Data-Scraper/outputs/fatgrid_inventory_rich.csv';
console.log('Reading:', csvPath);
const content = fs.readFileSync(csvPath, 'utf-8');
const rawRows = parseCsv(content);
console.log(`Parsed ${rawRows.length} raw rows from CSV.`);

const normalized = normalizeInventoryRows(rawRows);
console.log('Mapped headers:', normalized.mapped);
console.log('Ignored headers:', normalized.ignored);
console.log('Missing headers:', normalized.missing);

let validCount = 0;
const issues: any[] = [];

normalized.rows.forEach((r, idx) => {
  const res = inventoryRow.safeParse(r);
  if (res.success) {
    validCount++;
  } else {
    for (const issue of res.error.issues) {
      issues.push({ row: idx + 2, field: issue.path.join('.'), message: issue.message });
    }
  }
});

console.log(`\n=== Verification Result ===`);
console.log(`Total rows checked: ${normalized.rows.length}`);
console.log(`Valid rows: ${validCount}`);
console.log(`Issues count: ${issues.length}`);
if (issues.length > 0) {
  console.log('First 5 issues:', issues.slice(0, 5));
} else {
  console.log('SUCCESS! 100% of rows are completely valid and ready for upload to https://fatgrid-ebon.vercel.app/admin!');
}
