# Production runtime image

NivasaOS uses a multi-stage Docker build and Next.js standalone output.

## Runtime contents

The final image is based on pinned `oven/bun:1.3.0-alpine` and contains only:

- the traced standalone Next.js server;
- compiled static assets;
- public brand assets;
- the reduced runtime package manifest;
- database schema and migration modules;
- setup-token, migrate, backup, and restore commands.

It does not intentionally contain application source pages, React component source, repository history, CI files, test verifiers, build caches, or the complete development dependency tree.

The application runs as the unprivileged `bun` user. Database, authenticated uploads, and backups remain separate persistent volumes.

## Operator commands

Inside the running container:

```bash
docker compose exec nivasaos bun run setup:token
docker compose exec nivasaos bun run migrate
docker compose exec nivasaos bun run backup -- --output /app/backups/manual-backup.tar.gz
docker compose stop nivasaos
docker compose run --rm nivasaos bun run restore -- /app/backups/manual-backup.tar.gz --force
```

Restore requires the web application to be stopped. Follow the complete backup and restore procedure rather than relying only on these examples.

## Image-size contract

`bun run gate:container` measures the built image and rejects it above `NIVASA_MAX_IMAGE_BYTES`. The default ceiling is 350 MiB:

```bash
NIVASA_MAX_IMAGE_BYTES=367001600 bun run gate:container
```

The ceiling is a regression guard, not a published claim that an untested commit has a particular image size. Compression, architecture, Docker version, base-image changes, and layer reuse can affect reported size. Record the measured image ID and size for the exact release commit.

## Container gate

The container gate proves, for the environment where it runs:

- the image builds;
- Compose starts and becomes healthy;
- the runtime is non-root;
- development source and verifier paths are absent;
- standalone server and operator commands are present;
- the migration ledger is complete;
- explicit migration is idempotent;
- a real backup archive can be created;
- SQLite and uploads persist across restart;
- the measured image remains under the configured ceiling.

A committed Dockerfile or successful static verifier is not container certification. Retain the successful `gate:container` result for the exact deployment commit.

## Platform boundary

The provided image targets Linux containers. NivasaOS remains a single-process SQLite application. Do not scale the service to multiple replicas against one database volume.
