# MySQL deployment on Vercel

The Vercel backend now uses MySQL 8.0.16 or newer. Existing SQLite/D1 Sites data and local files are not automatically copied. The frontend and existing workflows stay the same.

1. Create a cloud MySQL database and database user. Use a provider endpoint reachable from Vercel with TLS enabled.
2. In Vercel > Project > Settings > Environment Variables, set Production:
   - MYSQL_URL: mysql://USER:PASSWORD@HOST:PORT/DATABASE (use the actual provider values; percent-encode special characters in username/password).
   - APP_ORIGIN: https://fatgrid-ebon.vercel.app
   - MYSQL_SSL_CA: optional provider CA PEM certificate, when required. TLS certificate verification is enabled; do not disable it in production.
3. Remove obsolete TURSO_DATABASE_URL/TURSO_AUTH_TOKEN values to avoid confusion. Save and redeploy.
4. The API creates the schema on its first connection. The database user needs CREATE and index/foreign-key privileges as well as SELECT, INSERT, UPDATE and DELETE. MySQL DDL is restart-safe and migrations are serialized by a database advisory lock.
5. Check /api/health: only HTTP 200 confirms database connectivity. Register your account on the live site.

## Administrator portal

Users cannot choose an admin role during registration. To grant your existing account admin access, place MYSQL_URL and any required MYSQL_SSL_CA in the ignored .env.local file, then run:

    npm run admin:grant:remote -- your-existing-email@example.com

Reopen /admin/. The Users tab supports name/email search, pagination, account details, projects, orders, requests, scans, unit history, monitoring, saved publishers and quotes. Detail categories show up to 100 records. Password hashes and session tokens are not returned. API authorization is enforced independently of the frontend.

## Build and database operations

Vercel framework: Next.js; build: npm run build:vercel; output: .next; Node: 24.x. Do not use static export/out for Vercel.

    npm run db:migrate:remote

Local development defaults to SQLite. To use MySQL locally, set MYSQL_URL in .env.local. MYSQL_SSL=false is supported only for localhost development.

The separate owner-private Sites deployment continues to use its existing D1 worker. External SEO/search/billing providers still require their own credentials. Connecting MySQL does not activate those services. Scheduling requires CRON_SECRET; the bundled Vercel Cron then calls the endpoint daily.

Do not commit .env files, database passwords or tokens. .env.vercel is a local ignored template and must be filled before import.

## Optional services (add in Vercel > Settings > Environment Variables, then redeploy)

Each feature stays switched off, with a clear message in the app, until its variables are set.

| Feature | Variables | Where to get them |
|---|---|---|
| Password reset email, backlink alert email | `RESEND_API_KEY`, `EMAIL_FROM` | https://resend.com : add and verify your sending domain, create an API key. `EMAIL_FROM` looks like `FatGrid <no-reply@your-domain.com>`. |
| Log in with Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console > APIs & Services > Credentials > OAuth client ID (Web application). Authorized redirect URI: `https://fatgrid-ebon.vercel.app/api/auth/google/callback/` (keep the final slash). |
| Scanners (Google, AI, Backlinks Profile, Backlinks Monitoring) | `FEATURE_SCANNERS=1` | Removed from the site unless this is set. Add it and redeploy to bring them back. |
| Scheduled backlink monitoring | `CRON_SECRET` | Any long random string. `vercel.json` already runs a daily Vercel Cron at 06:00 UTC that sends it to `/api/internal/tick/`. |
| Google / Backlinks / AI search | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `PERPLEXITY_API_KEY` | DataForSEO and Perplexity accounts with balance. |
| Paid plans and order payment | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `STRIPE_ADVANCED_PRICE_ID` | Stripe dashboard. See "Stripe setup" below. |

### Stripe setup (plans and order payments)

1. Stripe → Product catalog: create two products with a **monthly recurring** price: Pro ($34) and Advanced ($199). Copy each price ID (`price_...`) into `STRIPE_PRO_PRICE_ID` and `STRIPE_ADVANCED_PRICE_ID`.
2. Stripe → Developers → API keys: copy the secret key into `STRIPE_SECRET_KEY` (use the `sk_test_...` key first to try everything with test cards).
3. Stripe → Developers → Webhooks → Add endpoint: `https://fatgrid-ebon.vercel.app/api/billing/webhook/` (keep the final slash: without it the site answers with a redirect, which Stripe does not follow) with the events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy its signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.
4. Stripe → Settings → Billing → Customer portal: save the portal settings once and allow customers to switch between the Pro and Advanced prices and to cancel. "Manage subscription" opens this portal.
5. Redeploy. Pricing then shows "Choose Pro/Advanced" (Stripe Checkout). The plan and units change only when Stripe's signed webhook confirms the payment; a paying customer switches or cancels through the portal; a cancelled subscription returns the account to the free plan. Order drafts are paid with "Proceed to payment" and turn paid through the same webhook.

Without these keys, Pricing says online payments are being set up and "Contact us to upgrade" opens a support request; nothing is charged.

Database changes for these features (`password_resets`, `project_members`) are applied automatically on the first request after deployment (`mysql/0002_accounts_sharing.sql`).

## If you do not have hosting yet

Aiven offers a free MySQL tier: https://aiven.io/docs/products/mysql/concepts/mysql-free-tier . Create a MySQL service in https://console.aiven.io/ and wait until it is running. Copy its Service URI into MYSQL_URL. Download the project's CA certificate and paste its complete PEM contents into MYSQL_SSL_CA. Save both as Vercel environment variables and redeploy. Never paste the URI or password into chat.

Free plans have capacity limits and may be powered off after inactivity. Review the provider's current terms before using them for production.

Run the shared integration suite against an isolated local MySQL server by setting MYSQL_TEST_URL and running npm test. Test fixtures create and remove uniquely named fg_test_* databases; use a test-only account with CREATE/DROP DATABASE privileges.
