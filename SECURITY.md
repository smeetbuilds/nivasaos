# Security policy

Please do not disclose suspected vulnerabilities in a public issue.

Report them privately to **hi@aahavlabs.in** with:

- affected version or commit;
- reproduction steps;
- expected impact;
- any suggested mitigation.

## Supported versions

Until the first stable release, security fixes target the latest commit on `main`.

## Deployment baseline

Run NivasaOS behind HTTPS, keep Bun and dependencies patched, restrict access to the `storage` volume, use `bun run backup` and test restores regularly, copy backups off-host, and never expose the database file through a public web directory.
