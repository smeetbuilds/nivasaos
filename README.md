# NivasaOS

**Open-source, self-hosted modular property operations. No API keys required.**

NivasaOS 1.0 lets one installation operate residential rentals, PG and co-living, hostels, student housing, staff accommodation, and commercial properties without forcing every property into one generic workflow.

Built by [Aahav Labs](https://aahavlabs.in) and released under the MIT License.

## Why it is inexpensive to run

The core application requires no managed database, hosted authentication provider, object-storage service, payment SaaS, email provider, notification API, or paid CI system.

It runs as:

- one Next.js application;
- one local SQLite database;
- local authenticated upload storage;
- local backup archives;
- an optional Caddy reverse proxy for automatic HTTPS.

The default WhatsApp integration creates a click-to-chat link and does not use the WhatsApp Cloud API. Payment methods are local ledger classifications unless an operator installs an extension.

## Operating models

- **Residential rentals** — household tenancies, deposits, renewals, notices, utilities, meter handover and resident self-service.
- **PG and co-living** — room and bed allocation, lock-in and notice rules, meals, laundry, Wi-Fi, visitors, housekeeping and move-out requests.
- **Hostel and dormitory** — date-bound reservations, bed availability, check-in/out, no-shows, identity references and turnover tasks.
- **Student housing** — student IDs, institution and programme details, guardians, academic terms, curfew and leave requests.
- **Staff accommodation** — employee profiles, departments, payroll recovery, eligibility dates, transfers and HR-linked move-out.
- **Commercial rentals** — business profiles, CAM, escalation, fit-out, compliance, access, notices and business portals.

See [Modular operating models](docs/MODULES.md).

## Core platform

Every operating model reuses the same trusted services:

- properties, units, people and agreements;
- rent runs, manual invoices and late-fee controls;
- partial/full payments and payment-proof review;
- refundable deposit ledger;
- services and recurring billing;
- maintenance conversations;
- move-in, periodic and move-out inspections;
- documents and key/access-item ledger;
- tenant and business portals;
- global and property-specific permissions;
- immutable audit history;
- SQLite backup and restore validation.

## Technology

- Next.js App Router
- React
- Bun runtime and package manager
- SQLite through `bun:sqlite`
- Server Actions
- Local authenticated file storage
- Custom responsive CSS

## Fastest local evaluation

Docker is the recommended path because it avoids installing Bun directly:

```bash
git clone https://github.com/smeetbuilds/nivasaos.git
cd nivasaos
docker compose up -d --build
```

Open `http://localhost:3000` and complete the installer. The local compose file contains a development-only installer token and is intended only for a private local machine.

Stop it with:

```bash
docker compose down
```

Data remains in named Docker volumes.

## Local development with Bun

Requirements:

- Bun 1.3 or later
- writable local storage

```bash
git clone https://github.com/smeetbuilds/nivasaos.git
cd nivasaos
cp .env.example .env
bun install --frozen-lockfile
bun run gate
bun run dev
```

Development installation does not require an installer token. Open `http://localhost:3000` and complete the five-step module-first wizard.

## Low-cost production deployment

The included production compose stack runs NivasaOS behind Caddy with automatic HTTPS.

1. Point a DNS record to the server.
2. Copy the production environment template.
3. Generate a one-time installer token.
4. Start the stack.

```bash
git clone https://github.com/smeetbuilds/nivasaos.git
cd nivasaos
cp .env.production.example .env.production
bun run setup:token
# Copy the generated NIVASA_INSTALL_TOKEN line into .env.production,
# then set NIVASA_DOMAIN and NIVASA_PUBLIC_URL.
docker compose -f compose.production.yml up -d --build
```

Open the configured HTTPS URL and enter the installer token when creating the first owner. After installation succeeds, the token may be removed from `.env.production` and the application restarted.

The application container is not exposed directly in the production compose file. Only Caddy publishes ports 80 and 443.

Read [Production release and deployment](docs/PRODUCTION_RELEASE.md) before launching a real portfolio.

## Environment variables

### Local paths

```env
NIVASA_DB_PATH=./storage/nivasaos.sqlite
NIVASA_UPLOAD_DIR=./storage/uploads
NIVASA_BACKUP_DIR=./storage/backups
NIVASA_PUBLIC_URL=http://localhost:3000
```

### Production bootstrap

```env
NIVASA_DOMAIN=property.example.com
NIVASA_PUBLIC_URL=https://property.example.com
NIVASA_INSTALL_TOKEN=<generated locally>
```

`NIVASA_INSTALL_TOKEN` is required only while a production database has no owner account. `NIVASA_PUBLIC_URL` must be HTTPS and must not contain credentials, a path, query string, or fragment.

## Verification

```bash
bun run verify:secrets
bun run verify
bun run gate
```

`verify:secrets` scans tracked repository files for common credentials, private keys, credential-bearing database URLs, personal workstation paths, private registry references, and accidentally tracked environment files.

`bun run gate` runs every verifier, builds Next.js, starts an isolated production server, and smoke-tests health, installation, protected workspace routing, and tenant login. It is repository-owned and does not depend on GitHub Actions.

## Backups

```bash
bun run backup
bun run restore -- ./backups/<backup-file>.tar.gz --force
```

The built-in archive is checksummed and permission-restricted but intentionally not encrypted. Encrypt off-host copies using an operator-controlled tool such as age or restic. See [Backups and restore](docs/BACKUPS.md).

## Extensions

The extension registry supports additional payment methods, notification drivers, dashboard sections, and settings sections without changing the core data model. Optional integrations may require their own credentials, but the base project never requires them.

Extension entrypoint: `plugins/index.js`.

## Security model

- Scrypt password hashing with per-user random salts
- SHA-256 session and invitation-token hashes
- HTTP-only SameSite cookies
- One-time tenant activation links
- Production first-run installer token
- Property and permission-scoped staff access
- Authenticated document and proof delivery
- Transactional financial and occupancy updates
- Database integrity triggers
- Auditable staff and tenant actions

Read [SECURITY.md](SECURITY.md) before deployment.

## Scale boundary

NivasaOS 1.0 targets one self-hosted application instance using SQLite. For multi-instance or very high-volume deployments, plan a PostgreSQL and durable-worker evolution instead of sharing one SQLite file across replicas.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Contributions are verified locally and remain MIT licensed.

## License

MIT. See [LICENSE](LICENSE).
