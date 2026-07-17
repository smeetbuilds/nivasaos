# Security policy

Please do not disclose suspected vulnerabilities in a public issue. Report them privately to **hi@aahavlabs.in** with the affected version or commit, reproduction steps, expected impact, and suggested mitigation.

## Supported versions

Until the first stable release, security fixes target the latest commit on `main`.

## Tenant portal security

- Activation and reset links are one-time credentials. Share them privately and do not post them in public channels.
- Raw invite and session tokens are never stored in SQLite; only SHA-256 hashes are persisted.
- Tenant sessions use a separate HTTP-only, SameSite=Lax cookie limited to `/portal`.
- Five failed tenant-login attempts trigger a temporary lock.
- Disabling an account or issuing a new activation/reset flow revokes applicable sessions and outstanding links.
- Tenant proof downloads, receipts, invoices, leases, deposits, maintenance records, condition reports, lease documents, services, visitors, spaces, and commercial profiles are checked against the authenticated tenant or a linked agreement before delivery.
- Payment submissions do not update invoice balances until staff approves them inside a database transaction.
- Do not upload card PINs, OTPs, passwords, identity documents unrelated to the transaction, or complete bank statements as payment proof.

## Modular authorization boundaries

- Workspace module changes are owner-only.
- At least one allowlisted module must remain enabled.
- A module cannot be disabled while any property is assigned to it.
- A property's module cannot change after inventory or operational activity exists.
- Enabling a module exposes capabilities; it does not grant access to properties using that module.
- Staff and admin module metrics are built only from property IDs within their existing property scope.
- Property, unit, agreement, person, service, visitor, space, and commercial-profile relationships are revalidated in server actions.
- Client-side filtering and disabled form fields are not treated as authorization controls.

## Shared-space integrity

- Active configured spaces cannot exceed unit capacity.
- A rentable space can have only one active allocation.
- Active shared-accommodation agreement creation rechecks available spaces inside the database transaction.
- Allocation conflicts roll back the complete agreement operation.
- A resident must belong to the selected property and agreement before receiving a space.
- Ending an agreement releases only that agreement's spaces and keeps the room occupied while another active agreement remains.
- Draft agreements do not reserve spaces.

## Services and billing

- Services must belong to the same property as the selected active agreement.
- Resident-specific services require that the resident is linked to the agreement.
- Duplicate active subscriptions are rejected for the same service, agreement, and resident scope.
- Included services never create separate invoices.
- `service_billing_runs` enforces one invoice per subscription and billing period.
- Positive invoice amounts and current active agreement/subscription state are revalidated at billing time.

## Visitor controls

- Residents may pre-register an expected visitor for an active linked agreement.
- Residents may cancel only their own expected entries.
- Residents cannot mark a visitor physically checked in or checked out.
- Staff transitions are conditional: expected → checked in → checked out, or expected → cancelled.
- Conditional updates reject concurrent or stale status changes.
- Visitor records contain personal data. Restrict retention, exports, and staff access according to local law and operating policy.

## Commercial profiles

- Commercial profiles are permitted only for properties whose module declares `commercialProfiles`.
- Each agreement has at most one commercial profile.
- A linked business tenant must already belong to the agreement.
- Registration and tax references are sensitive business data and should be included in retention and backup policies.

## Handover and document security

- Lease documents support only PDF, JPG, PNG, and WebP files up to 10 MB.
- Uploaded MIME type, size, and file signatures are validated before storage.
- Files receive unpredictable server-side names, restrictive local permissions, and authenticated private no-store delivery.
- Tenant document routes require an active tenant session, a linked lease, tenant-visible classification, and a non-archived record.
- Internal documents are never returned by the tenant route.
- Staff document access remains property-scoped.
- Sharing a condition report freezes its checklist before tenant review; completed reports remain frozen.
- Tenant acknowledgement is a one-time receipt record. It is not represented as a legal signature, waiver, or admission.
- A completed report may be acknowledged later without reopening or changing the condition evidence.
- Assessed charges require a damaged or missing condition.
- Inspection-linked deposit deductions are transactionally limited to the amount held and cannot be linked to multiple reports.
- Uploaded lease and handover files are sensitive records. Encrypt off-host backups and apply an appropriate retention policy.

## Deployment baseline

Run NivasaOS behind HTTPS, rate-limit both `/login` and `/portal/login`, keep Bun and dependencies patched, restrict access to the `storage` volume, use `bun run backup` and test restores regularly, copy backups off-host, and never expose SQLite or uploads through a public static directory.

Run `bun run gate` on the deployment host. The gate is repository-owned and does not require GitHub Actions.
