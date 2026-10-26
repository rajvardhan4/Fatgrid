# Vercel deployment

The old deployment exported only HTML. The API was implemented in a separate local Node server and a Cloudflare Worker, neither of which Vercel starts automatically. `/api/session` therefore returned a 404 HTML page, producing the misleading local-start message.

This version includes a Next.js serverless API at `pages/api/[...path].ts`. `vercel.json` selects the Next.js preset, runs `npm run build:vercel`, and uses `.next` output instead of the static `out` directory. Existing SQLite-compatible queries are backed by a remote libSQL database on Vercel. Local development still uses its local SQLite database, and the separate Sites build still uses Cloudflare D1.

## Required database setup

1. Create a **libSQL-compatible database** with Turso. Choose the libSQL engine for this adapter; Turso's newer engine uses a different driver.
2. In Vercel → the Fatgrid project → Settings → Environment Variables, add these for Production (and Preview if desired):
   - `TURSO_DATABASE_URL`: the database's `libsql://…` or HTTPS URL.
   - `TURSO_AUTH_TOKEN`: its database-scoped read/write token. Mark it sensitive. Never use a `NEXT_PUBLIC_` prefix.
   - `APP_ORIGIN`: `https://fatgrid-ebon.vercel.app` (no trailing slash). Alternatively omit it and use the request origin.
3. Redeploy the latest `main` commit. The first backend request applies the bundled, versioned schema migrations. Local data and the private Site's D1 data are **not** automatically copied into this database.
4. Open `/api/health`: expect HTTP 200 and `{"ok":true,"database":"connected"}`. Register an account and create a project; reload to confirm persistence.

Aliases `LIBSQL_DATABASE_URL` and `LIBSQL_AUTH_TOKEN` are also accepted. Local disk paths and `/tmp` are intentionally not used as a production database because function instances must share durable data.

Before a database is configured, the public UI still loads and `/api/session` returns an explicit `databaseConfigured:false` setup state. `/api/health` and storage-dependent operations correctly return HTTP 503. This is **not** a successful database connection; login/data saving require step 2.

## Deployment settings

- Repository: `rajvardhan4/Fatgrid`, production branch `main`.
- Framework: Next.js.
- Node.js: 24.x (pinned in package.json; the crawler dependency requires modern Node).
- Root directory: repository root.
- Build: `npm run build:vercel` (also selected by committed `vercel.json`).
- Output: `.next`; remove any previous `out` or `dist` override.
- Keep provider secrets server-side. Search and payments still require their separate credentials documented in README.
- Do not set `PRIVATE_SCHEDULER` on Vercel. The Vercel adapter ignores Cloudflare identity headers and that private-Site bypass setting.

If Git integration does not trigger automatically, redeploy the latest commit from Vercel's Deployments page. A Git push alone does not prove that a Vercel deployment succeeded.

## Administration and migrations

To manage inventory, register your own account on the Vercel app first. Configure the same remote DB credentials in your ignored local `.env.local`, then run:

```powershell
npm run admin:grant:remote -- your-account@example.com
```

This terminal-only command updates an existing remote account. Self-reported email addresses during public registration never grant admin privileges. To run schema migrations separately, use `npm run db:migrate:remote`.

Optional scheduled processing requires a server scheduler that sends authenticated POST requests to `/api/internal/tick`, with the configured `CRON_SECRET` in `Authorization: Bearer …`. Vercel functions do not run the local server's interval timer. Interactive monitor checks continue through the authenticated process endpoint while the page is open.

Reference: [Turso with Vercel](https://docs.turso.tech/integrations/vercel), [Next.js API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes).
