# Security policy

Do not disclose suspected vulnerabilities in a public issue. Report them privately to **hi@aahavlabs.in** with the affected version or commit, reproduction steps, expected impact and suggested mitigation.

## Supported versions

Security fixes target the latest stable `1.x` release and the latest commit on `main`.

## Authentication and portal security

- Staff and tenant portal sessions are separate.
- Passwords use scrypt hashing.
- Invite and session tokens are persisted only as SHA-256 hashes.
- Tenant cookies are HTTP-only, SameSite=Lax and limited to `/portal`.
- Five failed tenant-login attempts trigger a temporary lock.
- Disabling an account, changing its portal email or issuing a replacement activation/reset flow revokes applicable sessions.
- Tenant proofs, receipts, invoices, agreements, deposits, maintenance records, inspections, documents, services, visitors, spaces, profiles and requests are checked against the authenticated tenant or linked agreement.
- Payment proof does not update the official ledger until staff approval succeeds transactionally.

## Staff authorization

- Property assignment is the hard data-access boundary.
- Role defaults are narrowed or expanded by explicit global and property-specific permission grants.
- A property-specific grant cannot exceed the user’s assigned properties.
- Permission updates revoke active sessions.
- Navigation reflects effective permissions but is never treated as the authorization boundary.
- Server Actions recheck authentication, property scope and action permission.
- Owner-only functions include module governance, team governance and audit access unless the stable permission contract explicitly states otherwise.

## Module and profile integrity

- Only allowlisted module IDs are accepted.
- A module cannot be disabled while a property uses it.
- An unused property may change modules; inherited defaults reset to the target module.
- Customized configuration or any operational history locks the module.
- SQLite enforces profile, request, property, tenant and agreement relationships.
- A module request requires exactly one staff or tenant creator.
- Request cancellation and review use conditional state transitions.

## Shared-space and reservation integrity

- Unit capacity and one-active-allocation rules are database enforced.
- Shared agreement creation rechecks spaces transactionally.
- Automatic allocation uses unrestricted spaces only.
- Hostel reservations use half-open date intervals: departure on a date permits the next arrival on that date.
- SQLite rejects partially overlapping active reservations for the same bed.
- Reservations cannot overlap an active resident allocation.
- Resident allocations cannot overlap an active reservation.
- Reservation check-in and checkout use conditional state changes.
- Checkout-created housekeeping work is recorded in the same transaction.

## Services, finance and bulk jobs

- Service, property, agreement and resident relationships are validated before subscription or billing.
- Included services never create separate invoices.
- `service_billing_runs` permits one invoice per subscription and canonical period.
- Property-wide billing previews and runs are recorded in `bulk_jobs`.
- Batch fingerprints prevent duplicate execution while allowing newly eligible subscriptions to be processed later.
- Failed bulk runs retain a bounded error record and audit event.
- Invoice, payment, deposit and refund safeguards remain transactional.

## Housekeeping and visitor controls

- A housekeeping assignee must be an active owner or have access to the property.
- Task transitions are allowlisted and use compare-and-set updates.
- Residents can pre-register and cancel only their own expected visitors.
- Residents cannot confirm physical arrival or departure.
- Visitor records are personal data and require a lawful retention and access policy.

## Handover and files

- Lease documents support PDF, JPG, PNG and WebP up to 10 MB.
- MIME type, size and file signatures are validated before storage.
- Files use unpredictable server-side names, restrictive local permissions and authenticated no-store delivery.
- Tenant routes require a tenant session, linked agreement, tenant-visible classification and non-archived record.
- Shared condition reports freeze before tenant review.
- Tenant acknowledgement is a one-time receipt record, not a legal signature or waiver.
- Damage deductions are limited to damaged/missing items and the deposit held.

## Deployment baseline

- Run behind HTTPS.
- Rate-limit `/login` and `/portal/login`.
- Persist SQLite, WAL, uploads and backups outside the application image.
- Do not publicly serve data, upload or backup directories.
- Encrypt off-host backups and test restores.
- Keep Bun, Next.js and the host patched.
- Run `bun install --frozen-lockfile` and `bun run gate` on the exact deployment commit.
- The release gate is repository-owned and does not require GitHub Actions.

See [docs/PRODUCTION_RELEASE.md](docs/PRODUCTION_RELEASE.md) for the complete deployment and rollback procedure.
