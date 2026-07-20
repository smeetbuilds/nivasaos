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

The command verifies SQLite integrity, creates a consistent snapshot with `VACUUM INTO`, streams the database and uploads through gzip, and records SHA-256 checksums for the database and every upload in the archive manifest.

Backup inspection and restore stream entries into a protected staging directory. The complete database, upload set and expanded archive are not accumulated in process memory.

## Backup safety bounds

The archive layer rejects traversal paths, duplicate entries, unsupported tar entry types, checksum mismatches, excessive file counts and archives beyond configured compressed, expanded, per-entry or manifest limits.

Defaults:

```env
NIVASA_BACKUP_MAX_ARCHIVE_BYTES=8589934592
NIVASA_BACKUP_MAX_EXPANDED_BYTES=34359738368
NIVASA_BACKUP_MAX_ENTRY_BYTES=8589934592
NIVASA_BACKUP_MAX_ENTRIES=100000
NIVASA_BACKUP_MAX_MANIFEST_BYTES=1048576
```

These values represent 8 GiB compressed, 32 GiB expanded content, 8 GiB per entry, 100,000 entries and a 1 MiB manifest. Reduce them for constrained hosts. Increase them only after confirming available disk space for the archive, extraction, target-filesystem staging and pre-restore safety backup.

The backup command rejects symbolic links and unsupported filesystem entries in authenticated upload storage. Store only regular files and directories there.

## Important limitation

The built-in archive is **not encrypted**. Restrictive filesystem permissions protect the local file, but an off-host copy must be encrypted by the operator.

NivasaOS does not mandate a backup vendor, cloud account or API key. Choose any audited tool that fits the deployment.

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

Do not copy a live SQLite file directly from a Docker volume. Run the application backup command inside the container. Every production Compose command must load `.env.production` because the Compose file interpolates `NIVASA_DOMAIN` before running any service command.

```bash
docker compose --env-file .env.production -f compose.production.yml exec -T nivasaos \
  bun run backup -- --output /app/backups/manual.tar.gz
```

Then copy and encrypt the resulting archive:

```bash
docker compose --env-file .env.production -f compose.production.yml cp \
  nivasaos:/app/backups/manual.tar.gz ./manual.tar.gz
```

## Scheduled backups

NivasaOS deliberately does not run a scheduler inside the web application. Use one operator-owned scheduler and monitor its exit status.

### cron: direct Bun installation

Example daily backup at 02:15:

```cron
15 2 * * * cd /srv/nivasaos && /usr/local/bin/bun run backup -- --output "/var/backups/nivasaos/nivasaos-$(date +\%F).tar.gz" >> /var/log/nivasaos-backup.log 2>&1
```

Example retention cleanup after successful operational validation:

```cron
45 2 * * * find /var/backups/nivasaos -type f -name 'nivasaos-*.tar.gz' -mtime +14 -delete
```

Do not delete the only off-host or quarterly restore-tested copy.

### cron: Docker Compose installation

```cron
15 2 * * * cd /srv/nivasaos && docker compose --env-file .env.production -f compose.production.yml exec -T nivasaos bun run backup -- --output "/app/backups/nivasaos-$(date +\%F).tar.gz" >> /var/log/nivasaos-backup.log 2>&1
```

The archive remains in the persistent backup volume. Add a separate encrypted off-host transfer step.

### systemd service and timer

`/etc/systemd/system/nivasaos-backup.service`:

```ini
[Unit]
Description=NivasaOS checksummed backup
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=/srv/nivasaos
ExecStart=/usr/bin/docker compose --env-file .env.production -f compose.production.yml exec -T nivasaos bun run backup -- --output /app/backups/scheduled.tar.gz
```

`/etc/systemd/system/nivasaos-backup.timer`:

```ini
[Unit]
Description=Run NivasaOS backup daily

[Timer]
OnCalendar=*-*-* 02:15:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
```

Enable and inspect it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nivasaos-backup.timer
systemctl list-timers nivasaos-backup.timer
journalctl -u nivasaos-backup.service
```

Use timestamped files or an off-host tool before the next run overwrites `scheduled.tar.gz`.

## Restore

Stop every NivasaOS process before restoring:

```bash
docker compose --env-file .env.production -f compose.production.yml stop nivasaos
docker compose --env-file .env.production -f compose.production.yml run --rm nivasaos \
  bun run restore -- /app/backups/<backup-file>.tar.gz --force
docker compose --env-file .env.production -f compose.production.yml up -d nivasaos
```

For a non-container installation:

```bash
bun run restore -- /path/to/nivasaos-backup.tar.gz --force
```

Restore creates a safety backup of the current installation before replacement. It validates archive and per-upload checksums, rejects unsafe paths and excessive archives, verifies SQLite integrity, and copies the validated database/uploads into staging directories on their respective target filesystems before atomic activation.

A validation, staging or safety-backup failure occurs before activation and leaves live data untouched. An activation failure removes only newly installed targets and restores the renamed live database/uploads.

## Validate recovery

After restore:

```bash
curl --fail https://property.example.com/api/health
```

Then verify:

- staff login;
- tenant login;
- one invoice and payment record;
- one authenticated upload;
- one module-specific workflow;
- backup age and checksum;
- application logs.

The repository gate performs an isolated backup–mutate–failed-restore–restore–restart cycle, but production restore drills remain mandatory.

## Operational policy

At minimum:

- create backups daily when financial or occupancy data changes;
- keep at least one encrypted copy off the application host;
- monitor backup age and available disk space;
- perform a restore drill after infrastructure changes and at least quarterly;
- document the operator, timestamp, source commit, archive checksum and restore result.
