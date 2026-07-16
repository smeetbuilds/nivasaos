# Changelog

All notable changes to NivasaOS will be documented here.

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
