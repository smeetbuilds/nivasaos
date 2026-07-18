# Known limitations

NivasaOS 1.1 is intentionally optimized for low-cost, single-instance self-hosting. These boundaries are product decisions, not hidden dependencies.

## Manual-first finance

The core application records invoices, payments, deposits and payment-proof submissions, but it does not automatically capture money from cards, banks or UPI providers.

Operators must reconcile and approve payments. A payment-gateway extension may automate this, but any credentials, fees, chargeback handling and regulatory obligations belong to that optional integration.

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

## No durable background worker

Bulk operations are designed for the current single-instance scale boundary. There is no separate durable queue or worker service for high-volume asynchronous processing.

Long-running integrations should be implemented as optional workers rather than blocking web requests.

## Verification boundary

`bun run gate` provides strong repository-owned verification: static contracts, schema migrations, authorization checks, integration workflows, production build, runtime rejection, backup/restore and restart health.

It is not a complete cross-browser end-to-end suite. Releases should still receive manual browser testing for the operating models and devices relevant to the deployment.

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
