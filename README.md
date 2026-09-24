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

## Deploy from GitHub to Vercel

This repository includes `api/index.mjs` and `vercel.json` so Vercel serves the
Vue build and runs the existing Express API on the **same domain**. The API
still uses `DATABASE_URL`; Vercel does not run `npm start`, `npm run init`, or
the import script during deployment. Deploying code does not erase Neon data.

1. Create a Neon PostgreSQL database, or use the existing database if it
   already contains this app's tables and users. Copy its **pooled** connection
   string from Neon's Connect dialog (turn on Connection pooling). Keep the
   connection string private; it is a database credential.
2. Initialize an empty database **once** on your own machine. Set
   `DATABASE_URL` to that Neon connection string, `BOOTSTRAP_USER` to a unique
   administrator name, and `BOOTSTRAP_PASSWORD` to a unique password of at
   least 12 characters. Then run, from the repository root:

   ```bash
   npm ci
   npm run init -w server
   ```

   `init` creates missing tables and adds the initial admin only when the
   `ib_users` table has no users. If the database already has this app's users,
   skip initialization. Do not import a WordPress backup into an occupied
   database. Keep the connection string and bootstrap password out of Git and
   out of any `VITE_` variable.
3. Push this repository to GitHub. Its existing remote is
   `https://github.com/monirkhanbd007/ispbill.git`; the Vercel project root is
   the repository root (the folder containing `vercel.json`). If you have
   local changes to publish, commit them and run `git push origin main`.
4. In Vercel, choose **Add New → Project**, connect GitHub if prompted, and
   import `monirkhanbd007/ispbill`. Keep **Root Directory** as `./` and use
   **Framework Preset: Vite**. The checked-in `vercel.json` specifies
   **Install Command: `npm ci --include=dev`**, **Build Command: `npm run build`**, and
   **Output Directory: `client/dist`**. Use Node.js **24.x** in Vercel's
   project settings if a version choice appears. Including dev dependencies
   ensures Vite is installed even when `NODE_ENV=production` is set.
5. Before clicking **Deploy**, open **Environment Variables** in the import
   form. Add `DATABASE_URL` with the Neon pooled connection string for
   **Production**. Add `NODE_ENV=production` for Production. Leave
   `APP_ORIGIN` unset unless you need to restrict requests to a specific
   production domain; same-origin requests work without it. Do not add
   `BOOTSTRAP_PASSWORD` to Vercel. If the project has already been created,
   add these under **Project → Settings → Environment Variables** and redeploy.
6. Deploy. Open `https://YOUR-DOMAIN/api/health` (should return `{"ok":true}`),
   then sign in and check an office, a customer, and one known monthly bill.
   A working health check confirms DB connectivity, but sign-in also checks
   that the expected schema and users exist. If the API returns 500, check
   Vercel's function logs and the Neon connection string. If login returns
   403, check `APP_ORIGIN` and the deployment URL, including `https`.

**Preview deployments:** If you enable Preview, use a separate Neon
branch/database and set its `DATABASE_URL` for Preview in Vercel. A preview
connected to the live production database can write real records. If you later
add a custom domain, update `APP_ORIGIN` to that domain if you set it.
Environment-variable changes require a new deployment.

### Publishing later changes

Keep the same Git repository connected to the Vercel project. Edit the Vue
client, Express API, and/or SQL as needed, run `npm test` and `npm run build`,
then commit and push. Vercel builds and publishes the new code automatically;
the `DATABASE_URL` still points to the same Neon database, so existing data
remains. Test changes in Preview with a separate Neon branch first.

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

Open `http://localhost:5173` and use `BOOTSTRAP_USER` / `BOOTSTRAP_PASSWORD`. For production, run `npm run build` followed by `npm start`; the Node.js server serves the built Vue app on `PORT` (default `3001`). Set `NODE_ENV=production`, `APP_ORIGIN=https://your-domain.example`, a strong database password, HTTPS, and secure database backups. The API and frontend should be served from one origin.

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
