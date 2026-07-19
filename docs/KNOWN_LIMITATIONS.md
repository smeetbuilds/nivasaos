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

Primary financial inputs and reconciliations use integer minor-unit calculations, and database triggers reject protected values with more than two decimal places. This removes tolerance-based comparisons from the main invoice, payment, submission, deposit and late-fee paths.

For backward compatibility, NivasaOS 1.1 still stores historical monetary columns using SQLite `REAL`. This is not the same as a completed integer-minor-unit schema. Binary floating-point remains visible to direct database tools, legacy records and any extension that bypasses the protected action layer.

Before NivasaOS is positioned as a high-assurance accounting ledger, a staged migration must:

1. add integer minor-unit columns and currency-scale metadata;
2. backfill and reconcile existing values with an operator-reviewed variance report;
3. dual-read or dual-write during a compatibility window;
4. switch every report, extension and export to the integer representation;
5. remove legacy `REAL` columns only after backup and restore certification.

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

## In-memory backup implementation

The current backup format serializes SQLite and upload contents into memory before compression, and restore reads the archive into memory before extraction. This is acceptable only while database and upload volumes remain within the host’s tested memory budget.

Large portfolios require a future streaming archive implementation with decompressed-size, file-count and per-entry limits. Operators should monitor backup process memory and test with production-sized copies before relying on the built-in archive.

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
