# FatGrid workspace — Next.js + persistent backend

An independent implementation of the visible FatGrid application. The frontend was compared with the public site and the signed-in Price Finder, Marketplace, Projects, Google Search, AI Search, Backlinks Profile, Backlinks Monitoring, Orders and Requests screens on 26 October 2026. Original Geist and Geist Mono font files, logo, navigation dimensions, colors, table layout and empty-state patterns are used.

The original service's private source, database, ranking algorithms and marketplace agreements are not accessible. This project does not claim to reproduce those internals or have access to its inventory. Links to FatGrid's blog, guide, extension and legal pages remain external reference links.

## Stack

- Frontend: **Next.js 15 / React 19 / TypeScript**, local fonts, CSS, Lucide icons.
- Backend: **Node.js 24 / TypeScript**, validated JSON API, SQL transactions, secure sessions. `npm run dev` starts both servers.
- Local database: **SQLite**, WAL and foreign keys, automatic versioned migrations.
- Hosted backend: the same request handlers bundled as a **Cloudflare Worker**, with persistent **Cloudflare D1**. Next.js generates the frontend assets. The hosted app uses Sites' authenticated ChatGPT identity.
- Schema/migrations: **Drizzle**. Runtime validation: **Zod**.
- Provider adapters: **DataForSEO** SERP/backlinks, **Perplexity Agent** citations, **Stripe Checkout and signed webhooks**.

The backend is not localStorage. Accounts, projects, domains, notes, filters, favorites, orders, conversations, checks and usage are database records.

## Vercel deployment

See [VERCEL.md](VERCEL.md) for the serverless API and persistent database setup. Vercel uses `npm run build:vercel`; `npm run build` auto-selects that target when `VERCEL=1`. Set `MYSQL_URL` before expecting authentication or saved records to work. The old static-only Vercel deployment did not include `/api/*`.

## Start locally

Requires Node.js 24. SQLite support currently emits Node's experimental-feature warning.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000 or http://127.0.0.1:3000. The API listens on 127.0.0.1:3001. Local data stays in `data/fatgrid.sqlite` and is excluded from Git and deployment. Register your own local account. To administer imported offers and fulfillment, grant that existing account access from the local terminal:

```powershell
npm run admin:grant -- your-email@example.com
```

A self-reported registration email never grants admin privileges. `ADMIN_EMAIL` applies only to verified hosted identity. Browser QA used a separate local test account; its test records are not copied to the hosted D1 database.

```powershell
npm test
npm run build
npm start
```

`npm start` serves the built app and API on `API_PORT` (default 3001); set `APP_ORIGIN` to that URL when using this mode. Production deployment output is `dist/server/index.js`; static Next assets are also available in `out/`.

## Implemented workflows

| Area | Working behavior |
|---|---|
| Price Finder | Normalize/deduplicate domains, quoted-price comparisons, TXT/CSV import, SQL cheapest offers, unknown-domain reporting, credit ledger, saved check history, CSV export. |
| Marketplaces | Server-side search, price/traffic/AS/DR/category/country/language/link filters, sorting, paging, offer details, saved filters, persisted columns, favorites, notes, project decisions and blacklist flags. |
| Projects | Create, plan quota, SQL-owned records, domain imports and deduplication, notes/status updates, archive, header project selection. A Yes decision saves the publisher into that project. |
| Google Search | Query/locale/depth/target/project form, provider request, stored scan/result history, publisher matching, target flags, one unit per 10 requested results. |
| AI Search | Citation search through Perplexity Agent, answer and publisher matching, stored history, 10 units per scan. |
| Backlinks Profile | Free in-app domain summary lookup, paid referring-domain retrieval, snapshot history and refund for fewer returned domains. DataForSEO rank is labeled as such, not misrepresented as Semrush AS. |
| Backlinks Monitoring | Named checks, up to 1,000 deduplicated pages and 100 targets, exact subdomain matching, live/nofollow/missing/HTTP results, per-page charging, failed-page refunds, resumable processing, history, manual re-runs, daily/weekly schedules, pause and archive. |
| Orders | Server-priced drafts, content/anchor/target, status tabs/filtering/CSV, Checkout handoff, signed paid-event verification, admin fulfillment, published URL. No order is marked paid by a browser redirect. |
| My requests | Paid-plan publisher availability/price requests, linked conversations, admin price quote and status. This is separate from support. |
| Messages/support | User-owned conversations and replies, administrator inbox. |
| Administration | Validated atomic inventory CSV import, integration status, orders, quotes and support handling. |
| Account/credits | Hashed passwords and session tokens locally, platform identity hosted, account isolation, atomic unit reservations, refunds, usage history and free-plan monthly reset. Paid quotas refresh only from verified paid invoices. |
| Account security | Password change in Account settings (signs out other devices), email password reset with single-use 1-hour links, optional Google sign-in (verified email only; a Google account can set a password later). |
| Shared projects | Owners invite registered users as viewers (read only) or editors (add/update domains, "Yes" decisions); members see shared projects with their role and can leave. Only the owner renames, archives or manages members. Domain limits follow the owner's plan. |
| Marketplace table | Grouped headers (Offer, Authority, Traffic, Links, Niches, Platform, Your data), offer-count pill, type and category chips, country flags, compact monospace metrics, restricted-niche icons (casino, CBD, crypto, dating, forex, pharma, other), created date, per-row notes, and Publisher/Best Price columns that stay in place while the table scrolls sideways (not on phones). Restricted niches come from the `niches` CSV column (e.g. `"casino,crypto"`) or the listing form. |
| Demo listings | Administration → Inventory → "Load demo data" adds 40 sample publishers on reserved `.example` domains (never real sites) so the marketplace is not empty. Every sample shows a Demo badge and a notice, its Buy button is replaced by "Demo", and the API refuses orders for demo offers. "Remove demo data" deletes them without touching real inventory. From a terminal: `npx tsx scripts/demo-remote.ts load|clear` (uses `.env.local`). |
| Publisher listings | Public `/list-your-site/` form (linked from Price Finder and the footer) where site owners send guest post / link insertion prices and contact details. Requests wait in Administration → Submissions; approving adds "Direct from publisher" offers to Marketplaces and Price Finder without overwriting existing metrics; rejecting closes the request. The contact is emailed the decision when email is configured. Rate limited to 5 per hour per IP, with a hidden bot field. |
| Email alerts | When a monitored link that was live in the previous run stops being live (missing, nofollow, page unreachable), the owner gets one email per run. Users can turn alerts off in Account settings. |

## Connect real data

There is **no invented publisher inventory** in the hosted database. Publishers can also request a listing themselves from `/list-your-site/`; an administrator approves each request. Import your licensed inventory from Administration using `public/inventory-template.csv`; a domain can have several marketplace/type offers. Required columns: `domain,marketplace,price`. Optional columns include `type,title,category,country,language,authority,dr,traffic,referring_domains,traffic_top,all_traffic_top,all_traffic,monthly_min,follow,sponsored,restricted,niches,url,metrics_source`. `category` may hold several categories separated by commas; `niches` accepts casino, cbd, crypto, dating, forex, pharma and other.

Set secrets in `.env.local` locally, or the private Site's runtime environment. Do not place secrets in browser code or Git.

| Credentials | Enables |
|---|---|
| `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | Google SERPs and backlink summary/referring-domain requests. Provider subscriptions and balance are required. |
| `PERPLEXITY_API_KEY` | AI citations via the Perplexity Agent endpoint. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Checkout and payment verification. |
| `STRIPE_PRO_PRICE_ID`, `STRIPE_ADVANCED_PRICE_ID` | Configured subscription products. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Password reset emails and backlink alerts (Resend). `EMAIL_FROM` must use a domain verified in Resend. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | "Log in with Google". Add `<APP_ORIGIN>/api/auth/google/callback/` as an authorized redirect URI in Google Cloud. |
| `CRON_SECRET` | Scheduled monitoring. On Vercel the bundled daily cron calls the tick endpoint with this secret. |

Without credentials, affected operations report **not connected** and do not spend units or fabricate results. Live provider calls were not tested against paid accounts. Automated tests use explicitly isolated fixtures.

Stripe webhook route is `/api/billing/webhook`. Configure `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, and `customer.subscription.deleted`. A Stripe webhook must have a supported network route to the handler; an owner-private Site is not anonymously reachable by Stripe. Keep private access intact until a separately authorized public webhook ingress/deployment is configured. No live payment has been made.

## Monitoring while closed

The local server processes pending checks every 30 seconds while it runs. Group progress is checkpointed in SQL; opening the monitor page also advances pending checks. Every scheduled cycle charges the account and stops on insufficient units.

Hosted unattended updates use the parameter-free `/api/internal/tick` endpoint. In the owner-private Sites deployment, `PRIVATE_SCHEDULER=1` uses the platform's authenticated service boundary. The linked updater obtains fresh Site service access; credentials are never stored in its prompt. Do not retain this mode when changing the Site to public. For an independently hosted/public deployment, set `CRON_SECRET` and have your scheduler send `Authorization: Bearer <CRON_SECRET>` to this endpoint (GET or POST). On Vercel, `vercel.json` already defines a daily Vercel Cron (06:00 UTC) for it; each call keeps crawling for up to 40 seconds. The Hobby plan runs crons once a day, so daily and weekly schedules are both honoured. User-owned interactive routes always require user identity.

## Boundaries still different from the original

- The app reproduces inspected screens and core flows; it is not a certified pixel-perfect copy of every paid/private state.
- Marketplace prices and SEO metrics come from your imported/licensed data. Automatic refresh of Semrush/Ahrefs metrics and original marketplace feeds is not implemented.
- Google Sheets OAuth export, competitor/relevance scoring and original outreach/contact enrichment are not implemented. Google sign-in, password recovery email and backlink alert email work only after their credentials are configured; without them the app says so instead of pretending to succeed.
- AI Search currently offers Perplexity Agent, not the original model catalog. Some provider-specific result columns remain blank when no imported value exists.
- In-app monitoring updates, history and email alerts work; purchasing directly from third-party marketplaces requires additional agreements. Admin fulfillment is manual.
- The marketing website is not a complete recreation; this revision focuses on the `go.fatgrid.com` workspace and all its left-navigation pages.

## Validation

37 automated tests (all also pass against MySQL 8.4 with `sql_require_primary_key=ON`, as on Aiven) cover restricted niches and country flags, demo listings, publisher listing requests and admin approval, password change and email reset, shared-project roles, Google sign-in state and email verification, cron authorization, backlink alert emails, every MySQL table having a primary key, authentication/session invalidation, ownership, cross-origin rejection, import atomicity, credits under concurrent requests, unavailable-provider behavior, server-side order prices, support isolation, actual HTML parsing, private-network rejection, recovery refunds, grouped-check progress, exact subdomains, saved preferences, quotes, Google billing, partial provider refunds, signed invoice processing and webhook replay protection.

Browser checks cover local login, project creation surviving reload, named monitor creation and a real public-page crawl. Visual comparisons used the original authenticated app at the same viewport. `npm run build` checks types and generates all routes. Dependency audit is clean after patching the transitive esbuild dependency.

## Code map

- `app/dashboard.tsx`: session, navigation, header, workspace state.
- `app/views.tsx`, `app/workflows.tsx`, `app/dialog.tsx`: screens and forms.
- `app/globals.css`: reference-matched styling and responsive behavior.
- `server/api.ts`: authenticated operations, pricing, projects, credits, admin.
- `server/monitoring.ts`: durable grouped crawler jobs and scheduling.
- `server/auth.ts`, `server/providers.ts`, `server/billing.ts`: auth and external adapters.
- `server/schema.ts`, `drizzle/`: SQL schema and immutable migrations.
- `server/local.ts`, `worker/index.ts`: local and hosted runtime adapters.

Provider references: [DataForSEO backlinks summary](https://docs.dataforseo.com/v3/backlinks-summary-live/), [Perplexity Agent API](https://docs.perplexity.ai/), [Stripe webhooks](https://docs.stripe.com/webhooks).

## Credits

Country flags use the "Twemoji Country Flags" font from [country-flag-emoji-polyfill](https://github.com/talkjs/country-flag-emoji-polyfill) (MIT), with flag artwork from [Twemoji](https://github.com/twitter/twemoji) licensed under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). See `public/fonts/TWEMOJI-FLAGS-LICENSE.txt`.
