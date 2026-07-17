# NivasaOS 1.0 production release guide

NivasaOS is self-hosted. Production readiness is proven by the repository-owned local gate, not by GitHub Actions or another hosted CI service.

## Required release gate

Run from the exact commit intended for deployment:

```bash
bun install --frozen-lockfile
bun run gate
```

The gate performs, in order:

1. JavaScript and JSX parsing.
2. Fresh-schema and legacy-migration verification.
3. Core finance and operations verification.
4. Responsive UI and portal contract verification.
5. Handover and modular integrity verification.
6. Vertical workflow, permission, reservation and bulk-job verification.
7. Release wiring and documentation verification.
8. A production Next.js build.
9. A temporary production server using isolated SQLite and upload directories.
10. Health, installation, protected-workspace and tenant-login smoke tests.

Do not deploy when any gate step fails.

## Production environment

Minimum requirements:

- Bun 1.3 or later.
- Persistent writable storage for SQLite, uploads and backups.
- HTTPS at the public edge.
- A reverse proxy with request-size and timeout limits suitable for approved document uploads.
- A process supervisor or container orchestrator that restarts the Next.js process after failure.
- Encrypted off-host backups and a tested restore procedure.

Recommended environment variables:

```env
NODE_ENV=production
NIVASA_DATA_DIR=/app/data
NIVASA_DB_PATH=/app/data/nivasaos.sqlite
NIVASA_UPLOAD_DIR=/app/storage/uploads
NIVASA_BACKUP_DIR=/app/backups
NIVASA_BACKUP_RETENTION_DAYS=30
NIVASAOS_BASE_URL=https://property.example.com
NEXT_PUBLIC_APP_URL=https://property.example.com
```

Persist every configured directory outside the application image. Never place the SQLite database or uploads on ephemeral container storage.

## Deployment sequence

```bash
git fetch --all --tags
git checkout <release-commit>
bun install --frozen-lockfile
bun run gate
bun run backup
bun run build
bun run start
```

For an existing installation:

1. Stop writes or place the application in maintenance mode.
2. Create and copy an encrypted backup off-host.
3. Run `bun run gate` against the release commit.
4. Start the new application version against a copy of production data first.
5. Confirm migration success, health response and authenticated staff/tenant smoke flows.
6. Start the release against production storage.
7. Confirm invoices, payments, uploads, portal login and one module-specific workflow.

## Reverse-proxy baseline

- Terminate TLS with a valid certificate.
- Forward `Host`, `X-Forwarded-For` and `X-Forwarded-Proto` correctly.
- Redirect HTTP to HTTPS.
- Set upload limits no lower than the application’s 10 MB document limit.
- Disable public caching for authenticated application and file routes.
- Apply rate limits to login and upload endpoints without blocking normal Server Action traffic.

## Data protection

- Keep SQLite WAL, SHM and database files on the same persistent volume.
- Do not copy a live SQLite file with a generic filesystem copy; use the repository backup command.
- Run a restore drill after infrastructure changes and at least quarterly.
- Restrict filesystem permissions for the data, upload and backup directories.
- Encrypt backups before moving them off-host.
- Retain audit history according to applicable legal and operational requirements.

## Operational monitoring

Monitor at minimum:

- `/api/health` response and latency.
- Process restarts and non-zero exits.
- Disk capacity for data, WAL, uploads and backups.
- Backup age and restore-test date.
- HTTP 5xx rate and slow requests.
- Failed payment-proof uploads and file-delivery authorization failures.
- Bulk-job failures and jobs left in `running` state.
- Reservation, allocation and permission integrity errors.

## Security checklist

- Use unique owner and staff passwords.
- Disable accounts immediately when access is no longer required.
- Grant the minimum property and action permissions needed.
- Review property-specific overrides periodically.
- Keep HTTPS enabled for every staff and portal request.
- Keep the host, Bun and reverse proxy patched.
- Do not expose SQLite, upload or backup directories through the web server.
- Review `SECURITY.md` before launch.

## Scale boundaries

NivasaOS 1.0 is designed for a single self-hosted application instance backed by SQLite. Use measured load tests before deploying very large portfolios. Bulk billing is ledgered and idempotent, but long-running work still executes in the application process. For multi-instance or very high-volume deployments, plan a future PostgreSQL and durable-worker migration rather than sharing one SQLite database across application replicas.

## Rollback

Application rollback and data rollback are separate decisions.

- Code-only rollback is acceptable only when the previous release understands the migrated schema.
- Restore a database backup only after stopping every application process that can write to it.
- Preserve the failed release database and logs for investigation.
- Run `bun run restore -- <backup-folder>` and then `bun run gate` before reopening access.

## Release evidence

Record for every deployment:

- Commit SHA.
- `bun --version`.
- Gate output.
- Backup path and checksum.
- Restore-drill evidence.
- Deployment timestamp and operator.
- Post-deployment health and smoke-test results.
