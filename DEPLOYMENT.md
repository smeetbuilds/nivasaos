# NivasaOS deployment

NivasaOS is an open-source, single-instance application that persists SQLite, authenticated uploads, and backups on local storage.

## Deploy to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/smeetbuilds/nivasaos)

Supported deployment paths:

- [Render](docs/RENDER.md) — Docker web service with one paid persistent disk.
- [Self-hosted Linux server](docs/SELF_HOSTING.md) — Docker Compose and Caddy with automatic HTTPS.
- [Local evaluation](README.md#fastest-local-evaluation) — Docker Compose on a private machine.

Unsupported without architectural migration:

- Vercel or another ephemeral serverless filesystem;
- PHP-only shared hosting;
- multiple replicas sharing one SQLite database;
- Render Free without persistent storage.

Production approval still requires successful verification for the exact deployed commit plus deployment-specific acceptance checks.
