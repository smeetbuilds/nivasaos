# NivasaOS

**Open-source, self-hosted property operations for boarding houses, apartments, and rentals.**

NivasaOS gives an owner or rental team one place to manage multiple properties, units, availability, tenants, leases, invoices, payment proofs, arrears, WhatsApp reminders, maintenance work, role-based access, and property-scoped reports.

> Built by [Aahav Labs](https://aahavlabs.in) · hi@aahavlabs.in

## Why NivasaOS

Many small and mid-sized rental operations outgrow spreadsheets before they are ready for expensive, vendor-locked property software. NivasaOS is designed as a practical local-first MVP:

- no hosted database account;
- no mandatory payment gateway;
- no mandatory messaging vendor;
- no telemetry or SaaS lock-in;
- one SQLite database and a local uploads directory;
- extension registries for payment methods, notification drivers, settings, and dashboard sections.

Application packages such as Next.js and React are required, but the running product has **no mandatory third-party hosted service dependency**.

## Included today

### Portfolio and occupancy

- Multiple properties with independent currency and status.
- Boarding house, apartment, rental, and mixed property types.
- Units with type, floor, capacity, monthly rate, deposit, notes, and availability.
- Live available, occupied, maintenance, and inactive states.
- Secure property and unit editing with financial and lease-integrity guards.

### Tenants and leases

- Tenant contact, identity, emergency, address, and lifecycle records.
- Fixed-term or open-ended leases.
- One or multiple tenants per lease for shared accommodation.
- Configurable billing day, rent, deposit, and notes.
- Move-in automatically occupies the unit.
- Move-out ends the lease, releases the unit, and preserves history.
- Tenant contact, identity, emergency, address, and lifecycle details remain editable without breaking historical links.

### Invoices and collections

- Idempotent monthly rent runs for all accessible properties or one selected property.
- Rent or ad-hoc invoices.
- Issued, part-paid, paid, draft, void, and computed overdue states.
- Search and filters by property, status, charge type, invoice, tenant, lease, or unit.
- Per-property grace periods and disabled, flat, or percentage late-fee policies with optional caps.
- Dry-run late-fee preview and idempotent generation with one active fee per source rent invoice.
- Safe voiding for unpaid invoice mistakes without deleting financial history.
- Payment ledger with method, reference, date, notes, and recorder.
- Invoice-linked payments update balances atomically.
- Local JPG, PNG, WebP, or PDF proof uploads up to 5 MB.
- Proof files are served only after authentication and property-access checks.

### WhatsApp reminders

- Pre-filled WhatsApp click-to-chat reminders from overdue or open invoices.
- Editable reminder template with tenant, invoice, balance, and due-date variables.
- Reminder preparation is logged.
- The default driver does not require a WhatsApp Business API account.

For automatic sending, register a WhatsApp Cloud API or another notification driver through the extension layer.

### Maintenance

- Reported → In progress → Resolved workflow.
- Property, unit, tenant, priority, and staff assignment.
- Responsive operational board.

### Roles and reports

- **Owner:** full portfolio, team, settings, and audit-log control.
- **Admin:** operational management for assigned properties.
- **Staff:** day-to-day tenant, invoice, payment, and maintenance access for assigned properties.
- Property-scoped dashboard metrics, rent-run readiness, and upcoming lease-expiry follow-up.
- Occupancy, collection, and arrears reports.
- Editable admin/staff roles and property assignments.
- Owner-only audit log with actor, action, record, property, and safe change metadata.

## Technology

- Next.js 16 App Router
- React 19
- Bun runtime and package manager
- Bun's built-in `bun:sqlite`
- Server Actions for mutations
- Local filesystem uploads
- Plain responsive CSS with no UI-kit dependency
- Native-style mobile shell with a navigation drawer, bottom navigation, bottom-sheet forms, swipeable metrics, and card-based responsive tables
- Docker and Docker Compose
- Repository-owned local quality gate and Git hooks; no GitHub Actions requirement
- Built-in health check plus verified backup and restore CLI

## Quick start with Bun

Requirements: Bun 1.3+ and a modern Linux, macOS, or Windows/WSL environment.

```bash
git clone https://github.com/smeetbuilds/nivasaos.git
cd nivasaos
cp .env.example .env.local
bun install
bun run hooks:install
bun run dev
```

Open `http://localhost:3000`. The first-run installer will:

1. initialise the SQLite schema;
2. create the first owner account;
3. save portfolio defaults;
4. optionally add two sample units;
5. sign the owner in.

Before a production release, run the repository-owned gate:

```bash
bun run gate
bun run start
```

The gate parses the source tree, verifies fresh and upgraded database schemas, tests financial and backup safeguards, creates a production build, starts it against isolated temporary storage, and probes `/api/health`. It runs locally or on infrastructure you control and does not call GitHub Actions.

Bun must execute the Next.js CLI because NivasaOS uses `bun:sqlite`:

```json
{
  "scripts": {
    "dev": "bun --bun next dev",
    "build": "bun --bun next build",
    "start": "bun --bun next start"
  }
}
```

## Docker

```bash
docker compose up -d --build
```

Then open `http://localhost:3000`.

The Compose file persists the SQLite database, payment proofs, and generated backups in the `nivasa_data` volume. Docker checks `/api/health` and marks the container unhealthy when SQLite cannot be reached or upload storage is not writable. Put a reverse proxy such as Caddy, Nginx, or Traefik in front of the container for HTTPS.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `NIVASA_DB_PATH` | `./storage/nivasaos.sqlite` | SQLite database location |
| `NIVASA_UPLOAD_DIR` | `./storage/uploads` | Payment proof directory |
| `NIVASA_BACKUP_DIR` | `./storage/backups` | Generated backup archive directory |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Canonical application URL |

## Backup and restore

Create a consistent compressed archive containing a serialized SQLite snapshot, all payment-proof uploads, and a checksum manifest:

```bash
bun run backup
bun run backup -- --output /secure/location/nivasaos.tar.gz
```

The default destination is `storage/backups/`. Copy archives to a separate encrypted host or object store; an archive stored only in the same volume as the live application is not disaster recovery.

Stop NivasaOS before restoring:

```bash
docker compose stop nivasaos
bun run restore /secure/location/nivasaos.tar.gz --force
docker compose start nivasaos
```

Restore validates the archive checksum and SQLite integrity, creates a safety backup of the current database and uploads, stages the replacement, and atomically swaps it into place.

## Self-hosted verification and operations

NivasaOS deliberately does not depend on GitHub Actions. Install the tracked Git hooks once per clone:

```bash
bun run hooks:install
```

The pre-commit hook runs the verification suite and the pre-push hook runs the complete production gate. `bun run gate` can also be called by a workstation, deployment script, systemd unit, Jenkins, Woodpecker, Forgejo, or another private runner.

Operational documentation, including scheduling backups with cron or systemd, is in [`docs/SELF_HOSTED_OPERATIONS.md`](docs/SELF_HOSTED_OPERATIONS.md).

## Extension architecture

The core registry is in `lib/extension-registry.js`. The loader is `lib/extensions.js`, and the intended custom-code entrypoint is `plugins/index.js`.

### Add a payment method

```js
import { registerPaymentMethod } from "@/lib/extension-registry";

registerPaymentMethod({
  id: "razorpay_manual",
  label: "Razorpay"
});
```

### Add a notification driver

```js
import { registerNotificationDriver } from "@/lib/extension-registry";

registerNotificationDriver({
  id: "whatsapp_cloud",
  label: "WhatsApp Cloud API",
  async prepare({ recipient, message, context }) {
    // Validate settings, send through your adapter, and return a stable result.
    return { status: "sent", providerMessageId: "..." };
  }
});
```

The registry exposes four extension surfaces:

- `registerPaymentMethod()`
- `registerNotificationDriver()`
- `registerDashboardSection()`
- `registerSettingsSection()`

Keep provider credentials out of source control. A production provider extension should encrypt secrets at rest, handle retries idempotently, validate webhooks, and maintain an auditable event log.

## Data model

```mermaid
erDiagram
  PROPERTIES ||--o{ UNITS : contains
  PROPERTIES ||--o{ TENANTS : scopes
  PROPERTIES ||--o{ LEASES : owns
  UNITS ||--o{ LEASES : assigned_to
  LEASES ||--o{ LEASE_TENANTS : includes
  TENANTS ||--o{ LEASE_TENANTS : joins
  LEASES ||--o{ INVOICES : generates
  TENANTS ||--o{ INVOICES : receives
  INVOICES ||--o{ PAYMENTS : settled_by
  INVOICES ||--o| INVOICES : late_fee_for
  PROPERTIES ||--o| BILLING_POLICIES : configures
  PROPERTIES ||--o{ MAINTENANCE_TICKETS : has
  USERS ||--o{ USER_PROPERTIES : permitted
  PROPERTIES ||--o{ USER_PROPERTIES : grants
  USERS ||--o{ AUDIT_LOG : performs
  PROPERTIES ||--o{ AUDIT_LOG : scopes
```

## Security baseline

Implemented:

- scrypt password hashing with a unique salt;
- random session tokens stored as SHA-256 hashes;
- HTTP-only, SameSite=Lax session cookie;
- role checks on privileged mutations;
- property-access checks on property-owned records;
- SQLite foreign keys and constrained statuses;
- prepared SQL statements;
- payment amount and invoice-balance validation inside the same database transaction as ledger updates;
- duplicate-protected rent and late-fee generation;
- unpaid-only invoice voiding with source-fee integrity guards;
- proof MIME type, size, generated filename, and authenticated delivery checks;
- disabled accounts have active sessions revoked;
- actively leased units and tenants cannot be moved into contradictory lifecycle states;
- property currency is locked after financial activity;
- sensitive operational mutations are written to the owner-only audit log without passwords or proof contents.

Before internet-facing deployment:

- terminate HTTPS at a trusted reverse proxy;
- restrict access to the database and upload volume;
- patch Bun and application dependencies regularly;
- use strong unique passwords;
- configure rate limiting at the proxy for `/login`;
- establish tested encrypted backups;
- review privacy, retention, tax, tenancy, late-fee, and messaging requirements for your jurisdiction.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Current MVP boundaries

NivasaOS is usable for local/manual rental operations, but these are intentionally not claimed as complete yet:

- monthly rent and late-fee runs are initiated manually rather than executed by a scheduler;
- the default WhatsApp integration opens click-to-chat rather than sending automatically;
- payment gateway settlement and webhook reconciliation require an extension;
- lease document generation and e-signatures are not included;
- SQLite is best suited to a single application instance or carefully coordinated storage, not horizontally scaled multi-writer deployment.

## Suggested roadmap

- optional scheduled rent-run automation with dry-run previews;
- lease PDF templates and document attachments;
- tenant portal and receipts;
- automatic WhatsApp/email/SMS drivers;
- gateway plugins and webhook reconciliation;
- import/export and richer CSV reports;
- PostgreSQL adapter for larger multi-instance deployments;
- extension discovery and lifecycle management.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Keep every query property-scoped, every financial mutation auditable, and every provider integration idempotent.

## License

MIT. See [LICENSE](LICENSE).

---

**NivasaOS is built by [Aahav Labs](https://aahavlabs.in).**
Product and engineering enquiries: **hi@aahavlabs.in**
