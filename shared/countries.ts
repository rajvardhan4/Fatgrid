// Inventory countries arrive as ISO codes ("IN") or names ("India", "USA"). Both resolve to an
// ISO 3166-1 alpha-2 code, shown as a flag emoji plus the full English name.
const aliases: Record<string, string> = {
  'usa': 'US', 'u.s.': 'US', 'u.s.a.': 'US', 'united states of america': 'US', 'america': 'US', 'uk': 'GB', 'u.k.': 'GB', 'great britain': 'GB', 'britain': 'GB',
  'england': 'GB', 'scotland': 'GB', 'wales': 'GB', 'uae': 'AE', 'czech republic': 'CZ', 'turkey': 'TR', 'russian federation': 'RU', 'korea': 'KR',
  'republic of korea': 'KR', 'viet nam': 'VN', 'holland': 'NL', 'ivory coast': 'CI', 'burma': 'MM', 'macedonia': 'MK', 'swaziland': 'SZ',
};
// Full names come from the runtime's Intl data, so every region code is covered without a hand-kept list.
let names: Intl.DisplayNames | null = null, byName: Record<string, string> | null = null;
function displayNames() {
  if (!names) try { names = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; }
  return names;
}
function nameIndex() {
  if (byName) return byName;
  byName = {};
  const dn = displayNames();
  if (dn) for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b), name = dn.of(code);
    // First code wins, so current codes (RU) beat retired ones that share a name (SU).
    if (name && name !== code && !byName[name.toLowerCase()]) byName[name.toLowerCase()] = code;
  }
  return byName;
}
export function countryCode(name: unknown): string {
  const value = String(name ?? '').trim(), lower = value.toLowerCase();
  if (!value) return '';
  if (/^[A-Za-z]{2}$/.test(value)) { if (lower === 'uk') return 'GB'; const code = value.toUpperCase(), dn = displayNames(); return !dn || dn.of(code) !== code ? code : ''; }
  return aliases[lower] || nameIndex()[lower] || '';
}
// Full English name for a code or name ("IN" → "India", "usa" → "United States"); unknown values stay as typed.
export function countryName(value: unknown): string {
  const raw = String(value ?? '').trim(), code = countryCode(raw), name = code ? displayNames()?.of(code) : '';
  return name && name !== code ? name : raw;
}
// Two regional-indicator letters render as a flag (with the bundled flag font where the OS lacks one).
export function flag(name: unknown): string {
  const code = countryCode(name);
  return code ? String.fromCodePoint(...[...code].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : '';
}
