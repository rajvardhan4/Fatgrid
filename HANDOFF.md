# FatGrid — Complete Project Handoff

Prepared: 26 October 2026 (Asia/Calcutta)
Source release: 90f6ca1 — Add MySQL backend and protected administrator user portal
Repository: https://github.com/rajvardhan4/Fatgrid
Live frontend/API: https://fatgrid-ebon.vercel.app/

## 1. Start here: current status

The code is deployed on Vercel. The backend now supports MySQL, and the admin portal is implemented. **The production database is NOT connected.** The owner confirmed that no cloud MySQL hosting exists yet. Registration, login and persistent account operations cannot work until a real cloud database is configured.

The message `MySQL setup required. Add MYSQL_URL to Vercel environment variables, then redeploy.` is an intentional configuration error, not a request to start a local server. A blank template, a localhost address, the Vercel website URL, or a made-up connection string will not solve it.

Last verified deployment: /api/session returned 200 with databaseConfigured=false; /api/health returned 503 database_not_configured. A successful Vercel build alone does not confirm a working database.

## 2. Exact steps to solve the live error

1. Create a cloud MySQL service. One option is Aiven: https://console.aiven.io/ . Choose MySQL and a suitable plan. Aiven documents a free tier at https://aiven.io/docs/products/mysql/concepts/mysql-free-tier ; capacity and inactivity restrictions apply.
2. Wait until the service is running. Open its Connection information. Copy the actual Service URI, including its own port and database name. Do not replace the provider's database name or port with invented values.
3. For Aiven, download the CA certificate. Open the PEM file as text and copy the complete certificate, including BEGIN CERTIFICATE and END CERTIFICATE lines.
4. Open Vercel > fatgrid project > Settings > Environment Variables. Set these for Production (and Preview separately if desired):

| Key | Value |
| --- | --- |
| MYSQL_URL | Actual provider URI: mysql://USER:PASSWORD@HOST:PORT/DATABASE |
| MYSQL_SSL_CA | Complete provider CA PEM certificate, required for Aiven certificate verification |
| APP_ORIGIN | https://fatgrid-ebon.vercel.app |

5. Paste only the value into each Value field. Do not paste `MYSQL_URL=` into that field. Do not put surrounding quotes in the Vercel Value field. Preserve the password; percent-encode special characters if manually constructing a URI. Prefer copying the provider's full URI.
6. Save, then Deployments > latest deployment > Redeploy. Environment changes need a new deployment.
7. Open https://fatgrid-ebon.vercel.app/api/health . HTTP 200 confirms connectivity. The first API connection creates the schema automatically.
8. Register your real account at /auth/register/, log out and log in again, create a project, reload and confirm it persists. Then activate your admin account using section 5.

Do not share a database password, full URI or token in chat or screenshots. The downloadable env file is a template and has blank credentials intentionally. Filling it requires the real database service.

If the error remains:
- `database_not_configured`: MYSQL_URL is missing/invalid, set in the wrong Vercel project/environment, or a new deployment was not created.
- `database_connection_failed`: check service status, host/port, user/password, database name, provider network restrictions and CA certificate. Check Vercel function logs. Never disable TLS verification to bypass a certificate error.
- API 404/HTML: use Next.js framework, repository root, npm run build:vercel, output .next. Remove old out/dist static output overrides.
- Database permission errors: application migrations require CREATE tables/indexes and foreign-key permissions; normal operations require SELECT, INSERT, UPDATE, DELETE. MySQL advisory locks are used. Use genuine MySQL 8.0.16+; compatible databases that lack GET_LOCK are not verified.

## 3. Project purpose and technology

Independent implementation of the visible go.fatgrid.com workspace. It helps compare publisher offers, organize prospects, run provider-backed scans, monitor backlinks and manage orders/support. The original private source code, database, commercial feeds and internal ranking logic were not available. This is not a guarantee of identical proprietary algorithms or every paid screen.

- Frontend: Next.js 15, React 19, TypeScript, CSS, Lucide icons; locally bundled Geist/Geist Mono fonts and reference assets.
- Vercel backend: Next.js Pages API catch-all at pages/api/[...path].ts, Node.js 24, shared request handlers.
- Production database: MySQL via mysql2 connection pool, TLS verification, SQL schema, transactions, migrations.
- Local default: SQLite in data/fatgrid.sqlite. Set MYSQL_URL to use MySQL locally instead.
- Separate older Sites hosting: Cloudflare Worker + D1, authenticated platform identity. It is a separate deployment/database; not the Vercel database.
- Legacy libSQL adapter remains in source/tests, but Vercel now selects MySQL. MongoDB is not used.
- Validation: Zod. Provider integrations: DataForSEO, Perplexity and Stripe.

## 4. Implemented features

| Module | Implemented behavior |
| --- | --- |
| Accounts | Registration, login/logout, PBKDF2 password hashes, hashed session tokens, secure cookies on HTTPS, account isolation and rate limiting |
| Price Finder | Domain parsing/deduplication, quoted-price comparison, CSV/TXT import, cheapest stored offers, credits, history and CSV export |
| Marketplaces | Inventory filters, sorting/pagination, offer details, saved filters/columns, notes, favorites and publisher decisions |
| Projects | Create/archive, quotas, domain imports, deduplication, notes/status and active-project selection |
| Google Search | Provider request, locale/depth/targets, saved results, publisher matching and credit accounting |
| AI Search | Perplexity citations, answer/results history and charging |
| Backlinks Profile | Provider summary and referring domains, history, partial-result refunds |
| Monitoring | Individual/group checks, backlink status and history, progress checkpoints, retries/refunds, manual runs, scheduling hooks |
| Orders | Server-priced drafts, checkout integration, verified webhook payments, admin fulfillment and placement URL |
| Requests/support | Publisher quote requests, support conversations, admin replies and quote management |
| Admin | User search/list/detail, inventory import, integrations, orders, quotes and support |
| Usage | Credit ledger, atomic reservations, failed-job refunds and monthly free quota refresh |

Provider-dependent features require actual credentials and inventory. A blank database will not contain FatGrid's publishers, prices or SEO metrics. No fake results are substituted for unavailable services.

## 5. Administrator portal

URL: /admin/ . Normal users cannot access admin API routes. An email typed into registration does not automatically receive admin rights.

After registering your real account on the live app:

1. Put the same live MYSQL_URL and MYSQL_SSL_CA into the ignored .env.local file on your trusted computer.
2. Run:

```powershell
npm run admin:grant:remote -- your-existing-email@example.com
```

3. Refresh the live app and open Administration.

The Users tab shows name, email, role, plan, credits and registration time, with search and 50-user pages. Details include projects, project domains, orders, messages, support requests, scans, ledger, backlinks/history, groups/history, saved publishers and quotes. Each detail category currently shows up to 100 records; this is not a full database export. Password hashes and session tokens are excluded.

For the default LOCAL SQLite database only, use `npm run admin:grant -- your-email@example.com`. For MySQL, use admin:grant:remote. No production administrator has been provisioned because the production database is not connected. QA accounts were local test fixtures, not production owner accounts.

## 6. Run from the delivered folder

Install Node.js 24, open a terminal in FatGrid-Project, then:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Frontend: http://127.0.0.1:3000 . Local API: http://127.0.0.1:3001 . SQLite migrations run automatically and data persists in data/fatgrid.sqlite.

For local MySQL, set MYSQL_URL in .env.local. MYSQL_SSL=false is accepted only for localhost development. Production uses verified TLS. Set APP_ORIGIN to the exact browser origin you use.

```powershell
npm run db:migrate:remote
npm run build:vercel
npm test
```

The remote migration/admin commands read .env.local. `npm start` is the standalone local server, not Next.js production start for Vercel. `npm run build` outside Vercel creates the separate static/Worker target; use build:vercel explicitly for Vercel.

## 7. Vercel deployment and schema

- Repository: rajvardhan4/Fatgrid, branch main.
- Framework: Next.js. Build: npm run build:vercel. Output: .next. Node: 24.x.
- vercel.json configures the API function duration. next.config.mjs includes MySQL SQL files in function tracing.
- mysql/0001_initial.sql creates restart-safe InnoDB tables with foreign keys and unique keys. _mysql_migrations tracks application.
- server/mysql-db.ts adapts shared SQL operations, including upserts, RETURNING equivalents and project-domain imports.
- Multi-statement writes use a transaction. Writes are serialized per database using advisory locks to preserve credits and webhook behavior across serverless instances. This is a correctness-first design; load-test before high traffic. Pool limit is 3 per function instance, not a global limit.
- No automatic data copy from SQLite, D1 or Turso. If existing data needs transfer, plan and test an explicit migration first.

Core tables: users, sessions, rate_limits, publishers, offers, projects, project_domains, jobs, scan_details, ledger, monitors, monitor_checks, monitor_groups, monitor_group_history, publisher_decisions, preferences, orders, support_requests, messages, quote_requests, webhook_events.

## 8. External services and pending work

| Variable/integration | Purpose/status |
| --- | --- |
| MYSQL_URL, MYSQL_SSL_CA | Required production database; owner must create hosting and configure |
| DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD | SERP/backlinks; adapter ready, paid live account not verified |
| PERPLEXITY_API_KEY | AI citations; adapter ready, live credentials not provided |
| STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET | Checkout and signed webhook verification; no live payment performed |
| STRIPE_PRO_PRICE_ID, STRIPE_ADVANCED_PRICE_ID | Paid subscription products |
| CRON_SECRET | Authenticate independent scheduler POST /api/internal/tick |
| Licensed inventory CSV | Populate real publishers/offers using public/inventory-template.csv |

Scheduling requires an actual external scheduler in addition to CRON_SECRET. Merely setting a secret does not create a cron job. Local server processes checks while running. Do not enable PRIVATE_SCHEDULER on public Vercel; that option belongs to the separate private Sites runtime.

Stripe webhook endpoint: /api/billing/webhook. Supported events: checkout.session.completed, checkout.session.async_payment_succeeded, invoice.paid, customer.subscription.deleted.

Not implemented: original proprietary feeds/algorithms, automatic Semrush/Ahrefs refresh, Google OAuth, Google Sheets OAuth export, email/password recovery, shared project memberships, original competitor/relevance scoring, email alerts and automatic marketplace purchasing. Marketing site recreation is incomplete. External original-brand/blog/legal/extension links remain; review branding and replace legal/support destinations before commercial launch.

## 9. Code map

| Path | Responsibility |
| --- | --- |
| app/dashboard.tsx | Workspace session/state, sidebar/header and routing |
| app/views.tsx, app/workflows.tsx, app/dialog.tsx | Screens, forms and dialogs |
| app/admin-users.tsx | Admin user directory and account details |
| app/globals.css, public/ | Styling, fonts, logos and inventory template |
| pages/api/[...path].ts | Vercel HTTP adapter |
| server/vercel-api.ts | Runtime settings, MySQL initialization and setup errors |
| server/mysql-db.ts, mysql/ | MySQL connection/transactions/schema |
| server/api.ts | Core authenticated routes and admin authorization |
| server/auth.ts | Passwords, sessions, roles and rate limits |
| server/providers.ts | Search/backlinks/AI integrations and crawl validation |
| server/billing.ts | Stripe checkout/webhooks |
| server/monitoring.ts | Grouped monitor processing and scheduling |
| server/local.ts, server/local-db.ts | Local API and SQLite adapter |
| server/schema.ts, drizzle/ | Legacy SQLite/D1 schema/migrations |
| worker/ | Separate Sites Worker runtime |
| scripts/ | Build, migrations and administrator commands |
| tests/ | Shared workflow, MySQL and permission tests |

## 10. Verification and acceptance checklist

Previous release verification: 23 tests passed with the MySQL-backed workflow fixtures on real MySQL 8.4.13; Vercel production build passed. Covered registration/login, isolation, quotas, inventory, concurrency, credit rollback, provider errors, orders, webhook replay, support, monitoring and admin data access. Browser checks verified MySQL login, persisted account data after application restart and admin directory/details. A local screenshot is included in handoff-assets.

The default `npm test` uses SQLite and skips the dedicated MySQL integration test unless MYSQL_TEST_URL is set. To run MySQL fixtures, provide a TEST-ONLY database/account with CREATE/DROP DATABASE privileges; fixtures create and drop uniquely named fg_test_* databases. Do not point test credentials at production. Live paid provider calls and cloud MySQL connectivity remain unverified.

Before accepting a production launch:
- /api/health returns 200 after a fresh deployment.
- Register/login/logout work and records survive restart/redeploy.
- Owner admin grant is verified; member access to /api/admin/users returns 403.
- Import a small licensed inventory sample and verify price comparison.
- Confirm plan quotas, provider credentials, billing test mode and webhook verification.
- Configure scheduler if needed and confirm scheduled jobs run while browser is closed.
- Arrange provider backups and test recovery; load-test database connection limits.

## 11. Delivery contents and exclusions

FatGrid-Project is a clean source copy of the committed MySQL release plus this handoff, setup templates and screenshot. The ZIP contains the same folder. It does not include node_modules, .git history, build caches, test MySQL binaries, local account databases, .env.local, credentials or production data. Run npm ci to install dependencies.

The working workspace had an unrelated uncommitted mongodb dependency addition. It was preserved there but is not included in this release package; the delivered project uses the committed MySQL dependency set. The source repository and release commit above are the authoritative code baseline.

See README.md for original feature notes and VERCEL.md for deployment. This handoff takes precedence for current MySQL deployment status. Never interpret 'deployed' as 'database connected' until health checks succeed.
