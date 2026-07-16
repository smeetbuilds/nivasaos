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
- Tenant proof downloads, receipts, invoices, leases, deposits, maintenance records, condition reports, and lease documents are checked against the authenticated tenant or shared lease before delivery.
- Payment submissions do not update invoice balances until staff approves them inside a database transaction.
- Do not upload card PINs, OTPs, passwords, identity documents unrelated to the transaction, or complete bank statements as payment proof.

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
