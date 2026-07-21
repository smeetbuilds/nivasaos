# Deploy NivasaOS on Render

This guide deploys NivasaOS as one Docker web service with one persistent disk. It is suitable for a demo, a small production installation, or an open-source evaluation that must survive restarts and redeploys.

## Important cost and architecture boundary

NivasaOS stores SQLite, authenticated uploads, and backup archives on the local filesystem. Render's default filesystem is ephemeral, and the Free web-service plan does not support persistent disks.

A durable NivasaOS deployment therefore requires:

- a paid Render web-service instance, starting with `starter`;
- one persistent disk mounted at `/app/storage`;
- exactly one service instance;
- no autoscaling or preview instance sharing the production disk.

The checked-in Blueprint uses a 1 GB disk. Disk size can be increased later but not reduced. Choose the deployment region carefully during initial service creation; Render does not allow changing a service region after creation.

## One-click Blueprint deployment

Generate an installation token locally and keep it available for the first-owner form:

```bash
openssl rand -hex 32
```

Then use the **Deploy to Render** button in the root `DEPLOYMENT.md`, or open Render Dashboard → Blueprints → New Blueprint Instance and select this repository.

During Blueprint creation Render prompts for `NIVASA_INSTALL_TOKEN`. Paste the generated token.

The Blueprint creates:

- a Docker web service from the repository `Dockerfile`;
- a single `starter` instance;
- port `10000`;
- health checks at `/api/health`;
- a 1 GB persistent disk at `/app/storage`;
- SQLite at `/app/storage/nivasaos.sqlite`;
- uploads at `/app/storage/uploads`;
- backups at `/app/storage/backups`;
- automatic deploys disabled.

NivasaOS automatically uses Render's `RENDER_EXTERNAL_URL` as its public URL when `NIVASA_PUBLIC_URL` is not explicitly set.

## Complete the first installation

1. Wait until the Render deploy is Live and the `/api/health` check is passing.
2. Open the service's `onrender.com` URL.
3. Enter the same `NIVASA_INSTALL_TOKEN`.
4. Create the first owner and complete workspace setup.
5. In Render Dashboard → Service → Environment, delete `NIVASA_INSTALL_TOKEN`.
6. Choose **Save and deploy**.

Once an owner exists, the token is no longer needed.

## Custom domain

Add the custom domain in Render first. Then set:

```env
NIVASA_PUBLIC_URL=https://property.example.com
```

Use only scheme and host: no credentials, path, query string, fragment, or trailing slash. Redeploy after saving it.

## Updates

The Blueprint deliberately sets `autoDeployTrigger: off`. SQLite-backed deployments should not update immediately on every upstream commit.

Before each update:

1. Open the running service's Render Shell.
2. Create a checksummed backup:

   ```bash
   bun run backup -- --output /app/storage/backups/pre-deploy.tar.gz
   ```

3. Copy the archive off Render using Render SSH/SCP or another encrypted operator-controlled transfer.
4. In Render Dashboard, choose **Manual Deploy → Deploy latest commit**.
5. Confirm `/api/health` and perform login, permission, file-upload, and financial reconciliation acceptance checks.

The container runs the ordered migration registry before the web server begins listening. Do not configure a Render pre-deploy migration command: Render pre-deploy instances cannot access the attached persistent disk.

## Restore

Restoration must occur before the web server starts so SQLite is not open concurrently.

1. Put the required archive under `/app/storage/backups`.
2. Temporarily set the service's Docker Command to:

   ```bash
   /bin/sh -c 'bun run restore -- /app/storage/backups/backup.tar.gz --force && bun run start'
   ```

3. Deploy and verify the restored service.
4. Clear the custom Docker Command so future deploys use the image `CMD`.
5. Deploy once more and repeat acceptance checks.

The restore command creates a pre-restore safety backup when a live database exists.

## Backup responsibility

Render persistent disks provide daily platform snapshots, but platform snapshots are not a replacement for application-consistent, off-platform backups. Keep encrypted copies outside the Render service and test restoration periodically.

## Unsupported Render configurations

Do not use:

- the Free plan for persistent NivasaOS data;
- an ephemeral service without a disk;
- multiple service instances;
- autoscaling;
- a pre-deploy migration command;
- preview environments against production data;
- a disk mount that excludes the configured SQLite, upload, or backup paths.
