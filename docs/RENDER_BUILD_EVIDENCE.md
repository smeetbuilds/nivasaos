# Render build evidence

`bun run gate:render` reproduces the repository Dockerfile with the public build arguments that Render provides to a Docker service. It is the repository-owned authority for this build boundary and can run from Codespaces, a self-hosted Docker machine, or CircleCI.

The `render-build-gate` CircleCI job invokes the same script independently of the ordinary repository release gate on `main`, so a verification or image-build failure still produces a dedicated Docker log.

## Run it directly

From a complete checkout with Docker available:

```bash
bun run gate:render
```

The command exits with the real Docker build status. To capture evidence without immediately failing, then enforce it after uploading or copying the artifact directory:

```bash
bash scripts/render-build-gate.sh --capture-only
bash scripts/render-build-gate.sh --enforce-only
```

Set `NIVASA_RENDER_ARTIFACT_DIR` to change the evidence directory or `NIVASA_RENDER_IMAGE_TAG` to change the local image tag.

## Retained artifacts

The job stores an artifact directory named `render-build` containing:

- `build.log` — plain BuildKit output for every Docker layer, including the `[nivasa-build]` preflight record and the first failing Docker layer or command;
- `build-exit-code.txt` — the Docker build exit code used to fail the command or job after artifacts are stored;
- `build-metadata.txt` — non-secret commit, branch, host, URL, and image-tag metadata;
- `image-inspect.json` — image metadata when the build succeeds;
- `image-size.jsonl` — the resulting image-size record when the build succeeds.

The job records the build result first, uploads the evidence, and then enforces the recorded exit code. This ordering prevents a failed Docker layer from hiding the log that is needed to diagnose it.

## Build boundary

The reproduction passes only non-secret public deployment metadata:

- Render external hostname and URL;
- current CircleCI commit SHA;
- current branch name.

`NIVASA_INSTALL_TOKEN`, passwords, cookies, database contents, and resident data must never be supplied as Docker build arguments.

The Dockerfile itself runs repository verification, sanitized build diagnostics, and the Next.js production compilation in separate layers. When a job fails, inspect `build.log` in this order:

1. Find the first `[nivasa-build]` line and confirm the Bun, Next.js, commit, URL, and disposable build-storage values.
2. Find the first Docker layer ending with a non-zero exit code.
3. Classify the failure as dependency installation, repository verification, diagnostics, Next.js compilation, or runtime-image assembly.
4. Fix the first causal error rather than later cascade messages.

A successful reproduction proves that the reviewed Dockerfile can build on CircleCI's Linux Docker host. It does not replace an actual Render deployment, persistent-disk startup, `/api/health` verification, or browser acceptance on the deployed release.
