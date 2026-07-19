# NivasaOS 1.1 production release guide

NivasaOS is self-hosted and requires no paid platform or external API for core operation. Production readiness is established only by successful evidence from the exact commit being deployed. CircleCI is an optional runner for repository-owned checks, not a separate source of truth.

Read [Known limitations](KNOWN_LIMITATIONS.md) before using real financial or resident data. The current release line is a technical preview until the exact deployment commit passes every applicable check below.

## Fast production setup

The included `compose.production.yml` runs NivasaOS behind Caddy with automatic HTTPS. The application container receives `.env.production`; Caddy receives only `NIVASA_DOMAIN`.

```bash
git clone https://github.com/smeetbuilds/nivasaos.git
cd nivasaos
cp .env.production.example .env.production
bun run setup:token
```

Copy the generated `NIVASA_INSTALL_TOKEN=...` line into `.env.production`, then set:

```env
NIVASA_DOMAIN=property.example.com
NIVASA_PUBLIC_URL=https://property.example.com
NIVASA_INSTALL_TOKEN=<generated value>
```

Point the domain to the server and start:

```bash
docker compose -f compose.production.yml up -d --build
```

Complete the browser installer using the token. After the first owner exists, remove `NIVASA_INSTALL_TOKEN` from `.env.production and restart the application service.

## Required release evidence

Run from the exact commit intended for deployment:

```bash
bun install --frozen-lockfile
bun run audit:dependencies
bun run gate
bun run gate:container
```

`audit:dependencies` requires registry access and fails when Bun reports a high or critical production-dependency advisory. It is deliberately separate from the offline-capable repository gate.

The repository gate performs:

1. tracked-secret and environment-file verification, including Docker build-context fallback;
2. JavaScript and JSX parsing;
3. fresh-schema, security, release, money-scale and legacy-migration verification;
4. route, Server Action and file-delivery authorization contracts;
5. timing-equalized staff and tenant login, account/network throttling and atomic installation checks;
6. exact minor-unit payment, payment-submission, deposit and late-fee reconciliation checks;
7. strict date, reservation, request, housekeeping and bulk-job state contracts;
8. responsive UI, tenant portal, handover and modular source-contract verification;
9. Dockerfile, canonical Compose, proxy isolation, Caddy and persistent-storage checks;
10. open-source packaging and production-runtime verification;
11. a production Next.js build;
12. unsafe public-URL and missing-installation-protection rejection tests;
13. an isolated production server smoke test;
14. real database-and-upload backup and restore recovery;
15. a post-restore production restart and health check.

The container gate builds the image, starts an isolated Compose stack, verifies a non-root runtime and persistent named volumes, restarts the application, rechecks health, and tears down the test volumes.

Do not deploy when any applicable step fails or has not been executed.

## CircleCI evidence

`.circleci/config.yml` installs the pinned dependency graph and runs:

```bash
bun run audit:dependencies
bun run gate
```

After that succeeds on `main`, the machine-executor job runs:

```bash
bun run gate:container
```

A missing CircleCI status is not a success. A CircleCI failure is a release failure. A CircleCI success does not replace operator testing against production-sized data and deployment-specific browser workflows.

The application remains buildable and deployable without CircleCI.

## Production environment contract

Required for a fresh installation:

- `NIVASA_PUBLIC_URL` — canonical HTTPS origin;
- `NIVASA_INSTALL_TOKEN` — generated value of at least 24 characters until the first owner is created;
- persistent paths for SQLite, uploads and backups;
- a real IANA workspace timezone selected during installation.

The production Compose file configures storage paths automatically. Direct installations may use:

```env
NODE_ENV=production
NIVASA_DB_PATH=/srv/nivasaos/data/nivasaos.sqlite
NIVASA_UPLOAD_DIR=/srv/nivasaos/uploads
NIVASA_BACKUP_DIR=/srv/nivasaos/backups
NIVASA_PUBLIC_URL=https://property.example.com
NIVASA_INSTALL_TOKEN=<generated locally>
```

`NIVASA_PUBLIC_URL` must contain only an HTTPS scheme and host. Credentials, paths, query strings, fragments, localhost and plain HTTP are rejected in production. The local Compose stack explicitly opts into localhost for evaluation.

## Protected first installation

A fresh public server must never allow an arbitrary visitor to claim the owner account.

Generate the token locally:

```bash
bun run setup:token
```

The installer requires that token only while no owner exists. The token is compared in constant time and is not stored in SQLite.

Owner creation and the installation marker are committed in one database transaction. A concurrent second installation request is rejected.

Remove the token after successful installation.

## Authentication acceptance checks

Before release, verify both staff and tenant login with:

- valid credentials;
- unknown email and wrong password responses that remain generic;
- repeated failures from one client network;
- successful login after the throttle window;
- account disable/session revocation;
- tenant invite, reset, consumption and replay rejection;
- confirmation that raw tenant tokens do not appear in redirect URLs or server access logs.

Application throttling is not a substitute for firewall or reverse-proxy rate limiting.

## Permission acceptance checks

Use at least two properties and delegated users with intentionally different permissions. Verify direct URLs as well as navigation visibility.

The minimum matrix includes:

- assigned property without `handover.manage` cannot retrieve lease documents;
- billing manager without payments permission cannot record or approve payments;
- payments manager without billing permission cannot issue or void invoices;
- tenant portal manager cannot view or mutate deposits without `deposits.manage`;
- delegated users cannot read another property by editing IDs;
- archived/internal documents remain unavailable to tenants;
- permission changes revoke existing staff sessions.

## Financial acceptance checks

Test values including `0.01`, `9.90`, full payment, partial payment, pending proof, deposit receipt and refund. Confirm that inputs with more than two decimal places are rejected by both the action layer and SQLite money-scale triggers.

The current compatibility schema still uses SQLite `REAL`. Follow the independent reconciliation warning in [Known limitations](KNOWN_LIMITATIONS.md); do not treat this release as the sole statutory accounting ledger.

## Backup and restore recovery

Before launch and after every schema-sensitive update:

1. create a production-sized backup;
2. copy it off-host and encrypt it;
3. stop the application;
4. restore into an isolated environment;
5. verify database integrity, uploads, permissions and financial totals;
6. restart twice and confirm health;
7. retain the pre-restore safety backup until acceptance is complete.

The current archive implementation uses memory proportional to database and upload size. Test against production-sized copies and monitor memory.

## Browser and UI acceptance

Source verifiers do not prove rendered behavior. Manually test the relevant routes on current desktop and mobile browsers, including:

- keyboard-only navigation and dialog focus;
- form validation and retained values after rejection;
- tables at small viewport widths;
- long names, addresses and currency values;
- screen zoom and reduced-motion preference;
- tenant portal invitation, billing, maintenance and document workflows;
- white-label assets and fallback branding.

Record screenshots and the tested browser/device matrix with the release evidence.

## Monitoring

Monitor at minimum:

- `/api/health` status and latency;
- container restarts and disk usage;
- database, WAL, upload and backup volume capacity;
- failed login and throttle events;
- backup age and off-host replication;
- application and Caddy logs;
- dependency-advisory update pull requests.

## Rollback

Keep the prior image/commit and a verified pre-deployment backup. For a failed release:

1. stop the new application process;
2. preserve its database and uploads for investigation;
3. restore the verified backup only when schema/data rollback is required;
4. start the previous image or commit;
5. rerun health and browser acceptance checks;
6. document the failure before attempting another deployment.

A source rollback without a data-compatibility decision is not a complete rollback.
