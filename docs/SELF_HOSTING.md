# Self-host NivasaOS

The supported self-hosting model is one Linux server, one NivasaOS application container, persistent local Docker volumes, and an HTTPS reverse proxy.

The repository includes `compose.production.yml`, which runs NivasaOS behind Caddy and provisions persistent volumes for SQLite, uploads, and backups.

## Server requirements

Recommended starting point:

- Ubuntu 22.04 or 24.04;
- 2 GB RAM;
- 25 GB persistent disk;
- a public IPv4 or IPv6 address;
- root or sudo SSH access;
- Docker Engine with the Compose plugin;
- ports 80 and 443 open;
- a DNS record pointing a domain or subdomain to the server.

Normal PHP/cPanel shared hosting is not sufficient unless it provides Docker, long-running container support, persistent storage, and reverse-proxy control.

## Install Docker

Use Docker's official installation instructions for your Linux distribution. Confirm:

```bash
docker version
docker compose version
```

## Clone and configure

```bash
sudo mkdir -p /opt/nivasaos
sudo chown "$USER":"$USER" /opt/nivasaos
git clone https://github.com/smeetbuilds/nivasaos.git /opt/nivasaos
cd /opt/nivasaos
cp .env.production.example .env.production
chmod 600 .env.production
```

Generate the one-time installation token without requiring Bun on the host:

```bash
openssl rand -hex 32
```

Edit `.env.production`:

```env
NIVASA_DOMAIN=property.example.com
NIVASA_PUBLIC_URL=https://property.example.com
NIVASA_INSTALL_TOKEN=<paste-generated-token>
```

`NIVASA_DOMAIN` is only the DNS name. `NIVASA_PUBLIC_URL` is the complete HTTPS origin.

Validate Compose interpolation:

```bash
docker compose --env-file .env.production -f compose.production.yml config
```

## Start the production stack

```bash
docker compose --env-file .env.production -f compose.production.yml up -d --build
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs --tail=200
```

Caddy obtains and renews TLS automatically after DNS resolves and ports 80/443 are reachable.

Check health:

```bash
curl --fail https://property.example.com/api/health
```

Open the HTTPS URL, enter the installation token, and create the first owner.

After installation, remove `NIVASA_INSTALL_TOKEN` from `.env.production` and recreate only the application service:

```bash
docker compose --env-file .env.production -f compose.production.yml up -d --force-recreate nivasaos
```

## Back up

Create an application-consistent archive:

```bash
docker compose --env-file .env.production -f compose.production.yml exec -T nivasaos \
  bun run backup -- --output /app/backups/manual-backup.tar.gz
```

Copy the archive off the server, encrypt it, and monitor its age. A backup stored only on the same host does not protect against disk or server loss.

## Update safely

```bash
cd /opt/nivasaos

docker compose --env-file .env.production -f compose.production.yml exec -T nivasaos \
  bun run backup -- --output /app/backups/pre-update.tar.gz

git fetch --all --tags
git pull --ff-only origin main

docker compose --env-file .env.production -f compose.production.yml up -d --build
docker compose --env-file .env.production -f compose.production.yml ps
curl --fail https://property.example.com/api/health
```

Perform deployment-specific acceptance checks after every update.

## Restore

Stop the application before restoring:

```bash
docker compose --env-file .env.production -f compose.production.yml stop nivasaos

docker compose --env-file .env.production -f compose.production.yml run --rm nivasaos \
  bun run restore -- /app/backups/manual-backup.tar.gz --force

docker compose --env-file .env.production -f compose.production.yml up -d nivasaos
```

Then verify health and business data before reopening normal access.

## Roll back code

A code rollback does not automatically roll back a database migration.

1. Stop NivasaOS.
2. Restore the verified pre-update backup when the release changed schema or data.
3. Check out the previously approved commit.
4. Rebuild and start the stack.
5. Run health, login, permission, file, and financial acceptance checks.

## Security checklist

- Keep the server and Docker patched.
- Restrict SSH to keys.
- Allow only required inbound ports.
- Keep `.env.production` mode `0600`.
- Do not expose the NivasaOS container port directly in production.
- Keep one application instance for the SQLite database.
- Store encrypted backups off-host.
- Test restoration.
- Review `SECURITY.md` and `docs/KNOWN_LIMITATIONS.md`.
