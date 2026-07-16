# Changelog

All notable changes to NivasaOS will be documented here.

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

- Completed inspections are immutable, while tenants may still acknowledge receipt and add notes afterward.
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
