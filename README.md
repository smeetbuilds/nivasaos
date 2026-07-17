# NivasaOS

**Open-source, self-hosted modular property operations.**

NivasaOS 1.0 lets one installation operate several property businesses without forcing them into one generic workflow. Enable the operating models you need, assign one model to each property, and keep finance, security, audit, maintenance, documents and reporting unified.

Built by [Aahav Labs](https://aahavlabs.in).

## Operating models

- **Residential rentals** — household tenancies, deposits, renewals, notices, utilities, meter handover and resident self-service.
- **PG & co-living** — room and bed allocation, lock-in and notice rules, meals, laundry, Wi-Fi, visitors, housekeeping and move-out requests.
- **Hostel & dormitory** — date-bound reservations, bed-level availability, check-in/out, no-shows, identity references and automatic turnover tasks.
- **Student housing** — student IDs, institution/programme details, guardian profiles, academic terms, curfew, leave and overnight-absence requests.
- **Staff accommodation** — employee profiles, employer/department data, payroll recovery, eligibility dates, transfers and HR-linked move-out requests.
- **Commercial rentals** — business profiles, CAM, escalation, fit-out, compliance, access, notices and business-tenant portals.

A mixed portfolio can run several models simultaneously. Each property keeps its own terminology, inventory, operating controls, permissions and portal experience.

See [Modular operating models](docs/MODULES.md) and the [production release guide](docs/PRODUCTION_RELEASE.md).

## Core platform

Every operating model reuses the same trusted services:

- property, unit, person and agreement records;
- monthly rent runs, manual invoices and late-fee controls;
- partial/full payments and tenant payment-proof review;
- refundable deposit ledger;
- services and frequency-correct recurring billing;
- maintenance conversations;
- move-in, periodic and move-out inspections;
- tenant-visible and internal documents;
- key and access-item ledger;
- tenant/business portals and receipts;
- owner, global and property-specific permission controls;
- immutable audit history;
- SQLite backups, restore validation and a repository-owned release gate.

## Vertical operations

### Profiles and requests

Each property receives module-specific configuration and each resident/business record can store only the fields relevant to that operating model. Staff and portal users can create controlled requests such as renewals, notices, meal pauses, bed changes, leave, site transfers, payroll queries, fit-out approvals and compliance updates.

### Hostel front desk

Hostel properties support direct, walk-in, phone, group and external-channel reservations. SQLite prevents partially overlapping reservations and conflicts with active long-stay allocations. Check-out generates an auditable housekeeping turnover task.

### Housekeeping

Hostel, PG, student and staff properties share a responsive work board for turnover, routine/deep cleaning, linen, inspections and locker resets. Assignees must have access to the property.

### Bulk services

Property-wide service billing supports preview and execution modes. Every run is recorded in an idempotent bulk-job ledger and creates at most one invoice per subscription and canonical period.

## Permissions

Property assignment is the hard data boundary. Owners can additionally control action permissions globally or for an individual assigned property, including:

- people and agreements;
- billing, payments and services;
- visitors and maintenance;
- handover and module operations;
- requests, reservations and housekeeping;
- reports, settings, team and audit access.

Navigation is generated from the user’s effective portfolio permissions; hidden navigation is never the only authorization boundary.

## Tenant and business portals

Universal portal features include agreements, invoices, balances, payment proofs, receipts, deposits, maintenance, documents, inspections, keys and profile updates.

Module-specific portal features include allocated beds/spaces, services, visitors, business terms and a request centre. Mobile navigation uses four primary destinations plus a native-style More bottom sheet for secondary destinations.

## Technology

- Next.js App Router
- React
- Bun runtime and package manager
- SQLite through `bun:sqlite`
- Server Actions
- Local authenticated file storage
- Custom responsive CSS

Runtime operation does not require a hosted database, managed authentication provider, object-storage service, payment SaaS or GitHub Actions.

## Requirements

- Bun 1.3 or later
- Persistent writable storage for SQLite, uploads and backups
- A persistent Next.js server or container
- HTTPS in production

## Local installation

```bash
git clone https://github.com/smeetbuilds/nivasaos.git
cd nivasaos
cp .env.example .env
bun install
bun run gate
bun run dev
```

Open `http://localhost:3000` and complete the five-step module-first installer. It collects workspace details, owner credentials and module-specific operating defaults. Optional starter templates use zero pricing and never fabricate residents, agreements, invoices, payments or deposits.

## Verification

```bash
bun run verify
bun run verify:verticals
bun run verify:release
bun run gate
```

`bun run gate` is the required production release command. It runs every repository verifier, builds Next.js, starts an isolated production server and smoke-tests health, installation, protected workspace routing and tenant login. It is fully self-hosted and does not depend on GitHub Actions.

## Production

```bash
bun install --frozen-lockfile
bun run gate
bun run backup
bun run build
bun run start
```

Recommended environment:

```env
NODE_ENV=production
NIVASA_DATA_DIR=/app/data
NIVASA_DB_PATH=/app/data/nivasaos.sqlite
NIVASA_UPLOAD_DIR=/app/storage/uploads
NIVASA_BACKUP_DIR=/app/backups
NIVASA_BACKUP_RETENTION_DAYS=30
NIVASAOS_BASE_URL=https://property.example.com
NEXT_PUBLIC_APP_URL=https://property.example.com
```

Persist data, uploads and backups outside the application image. Follow [docs/PRODUCTION_RELEASE.md](docs/PRODUCTION_RELEASE.md) before every deployment.

## Backups

```bash
bun run backup
bun run restore -- ./backups/<backup-folder>
```

Copy encrypted backups off-host and test restores regularly.

## Security model

- Scrypt password hashing
- SHA-256 session and invitation-token hashes
- HTTP-only SameSite cookies
- One-time tenant activation links and login lockout
- Property and permission-scoped staff access
- Authenticated document/proof delivery
- Transactional financial and occupancy updates
- Database triggers for relationship, reservation and module-history integrity
- Audit records for staff and tenant actions

Read [SECURITY.md](SECURITY.md) before deployment.

## Scale boundary

NivasaOS 1.0 targets a single self-hosted application instance using SQLite. Bulk billing is idempotent and ledgered, but high-volume multi-instance deployments should plan a PostgreSQL and durable-worker evolution rather than sharing one SQLite file across replicas.

## License

MIT. See [LICENSE](LICENSE).
