# Container platform deployment contract

This document is a provider-neutral companion to the canonical [deployment guide](DEPLOYMENT.md). Use it when deploying NivasaOS to a Docker-capable platform other than the included Render Blueprint or self-hosted Docker Compose stack.

NivasaOS currently uses SQLite and local authenticated file storage. A compatible platform must therefore provide one long-running application instance and durable storage attached to that same instance. A platform is not compatible merely because it can build the Dockerfile.

## Required platform capabilities

The hosting platform must support all of the following:

- building the repository root `Dockerfile`, or running an image built from it;
- one continuously running web-service container;
- exactly one application replica;
- a persistent volume mounted at `/app/storage`;
- runtime environment variables and secret values;
- HTTPS through a platform domain or custom domain;
- an HTTP health check at `/api/health`;
- graceful shutdown with at least 30 seconds for `SIGTERM` handling;
- a way to export backup archives off the platform.

Do not deploy NivasaOS to a host that provides only an ephemeral filesystem, serverless functions, static hosting, PHP-only shared hosting, or multiple automatically scaled replicas.

## Container configuration

Use these settings unless the platform maps them automatically:

| Setting | Required value |
| --- | --- |
| Build type | Dockerfile |
| Dockerfile | `./Dockerfile` |
| Build context | repository root |
| Start command | use the image `CMD`; do not override it |
| Internal port | the platform-provided `PORT`, defaulting to `3000` outside Render |
| Bind address | `0.0.0.0` |
| Health check | `GET /api/health` |
| Replicas | `1` |
| Persistent mount | `/app/storage` |
| Pre-deploy migration | disabled |

The image startup command validates production configuration, creates and verifies writable storage directories, runs the idempotent migration registry, and then starts the standalone Next.js server. Do not replace the image command with `next start` or `server.js`, because doing so bypasses startup validation and migrations.

Do not run migrations in a platform pre-deploy job unless that job is guaranteed to mount the same persistent volume as the running service. Many managed platforms run pre-deploy commands in an isolated instance without the application disk.

## Persistent storage layout

Mount one persistent volume at `/app/storage` and keep every mutable path below it:

```text
/app/storage/
├── nivasaos.sqlite
├── uploads/
└── backups/
```

Configure:

```env
NIVASA_DB_PATH=/app/storage/nivasaos.sqlite
NIVASA_UPLOAD_DIR=/app/storage/uploads
NIVASA_BACKUP_DIR=/app/storage/backups
```

Only paths below the persistent mount survive redeploys and restarts. Never place the live SQLite database, uploads, or backup archives exclusively on the container image filesystem.

## Required environment variables

Set these runtime variables:

```env
NODE_ENV=production
HOSTNAME=0.0.0.0
NIVASA_DB_PATH=/app/storage/nivasaos.sqlite
NIVASA_UPLOAD_DIR=/app/storage/uploads
NIVASA_BACKUP_DIR=/app/storage/backups
NIVASA_PUBLIC_URL=https://property.example.com
NIVASA_INSTALL_TOKEN=<generated-token>
```

The platform should supply `PORT`. When it does not, set:

```env
PORT=3000
```

Generate the one-time installation token locally:

```bash
openssl rand -hex 32
```

`NIVASA_PUBLIC_URL` must be the externally reachable HTTPS origin only. Do not include credentials, a path, query string, fragment, or trailing slash.

Do not enable `NIVASA_TRUST_PROXY_HEADERS=1` on a managed platform unless you control the final trusted reverse proxy and it always removes any client-supplied `X-Nivasa-Client-IP` value before setting its own trusted value. Render does not meet this application-specific header contract, so the included Render Blueprint intentionally leaves this option disabled.

## Build-time public origin

The Dockerfile accepts these non-secret build arguments:

```text
NIVASA_PUBLIC_URL
NEXT_PUBLIC_APP_URL
RENDER_EXTERNAL_HOSTNAME
```

Render automatically translates service environment variables into Docker build arguments. On another platform, pass `NIVASA_PUBLIC_URL` or `NEXT_PUBLIC_APP_URL` as a build argument when the platform does not preserve the original external host for Next.js Server Actions.

Never pass `NIVASA_INSTALL_TOKEN` or another secret as a Docker build argument. Secrets belong only in the runtime environment.

## First deployment

1. Create one Docker web service from the repository.
2. Attach a persistent volume at `/app/storage` before the first start.
3. configure the required environment variables and installation token.
4. Configure the health check as `GET /api/health`.
5. Confirm the replica count is exactly one and autoscaling is disabled.
6. Deploy using the Dockerfile's default command.
7. Open the HTTPS URL and enter the installation token.
8. Create the first owner and complete workspace setup.
9. Remove `NIVASA_INSTALL_TOKEN` from the runtime environment.
10. Restart or redeploy the existing image.

A fresh production database intentionally refuses to start without a valid installation token. After an owner exists, the token is no longer required and should not remain configured.

## Custom domains

After the platform has issued HTTPS for the custom domain, set:

```env
NIVASA_PUBLIC_URL=https://property.example.com
```

Rebuild and redeploy when the platform requires build-time origin configuration. Then verify:

- `/api/health` returns HTTP 200;
- owner sign-in and sign-out work;
- installation redirects do not reappear;
- Server Actions submit successfully;
- tenant invitation and activation links use the custom domain;
- authenticated uploads and downloads work.

## Updates

Before every update:

1. review and pin the target tag or commit;
2. create a NivasaOS backup archive;
3. copy the archive to encrypted off-platform storage;
4. confirm the target commit passed the repository and container gates;
5. deploy with one replica and the existing persistent volume;
6. verify health, authentication, permissions, uploads, and financial workflows.

Do not create a second instance against the same SQLite file during a rolling deployment. If the platform cannot update a disk-backed service without temporarily running two writers, use a stop-then-start deployment strategy.

## Backups and restore

Create a backup inside the persistent volume:

```bash
bun run backup -- --output /app/storage/backups/manual-backup.tar.gz
```

A same-volume archive is not disaster recovery. Copy it off the platform, encrypt it with an operator-controlled tool, and regularly test restoration on a separate non-production installation.

Stop the application before restoring a production archive. Follow [Backups and restore](BACKUPS.md) for the complete procedure and safety limits.

## Deployment acceptance checklist

A platform deployment is acceptable only after all of these checks pass:

- the service survives a normal restart with the same owner account and data;
- a redeploy preserves the database and uploaded files;
- `/api/health` checks database reachability and writable upload storage;
- only one application replica can access the SQLite database;
- the first-owner token has been removed after installation;
- HTTPS and the canonical public URL are correct;
- owner, delegated staff, and tenant authentication work;
- permission-scoped file delivery works;
- a backup can be exported off-platform and restored elsewhere;
- the exact deployed commit and verification evidence are recorded.

## Canonical supported paths

For the maintained provider-specific instructions, use:

- [Render Blueprint deployment](DEPLOYMENT.md#render-blueprint-deployment)
- [Self-hosted Docker Compose](DEPLOYMENT.md#self-hosted-docker-compose)
- [Production release and deployment](PRODUCTION_RELEASE.md)
- [Known limitations](KNOWN_LIMITATIONS.md)

The current architecture is intentionally single-instance. Horizontal scaling requires a future migration from SQLite and local file storage to shared durable services such as PostgreSQL and object storage.