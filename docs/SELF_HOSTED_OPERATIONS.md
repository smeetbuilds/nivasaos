# Self-hosted operations

NivasaOS does not require GitHub Actions or another hosted CI service. The repository ships its own quality gate, Git hooks, health endpoint, and backup/restore commands.

## Local release gate

Run the same release validation on a workstation or your own build server:

```bash
bun install
bun run gate
```

The gate performs source parsing, schema and migration tests, financial-safeguard tests, backup/restore tests, a production Next.js build, and a live `/api/health` smoke test against an isolated temporary database.

## Git hooks

Install the repository-owned hooks once per clone:

```bash
bun run hooks:install
```

- `pre-commit` runs `bun run verify`.
- `pre-push` runs the complete `bun run gate`.

The hooks run on your machine and do not call GitHub Actions.

## Runtime health

`GET /api/health` returns `200` only when SQLite is reachable and the uploads directory is writable. Docker uses this endpoint for its container health check. The response contains no paths, credentials, tenant information, or other private data.

## Backups

Create a compressed backup containing a consistent SQLite snapshot, payment-proof uploads, and a checksum manifest:

```bash
bun run backup
bun run backup -- --output /secure/location/nivasaos.tar.gz
```

The default destination is `storage/backups/`, which is inside the persistent Docker volume. Copy backups to a separate encrypted host or object store; a backup kept only beside the live database is not disaster recovery.

For scheduled host backups, use cron or a systemd timer to run:

```bash
cd /opt/nivasaos && /usr/local/bin/bun run backup
```

## Restore

Stop the application before restoring:

```bash
docker compose stop nivasaos
bun run restore /secure/location/nivasaos.tar.gz --force
docker compose start nivasaos
```

A restore validates the manifest checksum and SQLite integrity, creates a safety backup of the current database and uploads, stages all restored files, and then swaps them into place. Do not run restore while an application process is writing to the database.

## Self-hosted automation options

`bun run gate` can be executed by any environment capable of running Bun: a developer workstation, a private Jenkins agent, Woodpecker CI, Forgejo Actions, a systemd service, or a simple deployment script. Those integrations are optional wrappers around the repository-owned gate, not requirements for correctness.
