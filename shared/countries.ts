// Country names used in inventory → ISO 3166-1 alpha-2 codes, for flag emoji.
const codes: Record<string, string> = {
  'united states': 'US', 'usa': 'US', 'us': 'US', 'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB', 'england': 'GB', 'india': 'IN', 'canada': 'CA', 'australia': 'AU', 'germany': 'DE', 'france': 'FR', 'netherlands': 'NL', 'spain': 'ES', 'italy': 'IT',
  'singapore': 'SG', 'united arab emirates': 'AE', 'uae': 'AE', 'ireland': 'IE', 'new zealand': 'NZ', 'south africa': 'ZA', 'nigeria': 'NG', 'kenya': 'KE', 'pakistan': 'PK', 'bangladesh': 'BD', 'sri lanka': 'LK', 'nepal': 'NP', 'philippines': 'PH',
  'indonesia': 'ID', 'malaysia': 'MY', 'thailand': 'TH', 'vietnam': 'VN', 'japan': 'JP', 'china': 'CN', 'hong kong': 'HK', 'south korea': 'KR', 'taiwan': 'TW', 'brazil': 'BR', 'mexico': 'MX', 'argentina': 'AR', 'colombia': 'CO', 'chile': 'CL', 'peru': 'PE',
  'portugal': 'PT', 'belgium': 'BE', 'switzerland': 'CH', 'austria': 'AT', 'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK', 'finland': 'FI', 'poland': 'PL', 'czech republic': 'CZ', 'czechia': 'CZ', 'romania': 'RO', 'greece': 'GR', 'hungary': 'HU',
  'ukraine': 'UA', 'russia': 'RU', 'turkey': 'TR', 'israel': 'IL', 'saudi arabia': 'SA', 'qatar': 'QA', 'egypt': 'EG', 'morocco': 'MA', 'ghana': 'GH',
};
export function countryCode(name: unknown): string {
  const value = String(name ?? '').trim();
  return /^[A-Za-z]{2}$/.test(value) ? value.toUpperCase() : codes[value.toLowerCase()] || '';
}
// Two regional-indicator letters render as a flag (with the bundled flag font where the OS lacks one).
export function flag(name: unknown): string {
  const code = countryCode(name);
  return code ? String.fromCodePoint(...[...code].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : '';
}
