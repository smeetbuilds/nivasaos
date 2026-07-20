# Authenticated browser and accessibility testing

NivasaOS includes a repository-owned browser gate for rendered production behavior. It does not require a paid testing platform or an application runtime dependency.

## What the gate proves

`bun run gate:browser` starts an isolated production server and SQLite workspace, launches Chrome through the Chrome DevTools Protocol, installs an isolated authenticated owner session, and verifies authenticated routes.

The desktop route set covers:

- dashboard;
- properties;
- people;
- agreements;
- invoices;
- reports;
- tenant-portal administration.

For each route the gate checks the document title, language, main landmark, heading hierarchy, duplicate IDs, image alternatives, native control names, browser runtime exceptions, console errors, and unnamed interactive nodes in Chrome's accessibility tree.

The mobile route set covers the people, agreements, and invoice registers at a 390 × 844 viewport. These high-use tables must render as purpose-built record cards without horizontal page or table-container overflow. The gate records screenshots for each mobile register.

## Run locally

Build the exact commit first, then provide a Chrome or Chromium executable:

```bash
bun install --frozen-lockfile
bun run build
NIVASA_BROWSER_BIN=/path/to/google-chrome bun run gate:browser
```

The command creates only isolated temporary data. Generated evidence is written to:

```text
artifacts/browser/
```

The directory contains a JSON report and mobile screenshots. It is ignored by Git and should be retained with release evidence when the gate is used for certification.

## CircleCI

The optional CircleCI browser job uses a pinned browser-tools orb, pinned browser image, pinned Chrome version, and Bun 1.3.0. It runs only after the repository release gate succeeds on `main`, builds the production application, executes `bun run gate:browser`, and stores `artifacts/browser` as a build artifact.

A missing or failed browser job is not browser certification. Self-hosted operators may execute the same command on their own runner and preserve the evidence independently of CircleCI.

## Boundary

Automated checks materially improve regression detection but do not replace deployment-specific acceptance. Before production use, also test the actual reverse proxy, fonts, white-label assets, assistive technology, supported browsers, touch devices, zoom levels, long localized content, and real permission assignments.
