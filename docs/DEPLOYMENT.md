# Deployment

NivasaOS is designed for one application instance with one persistent SQLite database, authenticated uploads, and backup archives. The supported production patterns are:

1. **Render Blueprint** — easiest managed deployment, using the repository Dockerfile and one persistent disk.
2. **Self-hosted Docker Compose** — recommended when you control a Linux VPS and want Caddy-managed HTTPS.
3. **Existing reverse proxy** — run the NivasaOS container privately and route HTTPS through an operator-managed Caddy, Nginx, Traefik, or equivalent proxy.

NivasaOS is not a PHP application. A PHP-only shared-hosting or cPanel account is not sufficient unless it also provides persistent Docker workloads, SSH access, and control of the reverse proxy.

## Non-negotiable deployment boundaries

- Run exactly **one** NivasaOS application instance against a SQLite database.
- Store the database, uploads, and backup archives on persistent storage.
- Use HTTPS for every production installation.
- Keep the first-owner installation token secret and remove it after installation.
- Keep verified encrypted backups outside the application host or platform.
- Do not treat a successful build as release certification; retain gate output for the exact deployed commit.

Read [Known limitations](KNOWN_LIMITATIONS.md), [Production release](PRODUCTION_RELEASE.md), and [Backups and restore](BACKUPS.md) before storing real resident, identity, financial, deposit, or legal-document data.

---

## Render Blueprint deployment

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fsmeetbuilds%2Fnivasaos)

The repository includes `render.yaml`, which creates:

- one Docker web service;
- one Starter instance;
- one 1 GB persistent disk mounted at `/app/storage`;
- SQLite, uploads, and backup directories under that disk;
- a `/api/health` health check;
- one application instance;
- manual deployments by default.

A persistent disk requires a paid Render web-service instance. The disk can be increased later, but Render does not allow reducing its size.

### 1. Prepare the installation token

During Blueprint creation, Render prompts for `NIVASA_INSTALL_TOKEN`.

Generate a unique value of at least 24 characters. A 64-character hexadecimal token is recommended:

```bash
openssl rand -hex 32
```

You can also generate it from a NivasaOS checkout:

```bash
bun run setup:token
```

Store it temporarily in a password manager. Do not commit it to the repository.

### 2. Deploy the Blueprint

1. Click **Deploy to Render** above.
2. Sign in to Render and review the Blueprint.
3. Choose the workspace and region appropriate for your users.
4. Enter the generated `NIVASA_INSTALL_TOKEN` when prompted.
5. Approve the Blueprint.

Render builds the repository Dockerfile. The Docker build runs the repository verification chain before the production Next.js build. A failed verification or build does not produce a deployable image.

The Blueprint deliberately sets automatic deployment to `off`. For an open-source upstream repository, this prevents every installation from redeploying immediately whenever upstream `main` changes. Review a release or commit first, then deploy it manually.

### 3. Complete first-owner installation

After the service becomes healthy:

1. Open the service's `https://<service>.onrender.com` URL.
2. Enter the same `NIVASA_INSTALL_TOKEN`.
3. Create the first owner.
4. Complete the workspace, timezone, currency, and module setup.

When `NIVASA_PUBLIC_URL` is not explicitly configured, NivasaOS uses Render's `RENDER_EXTERNAL_URL` for its canonical external URL.

### 4. Remove the bootstrap token

After the owner account exists:

1. Open the Render service.
2. Go to **Environment**.
3. Delete `NIVASA_INSTALL_TOKEN`.
4. Save and deploy the existing image or trigger a fresh deploy.

Because the Blueprint marks the token with `sync: false`, later Blueprint syncs do not overwrite the operator-managed secret.

### 5. Add a custom domain

1. Add the custom domain in the Render service settings.
2. Add this environment variable:

```env
NIVASA_PUBLIC_URL=https://property.example.com
```

3. Save and redeploy.
4. Confirm `/api/health`, sign-in, installation redirects, tenant links, and Server Actions on the custom domain.

`NIVASA_PUBLIC_URL` must contain only the HTTPS scheme and host. Do not include credentials, a path, query string, fragment, or trailing slash.

### Render storage layout

The Blueprint stores all mutable application state under the persistent disk:

```text
/app/storage/
├── nivasaos.sqlite
├── uploads/
└── backups/
```

Only files under the disk mount survive redeploys. Do not move any of these paths to the image filesystem.

### Render updates

Automatic deployment is disabled. For each update:

1. Review the target commit and changelog.
2. Confirm the exact commit has passed the required repository and browser gates.
3. Create and export an off-platform backup.
4. In Render, choose **Manual Deploy** and deploy the reviewed commit.
5. Check `/api/health`, owner sign-in, tenant sign-in, permissions, uploads, and financial workflows.

Render persistent disks are available to only one service instance and cannot be accessed by build or pre-deploy instances. NivasaOS therefore applies its idempotent migration registry when the application instance starts; the Blueprint intentionally does not define a Render pre-deploy migration command.

Attaching a disk disables zero-downtime deploys. Expect a short interruption while Render stops the existing disk-backed instance and starts the replacement.

### Render backups

Create a checksummed archive from the Render Shell:

```bash
bun run backup -- --output /app/storage/backups/manual-backup.tar.gz
```

A backup on the same Render disk is useful for application-level rollback but is not sufficient disaster recovery. Copy archives off Render using SSH/SCP or another operator-controlled encrypted transfer, then test restoration on a separate non-production installation.

Do not scale the Render service above one instance. A persistent disk cannot be attached to multiple instances, and NivasaOS does not support multiple writers to one SQLite database.

---

## Self-hosted Docker Compose

The production Compose stack is the recommended self-hosted installation. It runs NivasaOS privately behind Caddy, which publishes ports 80 and 443 and obtains HTTPS certificates automatically.

### Requirements

- A Linux VPS or dedicated server with root or sudo SSH access
- Docker Engine and Docker Compose v2
- A public IPv4 or IPv6 address
- DNS control for a domain or subdomain
- Inbound TCP ports 80 and 443; UDP 443 is optional for HTTP/3
- Persistent local disk space sized for the database, uploads, backup staging, and off-host transfer

A practical small-installation starting point is 2 GB RAM and 10 GB available disk, but actual storage requirements are determined mainly by uploaded documents and retained backups.

### 1. Point DNS to the server

Create an `A` or `AAAA` record such as:

```text
property.example.com → your server IP
```

Wait until DNS resolves before starting Caddy.

### 2. Clone the repository

```bash
sudo mkdir -p /opt/nivasaos
sudo chown "$USER":"$USER" /opt/nivasaos
git clone https://github.com/smeetbuilds/nivasaos.git /opt/nivasaos
cd /opt/nivasaos
```

For production, deploy a reviewed tag or exact commit rather than an unreviewed moving branch.

### 3. Create the environment file

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Generate a token:

```bash
openssl rand -hex 32
```

Set:

```env
NIVASA_DOMAIN=property.example.com
NIVASA_PUBLIC_URL=https://property.example.com
NIVASA_INSTALL_TOKEN=<generated-token>
```

Do not include `https://` in `NIVASA_DOMAIN`. Do include it in `NIVASA_PUBLIC_URL`.

### 4. Start the production stack

```bash
docker compose \
  --env-file .env.production \
  -f compose.production.yml \
  up -d --build
```

`--env-file .env.production` is required because Compose must resolve `NIVASA_DOMAIN` before starting Caddy.

Check status and logs:

```bash
docker compose \
  --env-file .env.production \
  -f compose.production.yml \
  ps

docker compose \
  --env-file .env.production \
  -f compose.production.yml \
  logs --tail=200
```

### 5. Complete installation

Open:

```text
https://property.example.com
```

Enter the token, create the first owner, and complete workspace setup.

Then remove `NIVASA_INSTALL_TOKEN` from `.env.production` and recreate only the application service:

```bash
docker compose \
  --env-file .env.production \
  -f compose.production.yml \
  up -d --force-recreate nivasaos
```

### 6. Verify the deployment

```bash
curl --fail --show-error https://property.example.com/api/health
```

Also verify:

- owner sign-in and sign-out;
- delegated property permissions;
- tenant activation and sign-in;
- upload and authenticated download;
- invoice, payment, deposit, and receipt flows;
- backup creation and restore rehearsal;
- mobile layouts and the supported browser matrix.

### Self-hosted updates

Create a backup first:

```bash
docker compose \
  --env-file .env.production \
  -f compose.production.yml \
  exec nivasaos \
  bun run backup -- --output /app/backups/pre-update.tar.gz
```

Then deploy the reviewed commit:

```bash
git fetch --tags origin
git checkout <reviewed-tag-or-commit>

docker compose \
  --env-file .env.production \
  -f compose.production.yml \
  up -d --build
```

Review logs and health immediately after the update.

### Self-hosted rollback

1. Stop the application.
2. Check out the previously deployed commit.
3. Rebuild that image.
4. Restore the pre-update archive only when the schema or data changed and the release documentation requires it.
5. Re-run health, authorization, tenant, upload, and financial acceptance checks.

Never overwrite a live database file manually while the application is running.

---

## Existing reverse proxy

You can run the NivasaOS image behind an existing Caddy, Nginx, Traefik, or managed load balancer instead of the included production Compose proxy.

The proxy must:

- terminate HTTPS;
- preserve the original host;
- forward requests to one private NivasaOS instance;
- support request bodies of at least 8 MB;
- prevent direct public access to the application port;
- set trusted client-address metadata only when the proxy overwrites it.

Do not enable `NIVASA_TRUST_PROXY_HEADERS=1` unless your own trusted proxy overwrites `X-Nivasa-Client-IP`. Never accept that header directly from the public internet.

Set:

```env
NIVASA_PUBLIC_URL=https://property.example.com
```

Bind the container only to a private interface or container network.

---

## Unsupported deployment patterns

The following are not supported by the current SQLite architecture:

- Vercel or another ephemeral serverless filesystem without a database/storage migration;
- PHP-only shared hosting;
- multiple application replicas;
- a shared SQLite file mounted by multiple containers;
- Kubernetes horizontal scaling;
- multiple regions writing to one installation;
- placing the live database on an unverified network filesystem;
- running migrations concurrently.

A future PostgreSQL and object-storage architecture would be required for horizontally scaled SaaS deployment.
