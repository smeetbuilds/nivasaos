# Changelog

All notable changes to NivasaOS will be documented here.

## Unreleased

### Security

- Lease-document delivery now enforces `handover.manage` at the file route and excludes archived records.
- Staff and tenant login now combine account and network throttling with timing-equalized unknown-account password verification.
- Newly generated tenant activation/reset links use a short-lived HTTP-only administrative handoff instead of a redirect query parameter.
- Application and Caddy responses now include baseline CSP, frame, permissions, referrer and content-type protections.
- Caddy no longer receives the complete application environment file.

### Finance and data integrity

- Primary invoice, payment, tenant-payment, deposit and late-fee paths now reconcile through integer minor units.
- SQLite money-scale triggers reject protected values with more than two decimal places.
- Request, reservation, housekeeping, invoice and payment-submission transitions now reject stale concurrent updates.
- Strict date validation rejects impossible calendar dates and service-billing months outside `01`–`12`.
- Bulk service billing reports actual billable and created counts and rejects a concurrent running job.

### Release and open source

- Added audit-hardening verification and a high-severity production dependency audit to CircleCI.
- Added `.editorconfig`, CODEOWNERS, Dependabot configuration and a project Code of Conduct.
- Removed the obsolete `docker-compose.yml` duplicate and non-diffable brand ZIP.
- Clarified technical-preview, audit-history, money-schema and verification boundaries.

## 1.1.0 - 2026-07-18

### Added

- Central authorization contracts for route reads, navigation, visible actions, row actions and Server Actions.
- Dedicated `properties.manage`, `inventory.manage`, `deposits.manage` and `portal.manage` permissions.
- Property-scoped audit delegation while portfolio-wide security and governance history remains owner-controlled.
- Database-backed staff login throttling with temporary lockout and successful-login reset.
- Atomic first-owner installation using a unique transactional installation marker.
- Integration verification for financial, deposit, service, reservation and database-integrity workflows.
- Production backup, restore and restart recovery checks in the repository gate.
- Docker/Compose contract verification, optional container gate and an optional CircleCI runner that invokes the repository gate.
- Globally neutral country, currency and timezone onboarding defaults.
- Known-limitations, scheduled-backup and contributor issue-template documentation.

### Fixed

- Tenant-portal reads and payment/deposit actions now enforce their declared permissions.
- Handover, document, service, visitor, space, report and commercial routes now align reads and mutations with property permissions.
- Individual service billing requires both service-management and billing authority.
- Space allocation and release require both inventory and agreement authority.
- Delegated service, inventory, visitor and commercial operators are no longer blocked by leftover owner/admin role checks.
- Property and unit configuration now follows explicit governance permissions.
- Audit navigation and route enforcement now use the same permission contract.
- Secret scanning works in Docker build contexts where `.git` is intentionally absent.
- Property creation and updates inherit workspace country and currency instead of India-specific fallbacks.

### Release

- Version promoted to 1.1.0.
- `bun run gate` remains the repository-owned release source of truth.
- `bun run gate:container` verifies Docker build, Compose startup, persistent-volume wiring and container health.
- The base product remains manual-first and single-instance; optional integrations remain extensions.

## 1.0.0 - 2026-07-17

### Added

- Domain-specific operating configuration and resident/business profiles for residential, PG/co-living, hostel, student, staff and commercial properties.
- Module request workflows for renewals, notices, meals, room or site transfers, leave, payroll, fit-out, compliance and other vertical operations.
- Hostel reservation, arrival, check-in, checkout, no-show and automatic turnover workflows.
- Housekeeping work board with property-safe assignment and controlled task transitions.
- Global and property-specific permission matrices with permission-driven navigation and session revocation after access changes.
- Five-step conditional onboarding that persists module-specific defaults and applies them to future properties.
- Tenant/business request centre and responsive mobile More bottom sheet.
- Property-wide service-billing preview and idempotent execution ledger.
- Dedicated vertical and release verifiers plus expanded production-route smoke testing.
- Production deployment, monitoring, backup, rollback and scale-boundary guidance.

### Fixed

- Unused properties can change operating models even when inherited defaults exist; customized configuration or operational history still locks the module.
- Direct database module changes reset inherited configuration to the target module defaults.
- SQLite now rejects partially overlapping hostel reservations, reservation/resident-allocation conflicts and invalid vertical relationships.
- Global permission grants are unique even with a NULL property scope.
- Workspace navigation includes permissions granted only for a specific assigned property.
