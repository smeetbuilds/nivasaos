# Known limitations

NivasaOS 1.1 is intentionally optimized for low-cost, single-instance self-hosting. These boundaries are product decisions or documented technical debt, not hidden dependencies.

## Technical-preview release boundary

The existence of a gate or CI configuration is not evidence that a particular commit passed it. Before production use, record successful output for the exact deployment commit from:

- `bun run audit:dependencies`;
- `bun run gate`;
- `bun run gate:container`;
- deployment-specific browser, permission and recovery acceptance checks.

An uncertified `main` commit should be treated as development code.

## Manual-first finance

The core application records invoices, payments, deposits and payment-proof submissions, but it does not automatically capture money from cards, banks or UPI providers.

Operators must reconcile and approve payments. A payment-gateway extension may automate this, but any credentials, fees, chargeback handling and regulatory obligations belong to that optional integration.

## Monetary storage compatibility boundary

Primary financial inputs and reconciliations use integer minor-unit calculations. Database triggers reject protected values with more than two decimal places or outside the supported range, and every protected legacy decimal column has an integer minor-unit mirror that is backfilled and synchronized by migration triggers.

For backward compatibility, NivasaOS 1.1 still retains historical SQLite `REAL` monetary columns beside each exact minor-unit mirror. The mirror materially improves integrity and provides a migration path, but reports and extensions are not yet universally switched to the integer representation. Binary floating-point can therefore remain visible to direct database tools and code that explicitly reads the legacy decimal column.

Before NivasaOS is positioned as a high-assurance accounting ledger, the remaining staged migration must:

1. reconcile the new minor-unit mirrors with operator-reviewed variance reports;
2. switch every report, extension and export to the integer representation;
3. introduce currency-scale metadata for currencies that do not use two decimal places;
4. remove legacy `REAL` columns only after backup, restore and reporting certification.

Until then, use NivasaOS as an operational ledger with independent bank/accounting reconciliation, not as the sole statutory accounting record.

## Manual-first communication

The default reminder driver creates a WhatsApp click-to-chat URL. Core NivasaOS does not send email, SMS or WhatsApp Cloud API messages automatically.

SMTP, SMS and messaging APIs remain optional extensions so the base installation needs no API key or recurring communication service.

## Single application instance

NivasaOS uses SQLite and targets one application process or one application container.

Do not:

- run multiple application replicas against one SQLite file;
- place the SQLite database on an unsupported shared network filesystem;
- treat the current architecture as a multi-region SaaS control plane.

Multi-instance or very high-volume deployments require a planned PostgreSQL and durable-worker evolution.

## Local file storage

Authenticated uploads and proofs are stored on the application host or persistent Docker volume. Core NivasaOS does not replicate files to object storage.

The operator is responsible for:

- storage capacity;
- filesystem access controls;
- encrypted off-host backup;
- restore testing;
- host-loss recovery.

## Operator-owned backup schedule

The application can create, validate and restore checksummed archives, but it does not run a scheduler inside the web process. Use cron, systemd, a container scheduler or another operator-controlled mechanism.

The repository gate tests backup and restore recovery. Production operators must still monitor backup age and off-host transfer.

## Bounded streaming backup implementation

Backup creation now snapshots SQLite with `VACUUM INTO`, streams the database and uploads through gzip, and records per-file SHA-256 checksums. Inspection and restore stream archive contents to a protected staging directory rather than loading the complete archive into memory.

The implementation enforces compressed-size, expanded-size, per-entry and file-count limits, rejects traversal and unsupported tar entries, and stages replacements on the target filesystems before atomic activation. These controls bound memory use; they do not remove disk-capacity requirements. Operators must provision working space for the archive, extraction, target staging and the pre-restore safety backup, and must test with production-sized copies.

Default limits are conservative compatibility values and can be reduced with the documented `NIVASA_BACKUP_MAX_*` environment settings. Raising them requires an operator capacity review.

## No durable background worker

Bulk operations are designed for the current single-instance scale boundary. There is no separate durable queue or worker service for high-volume asynchronous processing.

Long-running integrations should be implemented as optional workers rather than blocking web requests.

## Verification boundary

`bun run gate` provides repository-owned verification: static contracts, schema migrations, authorization checks, integration workflows, production build, runtime rejection, backup/restore and restart health.

A significant portion of UI and authorization verification is source-contract based. It is not a complete authenticated, cross-browser end-to-end suite and does not prove rendered layout, keyboard behavior, screen-reader output, field-level validation or every permission combination.

Releases still require manual browser testing. A future release should add authenticated browser automation, accessibility checks and screenshot regression coverage without making the core application dependent on a paid service.

## User-facing validation

Some Server Action failures still fall through to the shared error boundary rather than returning field-specific validation state. Users may need to re-enter a form after a rejected request. Converting every form to structured action state is a separate UI compatibility project.

## Responsive data density

Wide operational tables remain horizontally scrollable on small screens. This prevents clipping but is not equivalent to a purpose-built mobile card layout. High-use tables should be converted incrementally with visual and accessibility certification.

## Transitional CSS architecture

Legacy compatibility styles remain loaded before named domain styles. They cannot be deleted safely without route-by-route browser comparison. New work must use named domain layers; legacy selectors should be retired only in dedicated visual-refactor changes.

## Legal, tax and regulatory configuration

NivasaOS provides configurable operational records. It does not guarantee that a workflow, invoice, deposit treatment, identity field, tax field or retention period satisfies every jurisdiction.

Operators must obtain local legal, accounting, privacy and housing-compliance advice.

## One workspace per installation

The current product is one trusted workspace per self-hosted installation. It is not a public multi-tenant SaaS platform with customer-to-customer isolation.

Separate organizations that do not share an administrative trust boundary should use separate installations.

## Optional integrations may cost money

Extensions may require:

- API keys;
- paid provider accounts;
- per-message or per-transaction fees;
- webhook infrastructure;
- provider-specific compliance.

Those dependencies must be documented by the extension and are never required by the base project.
