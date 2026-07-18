# Backups and restore

NivasaOS stores the SQLite database and authenticated uploads locally. The built-in backup command creates one checksummed gzip archive containing both.

## Create a backup

```bash
bun run backup
```

Choose an explicit destination when the default backup directory is not appropriate:

```bash
bun run backup -- --output /secure/path/nivasaos-backup.tar.gz
```

The command performs SQLite integrity verification before creating the archive and records a SHA-256 checksum in its manifest.

## Important limitation

The built-in archive is **not encrypted**. Restrictive filesystem permissions protect the local file, but an off-host copy must be encrypted by the operator.

NivasaOS does not mandate a backup vendor, cloud account, or API key. Choose any audited tool that fits the deployment.

## Example: encrypt with age

```bash
bun run backup -- --output /tmp/nivasaos-backup.tar.gz
age -r age1YOURPUBLICKEY -o /secure/offsite/nivasaos-backup.tar.gz.age /tmp/nivasaos-backup.tar.gz
rm -f /tmp/nivasaos-backup.tar.gz
```

Keep the age private identity outside the application server.

## Example: restic repository

```bash
bun run backup -- --output /var/backups/nivasaos/latest.tar.gz
restic backup /var/backups/nivasaos/latest.tar.gz
restic check
```

Restic repository credentials are optional operator infrastructure and are not part of NivasaOS.

## Docker volume export

Do not copy a live SQLite file directly from a Docker volume. Run the application backup command inside the container:

```bash
docker compose -f compose.production.yml exec nivasaos bun run backup -- --output /app/backups/manual.tar.gz
```

Then copy and encrypt the resulting archive:

```bash
docker compose -f compose.production.yml cp nivasaos:/app/backups/manual.tar.gz ./manual.tar.gz
```

## Restore

Stop every NivasaOS process before restoring:

```bash
docker compose -f compose.production.yml stop nivasaos
docker compose -f compose.production.yml run --rm nivasaos bun run restore -- /app/backups/<backup-file>.tar.gz --force
docker compose -f compose.production.yml up -d nivasaos
```

For a non-container installation:

```bash
bun run restore -- /path/to/nivasaos-backup.tar.gz --force
```

Restore creates a safety backup of the current installation before replacing the database and uploads. It validates archive checksums, rejects unsafe paths, verifies SQLite integrity, and uses staged atomic replacement.

## Operational policy

At minimum:

- create backups daily when financial or occupancy data changes;
- keep at least one encrypted copy off the application host;
- monitor backup age and available disk space;
- perform a restore drill after infrastructure changes and at least quarterly;
- document the operator, timestamp, source commit, archive checksum, and restore result.
