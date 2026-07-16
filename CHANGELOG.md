# Changelog

All notable changes to NivasaOS will be documented here.

## 0.6.0 - 2026-07-16

### Added

- Responsive mobile application shell with a safe-area-aware top bar, quick bottom navigation, and accessible slide-in navigation drawer.
- Native-style mobile bottom sheets for all existing create, edit, billing, and confirmation dialogs.
- Automatic mobile table labels that transform dense desktop tables into readable record cards without duplicating page markup.
- Active-route navigation states, grouped desktop navigation, and clearer workspace context.

### Improved

- Modern SaaS visual system with refined spacing, surfaces, shadows, focus states, typography, and touch targets.
- Swipe-friendly mobile metrics, action rows, maintenance columns, and reduced-motion support.
- Mobile forms use larger controls, sticky safe-area actions, scroll containment, and iOS zoom-safe input sizing.
- Desktop and tablet layouts retain information density while gaining clearer hierarchy and responsive breakpoints.

## 0.5.0 - 2026-07-16

### Added

- Repository-owned local release gate with source parsing, schema checks, operational tests, production build, and live health smoke testing.
- Installable pre-commit and pre-push hooks that run entirely on the developer or self-hosted machine.
- Public, privacy-safe `/api/health` readiness endpoint and Docker health checks.
- Compressed SQLite-and-upload backups with checksum manifests.
- Validated atomic restores with an automatic pre-restore safety backup.
- Self-hosted operations guide for local gates, hooks, health monitoring, backups, restores, cron, and private runners.

### Improved

- Removed the GitHub Actions workflow; no application, verification, release, backup, or deployment task depends on GitHub Actions.
- Docker builds now run repository-owned verification before producing the production image.
- Backup and restore commands share one environment-aware operational path resolver.
- Compose deployment adds graceful shutdown, an init process, no-new-privileges, persistent backup storage, and readiness checks.

## 0.4.0 - 2026-07-16

### Added

- Per-property grace periods with disabled, flat, or percentage late-fee rules.
- Optional late-fee caps and a dry-run eligibility preview before invoices are created.
- Idempotent late-fee runs with one active fee invoice per source rent invoice.
- Charge-type and source-invoice visibility in the receivables workspace.
- Safe voiding for unpaid invoices while preserving audit history.

### Improved

- Payment allocation, late-fee generation, and invoice voiding now validate financial state inside database transactions.
- Dashboard collection follow-up now surfaces rent invoices beyond their configured grace period.
- Existing installations migrate billing policies, charge types, source links, and duplicate-protection indexes automatically.

## 0.3.0 - 2026-07-16

### Added

- Secure edit flows for properties, units, tenants, and team accounts.
- Owner-only audit log with action, actor, property, entity, and safe metadata filters.
- Editable admin/staff property assignments with inaccessible maintenance work automatically unassigned.
- Database migration and indexes for operational audit events.

### Improved

- Property currency locks after financial activity to preserve reporting consistency.
- Properties with active leases cannot be deactivated.
- Active leases control unit occupancy and tenant lifecycle status.
- Financial, lease, maintenance, settings, security, and notification mutations now create audit events.
- Property assignment controls use responsive checkbox cards instead of a multi-select field.

## 0.2.0 - 2026-07-16

### Added

- Idempotent monthly rent runs scoped to all accessible properties or one property.
- Lease-and-period uniqueness protection for generated rent invoices.
- Invoice search, property filters, status filters, and filtered receivables metrics.
- Dashboard rent-run readiness and lease-expiry follow-up panels.
- Pending and disabled states for modal form submissions.

### Improved

- Stronger random references for leases, invoices, and payments.
- Server-side date validation for invoices and payments.
- Schema migration support for existing installations.
- PostCSS is overridden to a patched release while Next.js retains its current transitive pin.

## 0.1.0 - 2026-07-16

### Added

- First-run owner installer and session authentication.
- Owner, admin, and staff role model with property-scoped access.
- Property, unit, tenant, and multi-tenant lease management.
- Move-in and move-out occupancy transitions.
- Invoices, overdue calculations, payment allocation, and protected proof uploads.
- WhatsApp click-to-chat rent reminders and reminder logging.
- Three-stage maintenance workflow and staff assignment.
- Portfolio dashboard and property-scoped occupancy, collection, and arrears reports.
- Payment, notification, dashboard, and settings extension registries.
- Docker, Compose, CI, security policy, contribution guide, and MIT license.
