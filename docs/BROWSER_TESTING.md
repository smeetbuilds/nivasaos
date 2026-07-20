# Authenticated browser and accessibility testing

NivasaOS includes repository-owned rendered-browser gates. They do not require a paid testing platform or an application runtime dependency.

## Chrome accessibility gate

`bun run gate:browser` starts an isolated production server and SQLite workspace, launches Chrome through the Chrome DevTools Protocol, installs an isolated authenticated owner session, and verifies representative authenticated routes.

The desktop route set covers dashboard, properties, people, agreements, invoices, reports, and tenant-portal administration. The gate checks document title, language, main landmark, heading hierarchy, duplicate IDs, image alternatives, native control names, browser runtime exceptions, console errors, and unnamed interactive nodes in Chrome's accessibility tree.

The mobile route set covers the people, agreements, and invoice registers at a 390 × 844 viewport. It records screenshots and rejects page or table-container overflow.

## Firefox and WebKit gate

`bun run gate:cross-browser` uses a temporary Playwright 1.61.1 installation supplied by the CI job or operator. The application itself does not depend on Playwright.

For Firefox and WebKit, the gate verifies:

- owner structured-form rejection and value preservation;
- invalid-field focus;
- focus containment inside a modal;
- Escape close and focus return to the invoking button;
- property-scoped staff access to allowed routes;
- denial and navigation omission for billing and settings;
- tenant invoice visibility;
- tenant profile persistence;
- mobile overflow and screenshots;
- browser console and page exceptions.

## Run locally

Build the exact commit first:

```bash
bun install --frozen-lockfile
bun run build
NIVASA_BROWSER_BIN=/path/to/google-chrome bun run gate:browser
npm install --no-save --package-lock=false playwright@1.61.1
bun run gate:cross-browser
```

Generated evidence is written to:

```text
artifacts/browser/
artifacts/cross-browser/
```

These directories are ignored by Git. Retain the reports and screenshots with release evidence.

## CircleCI

The Chrome job uses a pinned browser-tools orb, browser image, Chrome version, and Bun 1.3.0. The cross-browser job uses the pinned Playwright 1.61.1 Noble image and installs the matching Playwright package temporarily because the official browser image supplies browsers and operating-system dependencies rather than the project package.

Both jobs run only after the repository release gate succeeds on `main` and publish their evidence directories as artifacts. Missing or failed jobs are not browser certification.

## Manual evidence boundary

Automated desktop emulation is not physical-device or screen-reader certification. Complete the matrix in [Accessibility and physical-device certification](ACCESSIBILITY_CERTIFICATION.md), retain redacted evidence for the exact commit, and validate it with `bun run certify:device`.

Deployment-specific acceptance must still cover the real reverse proxy, fonts, white-label assets, supported assistive technology, physical touch devices, virtual keyboards, safe-area insets, zoom, larger text, long localized content, and actual staff permission assignments.
