export type DomainInput = { domain: string; quoted: number | null };
export function normalizeDomain(value: string): string {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(host) && !host.includes('..') ? host : '';
  } catch { return ''; }
}
export function parseDomains(text: string): { domains: DomainInput[]; invalid: string[] } {
  const map = new Map<string, DomainInput>();
  const invalid: string[] = [];
  for (const line of text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    if (/^(domain|publisher|url)[,\t]/i.test(line)) continue;
    const parts = line.replace(/"/g, '').split(/[,;\t\s]+/);
    const domain = normalizeDomain(parts[0]);
    if (!domain) { invalid.push(line); continue; }
    const number = Number((parts[1] || '').replace(/^\$/, ''));
    const quoted = parts[1] && Number.isFinite(number) && number >= 0 ? number : null;
    if (!map.has(domain) || (map.get(domain)!.quoted === null && quoted !== null)) map.set(domain, { domain, quoted });
  }
  return { domains: [...map.values()], invalid };
}
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
// Sample listings that show how the marketplace looks. Marked everywhere and never orderable.
export const DEMO_SOURCE = 'Demo sample';
export const isDemo = (row: { metrics_source?: string; marketplace?: string } | null | undefined) => row?.metrics_source === DEMO_SOURCE || row?.marketplace === DEMO_SOURCE;
