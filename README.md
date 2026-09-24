# Internet Business Manager — Vue + Node.js + PostgreSQL

Standalone conversion of the attached **Internet Business Manager v1.4.6.18** WordPress plugin. The WordPress plugin is retained separately; this application does not install as a WordPress plugin.

## What is included

- Vue 3 responsive admin interface, Node.js/Express API, PostgreSQL schema.
- Login and session cookies; Super Admin can see all offices, other roles are limited to their assigned office on the server.
- Dashboard; offices; users; customers; packages; monthly bill processing and reversal; collections and reversals; bill slips; ISP payments; salary; expenses; new lines; line transfers; reports; backup and restore.
- Bill slips and reports can be printed or saved as PDF through the browser. Reports download as an Excel-compatible UTF-8 CSV.
- Legacy WordPress `IBM_BACKUP_V1` JSON and `.ibmbak.gz` import with record IDs preserved. Imported WordPress `$P$`, `$wp$2y$`, `$2y$` and legacy MD5 password hashes are verified on login and upgraded to bcrypt.

### Business rules carried across

| Rule | Implementation |
| --- | --- |
| Monthly bill | One processed snapshot per office/month, including all customers as in the plugin; `total_due = monthly_bill + previous_due`. |
| Collections | Partial payments reduce balance; methods: Cash, bKash, Nagad, Rocket, Bank, Other. Payments can be reversed. |
| Dashboard due | `max(0, active customer monthly bill − received customer payments for selected month)`. |
| Dashboard net | `received customer payments − ISP bill − office expenses − staff salary`. |
| Report profit | Collections for the bill snapshot minus ISP payments for the month. |
| Office permissions | Super Admin sees all offices; other accounts are restricted to their own office. |

**Data consistency adjustment:** Payments collected before a month's bill is processed are attached to that bill snapshot when it is processed. A processed bill cannot be reversed until its linked payments have been reversed. This prevents lost payment history and incorrect balances. The original plugin could delete a processed batch while leaving payment references.

## Requirements

- Node.js 20+ and PostgreSQL 14+.
- A PostgreSQL database and a database user with permission to create tables.

## Deploy the frontend and backend separately on Vercel

Create **two Vercel projects from this one GitHub repository**. The Vue project
uses `client/` as its root; the Node.js/Express project uses `server/` as its
root. PostgreSQL is hosted separately (for example, on Neon). Only the backend
has database credentials. Browser requests go to the Vue project's `/api` path;
its small proxy sends them to the backend, so login keeps using an HTTP-only
cookie on the frontend domain.

1. Prepare PostgreSQL. Create a Neon database or reuse the existing one if it
   already contains this app's data. Copy its **pooled** connection string.
   For an empty database, set `DATABASE_URL`, a unique `BOOTSTRAP_USER`, and a
   `BOOTSTRAP_PASSWORD` of at least 12 characters on your computer. From the
   repository root, run `npm ci` and `npm run init -w server` **once**. Skip
   this step if `ib_users` already contains users. Do not put these credentials
   in Git or in a `VITE_` variable.
2. Push this repository to GitHub at `monirkhanbd007/ispbill`. In Vercel, select
   **Add New → Project**, import that repository, and create the **backend**
   project with **Root Directory: `server`** and **Framework Preset: Express**.
   `server/vercel.json` runs `npm ci --workspaces=false`; Vercel detects `server/src/index.js` as
   the Express entry point. Set `DATABASE_URL` to the pooled connection string
   and `NODE_ENV=production` for Production before deploying. Do not set
   `BOOTSTRAP_PASSWORD` in Vercel. Deploy, copy the backend's `https://...`
   domain, and check `https://BACKEND-DOMAIN/api/health` for `{"ok":true}`.
3. Create a second Vercel project from the **same repository** with **Root
   Directory: `client`** and **Framework Preset: Vite**. `client/vercel.json`
   runs `npm ci --workspaces=false --include=dev`, builds with
   `npm run build --workspaces=false`, and publishes
   `dist`. Set `BACKEND_URL` for Production to the backend's HTTPS origin,
   for example `https://your-backend.vercel.app` (no `/api` suffix). Deploy
   and copy the frontend's `https://...` domain. Set both projects to Node.js
   **24.x** if Vercel asks for a version.
4. In the **backend** project's Environment Variables, set `APP_ORIGIN` for
   Production to the exact frontend origin, for example
   `https://your-frontend.vercel.app` (no trailing slash). Redeploy the backend
   so it picks up the new variable. Open the frontend site, sign in, and check
   an office, customer, and known monthly bill. If sign-in returns 403, check
   `APP_ORIGIN`; if the frontend returns 502, check its `BACKEND_URL` and the
   backend function logs.

**Preview deployments:** Use a separate Neon branch/database for backend
Preview and set a Preview `DATABASE_URL` there. Point the frontend Preview
`BACKEND_URL` to that backend Preview deployment, and set its `APP_ORIGIN` to
the frontend Preview origin. A preview connected to the production database can
write real billing records. Environment-variable changes require a redeploy.

### Publishing later changes

Keep both Vercel projects connected to the same Git repository. Edit the Vue
client, Express API, and/or SQL as needed, run `npm test` and `npm run build`,
then commit and push. Vercel redeploys both projects automatically from `main`.
The backend `DATABASE_URL` still points to the same Neon database, so existing
data remains. Test changes in Preview with a separate Neon branch first.

For new tables or columns, save a **versioned, reviewed SQL migration** and
run it against a backed-up Neon database before deploying code that requires
it. `server/sql/001_schema.sql` is an initial schema, not an automatic
migration system. Favor additive migrations so an older deployment can still
work during a rollback; code rollback does not undo database migrations.
Record every migration applied to production. Take a Neon database backup or
restore point before structural changes. Changing billing calculations needs
new checks against representative existing bills as well as the unit tests.

The local `restore-backup.js` writes a safety file under `recovery-backups/`;
run it on a persistent local computer if ever needed, **not** inside a Vercel
Function, whose filesystem is not suitable for persistent backup files.

## Local setup

```bash
cp .env.example .env
# Edit DATABASE_URL and set a unique BOOTSTRAP_PASSWORD (at least 12 characters).
# Export the variables in .env for the shell, or load them with your process manager.
set -a; . ./.env; set +a
npm install
npm run init -w server
npm run dev
```

Open `http://localhost:5173` and use `BOOTSTRAP_USER` / `BOOTSTRAP_PASSWORD`.
Locally, Vite forwards `/api` to the Node.js server on port `3001`. For a
non-Vercel production setup, host the built Vue `client/dist` files and the
Node.js `server` process separately; route the frontend's `/api` path to the
backend and set `APP_ORIGIN` to the frontend origin.

The SQL schema is in `server/sql/001_schema.sql`. Initialization is safe to run again: it creates tables if missing and only creates an administrator when there are no users.

## Migrate WordPress data

1. In the WordPress plugin, open **Database Backup Manager** and download the latest `.ibmbak.gz` or `.ibmbak` backup.
2. On a **new, otherwise empty** PostgreSQL database, initialize the schema and run:

   ```bash
   npm run import -w server -- /absolute/path/to/backup.ibmbak.gz
   ```

3. Import retains office, customer, package, bill, payment, salary and expense IDs and original user accounts. It creates one new Super Admin using the bootstrap credentials so you can sign in even if a legacy password was generated by an unusual WordPress plugin.
4. Compare an office/month dashboard, a processed bill and a few customer balances against WordPress before switching the live URL. Keep the old plugin online but read only while reconciling; stop writes before taking the final backup and importing it.

The import runs in one database transaction and refuses to overwrite an occupied target database. It accepts tables from the plugin backup, ignores MySQL `CREATE TABLE` statements, and creates PostgreSQL tables from the included schema. `ib_isp_payments` is defined here because the attached PHP file uses it but does not contain its create-table statement. If it is absent from the old backup, its new table starts empty. WordPress options such as the bill slip support number are not included in the plugin's `ib_*` backup; configure that number in the new app.

## Backups and restoring

The **Database Backup** screen downloads a `IBM_PG_V1` JSON snapshot. To restore, stop the app so no writes occur, take a separate database backup, set the environment variables and run:

```bash
npm run restore -w server -- /absolute/path/to/internet-business-backup.json --confirm
```

Restore saves a `before-restore-*.json` safety copy in `recovery-backups/`, then replaces the business records in a single transaction. Sessions are cleared. Restrict access to these files: they include user password hashes and customer PPPoE credentials. The backup format is not SQL and should only be opened by trusted administrators.

## Notes on parity

- The plugin's **Reports** menu is only a future-module placeholder; this version implements monthly totals and a downloadable customer report.
- The plugin's bill slip includes print styling tied to WordPress; this version has browser print/PDF output using the same bill amounts, office information and support number.
- User and customer operations validate the assigned office and package ownership at the API, including direct calls that bypass the Vue interface.
- An old WordPress installation may contain additional `ib_*` tables created by other plugins or older releases. Unknown tables are ignored by the importer; review them before decommissioning WordPress.
- The source stores PPPoE passwords as plain text. Imported values stay accessible to authorized users. Plan encryption at rest if the deployment requires it.

## Verification

Run `npm test` for billing formula checks and `npm run build` for Vue compilation. An actual PostgreSQL connection and a real backup are needed to complete live end-to-end migration checks; neither is bundled with the source.
