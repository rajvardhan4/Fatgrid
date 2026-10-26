# FatGrid Next.js clone

Run `npm install`, `npm run dev`, then open http://localhost:3000. `npm run build` creates the static export in `out/`.

## Routes
- `/`: reference-matched Publisher Price Finder
- `/inventory`: marketplaces, filters, publisher offers and CSV export
- `/backlinks-checker`, `/backlinks-monitoring`, `/google-search`, `/ai-search`: scanner screens
- `/projects`, `/my-orders`, `/my-requests`: local workspace records
- `/auth/login`, `/auth/register`: demonstration account screens
- `/pricing`: plan comparison
- `/home`: compact marketing entry

## Implemented behavior
Domains are normalized, deduplicated and matched to a fixed sample inventory. Optional quoted prices calculate savings. Import TXT/CSV, export CSV, filter listings, inspect publisher offers, create projects and save order/support drafts. Workspace records persist in browser localStorage. Demo unit consumption is enforced.

## Reference research and boundaries
Inspected fatgrid.com and public go.fatgrid.com routes. The reference product aggregates guest-post and link-insertion marketplace offers with SEO metrics. The public price finder gates checks behind login; marketplace exposes filters and table columns. The backlink profile scanner requires login. Inspected the registration form without creating a third-party account.

This is a local demonstration, not the original service. Private authenticated screens were not available for exact verification. Marketing page is a condensed recreation. Sample publishers and metrics are not live data. Local login does not authenticate users, store passwords or create FatGrid accounts. Payments, Google OAuth/Sheets, live SERP/AI results, backlink crawling, Semrush/Ahrefs metrics and marketplace inventory require licensed providers and server integrations. No real purchase or email is made.

## Production integration requirements
Use server-side authentication and a database before storing real customer records. Supply marketplace inventory ingestion and normalized offer models; licensed SEO metrics; SERP/AI providers; a scheduled backlink crawler; Stripe checkout/webhooks; and email/support delivery. Keep provider credentials server-side. Replace the demo handlers rather than exposing credentials in the client.
