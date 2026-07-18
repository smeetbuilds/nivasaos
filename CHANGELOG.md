# Changelog

All notable changes to NivasaOS will be documented here.

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
- Vertical operations CSS is loaded in the production stylesheet chain.
- Bulk service billing records failed jobs and permits later billing of newly eligible subscriptions without duplicating prior runs.

### Release

- Version promoted to 1.0.0.
- `bun run gate` remains the mandatory self-hosted release gate and does not depend on GitHub Actions.

## 0.9.1 - 2026-07-17

### Fixed

- Staff and admin navigation now derives module capabilities only from properties assigned to the signed-in user, rather than exposing workspace-wide module screens.
- Property operating models are locked after any inventory, configuration, financial, service, visitor, inspection, document, key, notification, deposit, or maintenance activity exists.
- SQLite now enforces property-module immutability so scripts, plugins, and future code paths cannot bypass the application guard.
- Shared-accommodation agreements can select exact available beds or spaces, with one selected space required for each resident when selection is explicit.
- Automatic shared-space allocation uses unrestricted spaces only; restricted or custom-policy inventory must be chosen explicitly.
- Blank agreement rent and deposit values now derive from the actual allocated spaces, while explicit negotiated overrides remain supported.
- The module verifier now executes service-only module-lock, unused-property reconfiguration, allocated-space pricing, and negotiated-pricing tests.

## 0.9.0 - 2026-07-17

### Added

- Module-first onboarding with Residential Rentals, PG & Co-living, Hostel & Dormitory, Student Housing, Staff Accommodation, and Commercial Rentals.
- Owner-governed workspace modules with a primary operating model and strict deactivation safeguards.
- Property-level module assignment, terminology, starter templates, capability-driven navigation, and module health cards.
- Bed, bunk, desk, parking, locker, and other rentable-space inventory beneath compatible rooms or units.
- Space-level resident allocation with capacity enforcement and one active allocation per space.
- Service catalogue and lease/resident subscriptions for meals, laundry, Wi-Fi, utilities, housekeeping, lockers, parking, CAM, and custom services.
- Idempotent service invoice runs for one-time and recurring service periods.
- Resident visitor pre-registration plus staff-controlled check-in, check-out, and cancellation transitions.
- Commercial agreement profiles covering business identity, registration/tax references, CAM, escalation, fit-out, notice period, and notes.
- Module-aware resident/business portals with relevant services, visitors, allocated spaces, commercial terms, documents, billing, maintenance, and handover.
- Dedicated modular architecture guide and repository verifier.

### Improved

- Shared-room agreements can coexist while configured spaces remain available; conventional residential and commercial inventory remains unit-exclusive.
- Active shared agreements allocate one available space per selected resident inside the lease transaction.
- Agreement move-out releases only the affected spaces, ends active services, cancels expected visitors, and preserves room occupancy while another agreement remains active.
- Property modules lock after inventory or operational activity begins, preventing historical data reinterpretation.
- Unit capacity cannot be reduced below configured or actively allocated spaces.
- Module dashboard metrics are restricted to the signed-in user's permitted properties.
- Navigation and mobile portal controls appear only for capabilities used by enabled modules.
- First-run starter data uses zero pricing and never fabricates people, agreements, invoices, payments, or deposits.

### Security

- Workspace module changes are owner-only and modules in active property use cannot be disabled.
- Property, unit, agreement, resident, service, visitor, space, and commercial-profile relationships are revalidated server-side.
- Residents can pre-register or cancel expected visitors but cannot confirm physical arrival or departure.
- Service billing is unique per subscription and period.
- Tenant portal module data remains authenticated and tenant/agreement scoped.

## 0.8.0 - 2026-07-17

### Added

- Dedicated handover workspace for move-in, periodic, and move-out condition reports.
- Room-by-room inspection items with condition, notes, assessed charges, and electricity, water, and gas meter readings.
- Tenant condition-report acknowledgement with preserved resident notes and explicit receipt-only wording.
- Lease document center with tenant-visible and internal visibility, inspection links, authenticated delivery, and archival.
- Key and access-item ledger covering issued, returned, lost, and replaced items.
- Optional owner/admin move-out damage deduction linked directly to the completed inspection and deposit ledger.
- Tenant portal access to shared agreements, notices, inventories, inspection reports, meter readings, keys, and handover history.
- Self-hosted handover operations guide and repository verification contract.

### Improved

- Sharing freezes a condition report before tenant review; checklist items cannot be added afterward.
- Tenant acknowledgements are one-time records, while completed reports can still be acknowledged without reopening them.
- Assessed charges are accepted only for damaged or missing checklist items.
- Lease move-out is blocked when an existing move-out inspection remains unfinished or tracked key items remain outstanding.
- Deposit deductions cannot exceed the amount currently held and one deduction cannot be linked to multiple inspections.
- Key returns and loss records cannot exceed the tracked outstanding quantity for that key type.
- Lease files use random server-side names, signature validation, private no-store delivery, and tenant/employee scope checks.

## 0.7.0 - 2026-07-16

### Added

- Secure resident portal accounts with one-time seven-day activation and password-reset links.
- Separate tenant sessions, login throttling, password setup, account disabling, and session revocation.
- Tenant dashboard covering the active home, lease terms, balances, deposit held, payment proofs, and maintenance status.
- Invoice history, tenant payment-proof submissions, controlled staff approval/rejection, and printable payment receipts.
- Separate refundable-deposit ledger with received, refunded, credited, and debited movements plus printable deposit records.
- Tenant maintenance reporting and resident-visible conversation timelines alongside staff-only internal notes.
- Resident profile updates for phone, emergency contact, and correspondence address.
- Staff portal-management workspace for invitations, account status, proof review, and deposit transactions.
- Tenant actors in the owner audit log and authenticated proof routes scoped to the resident or property.

### Improved

- Payment proof submission reserves the remaining invoice amount without changing the official ledger before staff approval.
- Staff approval revalidates invoice state and creates the payment and invoice update in one transaction.
- Invite tokens are stored only as SHA-256 hashes and consumed atomically to block replay.
- Deposit refunds and debits cannot reduce the held balance below zero.
- Shared-lease receipts identify the actual payer while retaining shared household ledger visibility.

## 0.6.0 - 2026-07-16

- Modern responsive SaaS shell, mobile navigation drawer and bottom navigation, bottom-sheet forms, responsive record cards, and improved accessibility.

## 0.5.0 - 2026-07-16

- Self-hosted release gate, repository hooks, health endpoint, verified backups/restores, and removal of GitHub Actions dependency.

## 0.4.0 - 2026-07-16

- Property billing policies, grace periods, late-fee safeguards, dry-run preview, and safe invoice voiding.

## 0.3.0 - 2026-07-16

- Editable records, team property assignments, integrity guards, and owner audit trail.

## 0.2.0 - 2026-07-16

- Idempotent monthly rent runs, invoice controls, filters, and dashboard billing follow-up.

## 0.1.0 - 2026-07-16

- Initial self-hosted property-management MVP.
