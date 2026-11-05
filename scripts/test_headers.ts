import { normalizeInventoryRows } from '../shared/inventory-csv';

const sample = [{
  'Publisher': 'forbes.com',
  'Marketplace': 'vefogix.com',
  'Best Price': '1500',
  'Type': 'Guest Post',
  'Title': 'Forbes Official',
  'Categories': 'Business, Tech',
  'Language': 'English',
  'Top Country': 'United States',
  'AS': '85',
  'DR': '94',
  'Ref Domains': '2500000',
  'Organic (total)': '85000000',
  'Organic (top)': '45000000',
  'All Ch. (top)': '95000000',
  'All Ch. (total)': '120000000',
  'Min Monthly': '35000000',
  'Follow': 'dofollow',
  'Sponsored': '0',
  'Restricted': '1',
  'Restricted Niches': 'crypto,forex'
}];

const res = normalizeInventoryRows(sample);
console.log('Mapped headers count:', Object.keys(res.mapped).length);
console.log('Mapped headers:', res.mapped);
console.log('Ignored headers:', res.ignored);
console.log('Missing headers:', res.missing);
console.log('First normalized row:', res.rows[0]);
