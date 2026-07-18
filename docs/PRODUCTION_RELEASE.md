# NivasaOS 1.0 production release guide

NivasaOS is self-hosted and requires no paid platform or external API for core operation. Production readiness is proven by the repository-owned local gate, not by GitHub Actions or another hosted CI service.

## Fast production setup

The included `compose.production.yml` runs NivasaOS behind Caddy with automatic HTTPS.

```bash
git clone https://github.com/smeetbuilds/nivasaos.git
cd nivasaos
cp .env.production.example .env.production
bun run setup:token
```

Copy the generated `NIVASA_INSTALL_TOKEN=...` line into `.env.production`, then set:

```env
NIVASA_DOMAIN=property.example.com
NIVASA_PUBLIC_URL=https://property.example.com
NIVASA_INSTALL_TOKEN=<generated value>
```

Point the domain to the server and start:

```bash
docker compose -f compose.production.yml up -d --build
```

Complete the browser installer using the token. After the first owner exists, remove `NIVASA_INSTALL_TOKEN` from `.env.production` and restart the application service.

## Required release gate

Run from the exact commit intended for deployment:

```bash
bun install --frozen-lockfile
bun run gate
```

The gate performs:

1. tracked-secret and environment-file verification;
2. JavaScript and JSX parsing;
3. fresh-schema and legacy-migration verification;
4. finance and operations verification;
5. responsive UI and portal contract verification;
6. handover and modular integrity verification;
7. vertical workflow, permission, reservation and bulk-job verification;
8. open-source packaging and production-runtime verification;
9. a production Next.js build;
10. an isolated production server smoke test.

Do not deploy when any gate step fails.

## Production environment contract

Required for a fresh installation:

- `NIVASA_PUBLIC_URL` — canonical HTTPS origin;
- `NIVASA_INSTALL_TOKEN` — at least 24 characters until the first owner is created;
- persistent paths for SQLite, uploads and backups.

The production compose file configures storage paths automatically. Direct installations may use:

```env
NODE_ENV=production
NIVASA_DB_PATH=/srv/nivasaos/data/nivasaos.sqlite
NIVASA_UPLOAD_DIR=/srv/nivasaos/uploads
NIVASA_BACKUP_DIR=/srv/nivasaos/backups
NIVASA_PUBLIC_URL=https://property.example.com
NIVASA_INSTALL_TOKEN=<generated locally>
```

`NIVASA_PUBLIC_URL` must contain only an HTTPS scheme and host. Credentials, paths, query strings, fragments, localhost, and plain HTTP are rejected in production. The local compose stack explicitly opts into localhost for development.

## Protected first installation

A fresh public server must never allow an arbitrary visitor to claim the owner account.

Generate the token locally:

```bash
bun run setup:token
```

The installer requires that token only while no owner exists. The token is compared in constant time and is not stored in SQLite. Remove it after successful installation.

## Reproducible containers

The Docker build copies `package.json` and `bun.lock` before running:

```bash
bun install --frozen-lockfile
```

Local `.env` files are excluded from the Docker build context. Only environment templates are permitted in the image source tree.

## Minimum production requirements

- persistent writable storage for SQLite, uploads and backups;
- HTTPS at the public edge;
- a process supervisor or container restart policy;
- adequate upload limits for approved documents;
- encrypted off-host backups and a tested restore procedure;
- host, Bun/container image, Next.js and reverse-proxy patching.

## Deployment sequence

```bash
git fetch --all --tags
git checkout <release-commit>
bun install --frozen-lockfile
bun run gate
bun run backup
bun run build
bun run start
```

For an existing installation:

1. stop writes or enter maintenance mode;
2. create and encrypt an off-host backup;
3. run the gate against the release commit;
4. test the release against a copy of production data;
5. verify migrations, health, staff login and tenant login;
6. start against production storage;
7. verify invoices, payments, uploads and one module-specific workflow.

## Reverse-proxy baseline

The included Caddy configuration:

- obtains and renews TLS certificates;
- redirects HTTP to HTTPS;
- proxies only to the internal application service;
- enables compression;
- adds HSTS, content-type and referrer-policy headers;
- removes the server response header.

Operators using another reverse proxy must forward `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto`, disable public caching on authenticated routes, and apply appropriate upload and login rate limits.

## Storage and data protection

- Keep SQLite WAL, SHM and database files on the same persistent volume.
- Never serve the data, upload or backup directories publicly.
- Do not copy a live SQLite file with a generic filesystem copy.
- Use `bun run backup` and validate restores regularly.
- Encrypt every off-host archive.
- Restrict filesystem and Docker-volume access.

See [Backups and restore](BACKUPS.md).

## Operational monitoring

Monitor at minimum:

- `/api/health` response and latency;
- process or container restarts;
- disk capacity for data, uploads and backups;
- backup age and restore-test date;
- HTTP 5xx responses and slow requests;
- failed payment-proof or document uploads;
- bulk jobs left in `running` state;
- reservation, allocation and permission integrity errors.

## Security checklist

- Use unique owner and staff passwords.
- Remove the installer token after first-owner creation.
- Disable accounts immediately when access ends.
- Grant minimum property and action permissions.
- Keep HTTPS enabled for every staff and portal request.
- Run `bun run verify:secrets` before every release.
- Never commit `.env`, database files, uploads, backup archives, keys or tokens.
- Review `SECURITY.md` before launch.

## Scale boundary

NivasaOS 1.0 is designed for one application instance backed by SQLite. Do not share one SQLite file across multiple application replicas. Very large or multi-instance deployments should plan PostgreSQL and durable background workers.

## Rollback

Application rollback and data rollback are separate decisions.

- Roll back code only when the previous release understands the migrated schema.
- Stop all writers before restoring a database.
- Preserve failed-release data and logs for investigation.
- Run `bun run restore -- <backup-file> --force`, then `bun run gate` before reopening access.

## Release evidence

Record:

- commit SHA;
- Bun and container-image version;
- gate output;
- backup path and checksum;
- restore-drill evidence;
- deployment timestamp and operator;
- post-deployment health and smoke-test results.
