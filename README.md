# NivasaOS

**Open-source, self-hosted modular property operations. No API keys required.**

NivasaOS 1.1 lets one installation operate residential rentals, PG and co-living, hostels, student housing, staff accommodation, and commercial properties without forcing every property into one generic workflow.

Built by [Aahav Labs](https://aahavlabs.in) and released under the MIT License.

## Project status

The current `main` branch is a **technical preview** until its exact commit has passed the repository gate, production dependency audit, container gate, and deployment-specific browser acceptance checks. Do not use an uncertified commit as the sole system of record for real financial, identity, deposit, or legal-document data.

The 1.1 release line closes known route/action authorization gaps, adds database-backed account and network login throttling, uses timing-equalized password verification, protects first-owner installation, validates workspace timezones, and expands release verification with integration, container, backup, restore, restart, and audit-hardening checks.

NivasaOS remains a **manual-first, single-instance, self-hosted application**. Read [Known limitations](docs/KNOWN_LIMITATIONS.md) before using real resident or financial data.

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

- properties, units, spaces, people and agreements;
- rent runs, manual invoices and late-fee controls;
- partial/full payments and payment-proof review;
- refundable deposit ledger;
- services and recurring billing;
- maintenance conversations;
- move-in, periodic and move-out inspections;
- documents and key/access-item ledger;
- tenant and business portals;
- global and property-specific permissions;
- application append-only audit history;
- SQLite backup and restore validation.

“Application append-only” means supported application workflows create audit records and do not expose audit editing. It is not a cryptographic or database-administrator-proof immutability guarantee.

## Authorization model

NivasaOS enforces permission contracts at navigation, route-read, visible-action, row-action, file-delivery and Server Action boundaries.

Property-scoped permissions include portfolio viewing, inventory, people, agreements, billing, payments, deposits, portal access, services, visitors, maintenance, handover, vertical operations, request review, reservations, housekeeping, reports and property-scoped audit history.

Portfolio-wide governance permissions include property creation, team management and workspace settings. Owners retain full authority; delegated users receive only effective permissions for assigned properties.

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

Open `http://localhost:3000` and complete the installer. The local `compose.yml` contains a development-only installer token and is intended only for a private local machine.

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

Development installation does not require an installer token. Open `http://localhost:3000` and complete the module-first wizard.

## Low-cost production deployment

The included production Compose stack runs NivasaOS behind Caddy with automatic HTTPS. Caddy receives only the domain variable; application credentials remain scoped to the application container.

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

Open the configured HTTPS URL and enter the installer token when creating the first owner. After installation succeeds, remove the token from `.env.production` and restart the application.

The application container is not exposed directly in the production Compose file. Only Caddy publishes ports 80 and 443.

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

The workspace timezone must be a valid IANA timezone such as `Asia/Kolkata` or `Europe/London`. Business dates and displayed timestamps use the configured workspace timezone.

## Verification

```bash
bun run verify:secrets
bun run verify
bun run gate
```

`verify:secrets` scans Git-tracked files when Git metadata is present and safely falls back to scanning the build context inside containers.

`bun run gate`:

1. runs every repository verifier, including audit-hardening contracts;
2. builds the production Next.js application;
3. starts an isolated production server;
4. tests runtime rejection of unsafe production configuration;
5. checks fresh-install, protected-workspace and tenant-login routes;
6. creates and restores a real database-and-upload backup;
7. restarts the production server and rechecks health.

Dependency advisory checks require registry access and are deliberately separate from the offline-capable repository gate:

```bash
bun run audit:dependencies
```

For Docker and Compose changes, also run:

```bash
bun run gate:container
```

The optional CircleCI configuration installs the pinned dependency graph, audits production dependencies, runs `bun run gate`, and then runs the container gate on `main`. CircleCI is a runner, not the source of truth, and the application does not require hosted CI to build or operate.

A commit is not certified merely because these commands exist. Record the actual successful output for the exact deployment commit.

## Financial precision

New financial inputs are normalized through integer minor-unit calculations, primary payment/deposit reconciliation compares integer cents, and SQLite triggers reject protected money values with more than two decimal places.

The current 1.1 schema still stores historical monetary columns using SQLite `REAL` for backward compatibility. A future version must complete a staged migration to integer minor-unit columns before NivasaOS should be treated as a high-assurance accounting ledger. See [Known limitations](docs/KNOWN_LIMITATIONS.md).

## Backups

```bash
bun run backup
bun run restore -- ./backups/<backup-file>.tar.gz --force
```

The built-in archive is checksummed and permission-restricted but intentionally not encrypted. Encrypt off-host copies using an operator-controlled tool such as age or restic. Scheduled cron, systemd and Docker examples are in [Backups and restore](docs/BACKUPS.md).

## Extensions

The extension registry supports additional payment methods, notification drivers, dashboard sections and settings sections without changing the core data model. Optional integrations may require their own credentials, but the base project never requires them.

Extension entrypoint: `plugins/index.js`.

## Security model

- Scrypt password hashing with per-user random salts
- timing-equalized verification for unknown accounts
- database-backed account and network throttling without storing raw client addresses
- SHA-256 session, invitation and throttle-key hashes
- HTTP-only SameSite cookies
- short-lived HTTP-only administrative handoff for newly generated tenant links
- one-time tenant activation links
- atomic production first-owner installation
- property and permission-scoped staff access
- permission-enforced authenticated document and proof delivery
- transactional financial and occupancy updates
- database integrity and money-scale triggers
- auditable staff and tenant actions
- baseline CSP, frame, referrer, permissions and content-type headers

Read [SECURITY.md](SECURITY.md) before deployment.

## Scale boundary

NivasaOS 1.1 targets one self-hosted application instance using SQLite. Do not share one SQLite file across multiple application replicas. For multi-instance or very high-volume deployments, plan a PostgreSQL and durable-worker evolution.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md). Use the repository issue templates for reproducible bugs and scoped feature proposals. Contributions are verified locally and remain MIT licensed.

## License

MIT. See [LICENSE](LICENSE).
