# NivasaOS

**Open-source, self-hosted modular property operations.**

NivasaOS lets one installation operate multiple property businesses without forcing them into one generic workflow. Enable the operating models you need, assign one model to each property, and keep finance, security, audit, maintenance, documents, and reporting unified.

Built by [Aahav Labs](https://aahavlabs.in).

## Operating models

NivasaOS 0.9 includes:

- **Residential rentals** — apartments, houses, villas, deposits, meter handover, household leases, and resident self-service.
- **PG & co-living** — room and bed allocation, meal/laundry/Wi-Fi services, visitors, deposits, and recurring billing.
- **Hostel & dormitory** — bed-level occupancy, access items, meal or locker services, visitor movements, and rapid stay lifecycle.
- **Student housing** — bed allocation, student housing agreements, services, visitors, and term-based accommodation.
- **Staff accommodation** — employee resident allocation, included or chargeable services, visitors, and audited handover.
- **Commercial rentals** — shops, offices, warehouses, business profiles, CAM, escalation, fit-out, notice periods, and business-tenant portals.

A mixed portfolio can run several of these models simultaneously. Each property keeps its own terminology, inventory, capabilities, and portal experience.

See [Modular operating models](docs/MODULES.md) for architecture and extension rules.

## Core platform

Every module reuses the same trusted platform services:

- property, unit, person, and agreement records;
- monthly rent runs and manual invoices;
- partial and full payments;
- tenant payment-proof review;
- refundable deposit ledger;
- late-fee policies and safe invoice voiding;
- maintenance requests and conversations;
- move-in, periodic, and move-out inspections;
- tenant-visible and internal lease documents;
- key and access-item ledger;
- tenant/business portal accounts and receipts;
- role and property-scoped staff access;
- owner audit log;
- SQLite backups, restore validation, and a repository-owned release gate.

## Module capabilities

### Bed and rentable-space inventory

Shared-accommodation modules can define beds, bunks, desks, parking spaces, lockers, or other assignable positions beneath a room or unit.

- Unit capacity is enforced.
- One space can have only one active allocation.
- Active agreement creation rechecks space availability inside the database transaction.
- One available space is allocated per selected resident.
- Ending one agreement releases only its own spaces.
- A shared room remains occupied while another agreement is active.

### Services and add-ons

Compatible modules can manage meals, laundry, Wi-Fi, housekeeping, utilities, lockers, parking, CAM, or custom services.

- Included, one-time, monthly, quarterly, and annual frequencies.
- Agreement-level or resident-specific subscriptions.
- Optional custom pricing.
- Frequency-correct period keys.
- One invoice per subscription and period.

### Visitor register

Residents can pre-register an expected visitor through their portal. Only authorised staff can confirm physical check-in or check-out.

### Commercial profiles

Commercial agreements can store business identity, registration/tax references, business activity, CAM, escalation percentage/date, fit-out deadline, notice period, and notes.

## Tenant and business portals

Portal navigation and terminology come from the authenticated tenant's property module.

Universal portal features:

- agreement and occupancy details;
- invoices, balances, payment proofs, and receipts;
- deposit transactions;
- maintenance reporting and updates;
- documents, inspections, keys, and handover history;
- profile updates.

Module-specific portal features:

- allocated bed or space;
- active services;
- visitor pre-registration and history;
- business profile and commercial terms.

## Technology

- Next.js App Router
- React
- Bun runtime and package manager
- SQLite through `bun:sqlite`
- Server Actions
- local authenticated file storage
- custom responsive CSS

Runtime operation does not require a hosted database, managed authentication provider, object-storage service, payment SaaS, or GitHub Actions.

## Requirements

- Bun 1.3 or later
- a host that can run a persistent Next.js server
- a persistent writable volume for SQLite and uploaded files
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

Open `http://localhost:3000` and complete the module-first installer.

The installer asks for operating modules, primary module, workspace defaults, owner account, and an optional safe starter property. Starter templates use zero pricing and never fabricate people, agreements, invoices, payments, or deposits.

## Production

```bash
bun run gate
bun run build
bun run start
```

The release gate is self-hosted and repository-owned. It does not depend on GitHub Actions.

Recommended deployment environment:

```env
NODE_ENV=production
NIVASA_DATA_DIR=/app/data
NIVASA_UPLOAD_DIR=/app/storage/uploads
NIVASA_BACKUP_DIR=/app/backups
NIVASA_BACKUP_RETENTION_DAYS=30
NIVASAOS_BASE_URL=https://property.example.com
```

Persist the data, upload, and backup directories outside the application image.

## Docker

```bash
docker compose up --build -d
```

Review persistent volumes and HTTPS proxy configuration before production use.

## Verification

```bash
bun run verify
bun run verify:modules
bun run gate
```

`verify:modules` covers module allowlisting, fresh and legacy migration, property mapping, active-space uniqueness, service billing idempotency, visitor transitions, commercial profiles, scoped metrics, and critical source contracts.

## Backups

```bash
bun run backup
bun run restore -- ./backups/<backup-folder>
```

Backups include SQLite and locally stored uploads. Copy encrypted backups off-host and test restores regularly.

## Security model

- Owner, admin, and staff roles.
- Property-scoped access for non-owner users.
- Owner-only module governance.
- Separate tenant portal sessions.
- Scrypt password hashing.
- SHA-256 session and invitation token hashes.
- HTTP-only, SameSite cookies.
- One-time portal activation links.
- Tenant login lockout.
- Authenticated and scoped document/proof delivery.
- Server-side relationship validation.
- Transactional financial and occupancy updates.
- Audit records for staff and tenant actions.

Read [SECURITY.md](SECURITY.md) before production deployment.

## Extension model

The module catalogue defines terminology, capabilities, and safe starter templates. New modules should reuse existing capabilities wherever possible instead of forking common finance, payment, deposit, maintenance, authentication, or audit logic.

The extension registry also supports payment methods, notification drivers, dashboard sections, and settings sections.

## License

MIT. See [LICENSE](LICENSE).
