# Production deployment

This repository can deploy as a static React site and a long-running Node API. The API uses PostgreSQL for accounts, sessions, academic records, resource metadata, and governance; file bytes can be stored in a private Cloudflare R2 bucket. Select hosting services that support Node.js 24 or newer, persistent PostgreSQL connections, TLS, and environment secrets.

## Production topology

- Publish the web build from `apps/web/dist` on a static web host.
- Run the API as a persistent Node service from the monorepo root with `npm run start:api`.
- Route requests from the website's `/api/*` path to the API, preserving request and response headers, cookies, and streaming bodies. The frontend uses relative `/api/v1` URLs; Vite's proxy only serves local development.
- Prefer website and API hostnames under the same registrable domain, such as `enghub.example.com` and `api.example.com`. The session cookies use `SameSite=Lax`; unrelated site domains can prevent browser cookies from accompanying API requests.
- Configure `WEB_ORIGIN` to the exact website origin, including `https://` and no path. The API enables credentialed CORS for this origin.

## Build and start

Use Node.js 24 or newer and install from the lockfile. The Prisma client is generated into an ignored directory, so generate it as part of each clean deployment build:

```sh
npm ci
npm run build:production
```

Configure the web host to publish `apps/web/dist`. Configure the API service start command as:

```sh
npm run start:api
```

The API process listens on `API_PORT` (or the port supplied by the host). Configure health checks to use `/health/live` for process liveness and `/health/ready` to check API and database readiness.

## Database release steps

Provide `DATABASE_URL` to the build/release environment. Back up production data before a schema release, then apply checked-in migrations with:

```sh
npm run db:deploy
```

This uses Prisma's production `migrate deploy` command. `npm run db:migrate` is the development workflow and must not be used for production releases. Generate the Super Admin once with the documented `npm run auth:bootstrap-admin` command and process-only `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ADMIN_PASSWORD` values. Never add those values to `.env.example` or source control.

Seed only after verifying the course catalogue and import file intended for production. The current seed includes Computer Engineering course offerings and creates the Electrical and Electronics Engineering department without course offerings.

## Required API configuration

Set these in the hosting provider's secret/configuration store, not in a committed file:

- `NODE_ENV=production`
- `API_PORT` (if required by the host)
- `WEB_ORIGIN=https://<website-hostname>`
- `DATABASE_URL=<managed-postgresql-connection-string>`
- `EMAIL_SMTP_URL=<smtp-or-smtps-connection-url>`
- `EMAIL_FROM=<verified-sender-address>`
- `RESOURCE_STORAGE_PROVIDER=r2`
- `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`
- `RESOURCE_MAX_FILE_SIZE_BYTES` and `RESOURCE_PURGE_INTERVAL_MS` if changing their defaults

Use a private R2 bucket and a token limited to that bucket. Keep its credentials server-side. Uploads and reads currently stream through the API; configure the proxy to permit at least the configured maximum upload size and allow a suitable request timeout. See [STORAGE.md](STORAGE.md) for R2 setup and migration details.

## Before accepting uploads

The API checks extension, declared media type, size, and file signatures, but it does not scan for malware. Add scanning before public uploads, or implement an upload-off switch and launch in read-only mode until scanning is available. Failed-upload cleanup and alerts for missing objects are also outstanding.

The API currently keeps authentication rate limits in memory and runs the scheduled Trash purge worker in its server process. Start with one API instance. Before adding replicas, configure a shared rate-limit store and move the purge worker to a single scheduled worker or otherwise ensure only one instance runs it.

## Launch verification

1. Confirm the site and API resolve over HTTPS, and `/api/*` reaches the API.
2. Confirm `/health/live` and `/health/ready` succeed from the host's health checker.
3. Register an account and verify that the email arrives and links back to the production website.
4. Sign in, refresh, and sign out; confirm session cookies are `Secure` and authenticated requests work through the proxy.
5. Upload a test PDF, approve it, verify guest access to the approved file, and verify guest denial for pending, rejected, trashed, and quarantined files.
6. Exercise a deletion request, restore, and purge in the approved test process.
7. Confirm database backups, R2 retention, monitoring alerts, and a tested restore procedure.

See [STORAGE.md](STORAGE.md) for storage migration and recovery considerations.
