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
- Tenant proof downloads, receipts, invoices, leases, deposits, and maintenance records are checked against the authenticated tenant or shared lease before delivery.
- Payment submissions do not update invoice balances until staff approves them inside a database transaction.
- Do not upload card PINs, OTPs, passwords, identity documents unrelated to the transaction, or complete bank statements as payment proof.

## Deployment baseline

Run NivasaOS behind HTTPS, rate-limit both `/login` and `/portal/login`, keep Bun and dependencies patched, restrict access to the `storage` volume, use `bun run backup` and test restores regularly, copy backups off-host, and never expose SQLite or uploads through a public static directory.
