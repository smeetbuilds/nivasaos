# Accessibility and physical-device certification

Automated browser checks are necessary evidence, not a substitute for assistive-technology and physical-device acceptance. A release may claim manual accessibility or real-device certification only when a completed evidence manifest is retained for the exact commit.

## Automated evidence

Run and retain all generated reports and screenshots:

```bash
bun run gate:browser
bun run gate:cross-browser
```

The Chrome gate inspects Chrome's accessibility tree and runtime console. The cross-browser gate exercises Firefox and WebKit with an owner, a property-scoped staff user, and a tenant account. It covers structured rejection, preserved values, modal focus containment, Escape close, return focus, delegated route denial, tenant invoice visibility, tenant profile persistence, mobile overflow, and screenshots.

## Manual screen-reader matrix

At minimum, complete these combinations against the deployed release candidate:

- Windows with current Firefox and NVDA or JAWS;
- macOS with current Safari and VoiceOver.

Cover sign-in, primary navigation, a filtered register, opening and closing a modal, a rejected stateful form, validation announcement, an allowed delegated-staff route, a forbidden delegated-staff route, tenant portal navigation, tenant profile update, invoice reading, and sign-out.

Record whether:

- page title and landmarks are announced correctly;
- navigation exposes current-page state;
- dialog title and description are announced;
- focus enters the dialog and cannot escape it;
- Escape closes the dialog and returns focus to the trigger;
- error summary and field error are announced once and in a useful order;
- preserved values remain understandable;
- tables or mobile record cards retain meaningful labels;
- status badges are not the only source of meaning.

## Physical-device visual regression matrix

At minimum, review:

- one current Android phone in Chrome;
- one current iPhone in Safari.

Capture the same named routes and states on the baseline and release candidate. Review at 100% browser zoom and with the operating system's larger-text setting enabled. Required states include dashboard, people register, agreement register, invoice register, navigation drawer, open modal, rejected modal, tenant portal, and tenant profile.

A physical device farm is intentionally not required by core NivasaOS. CI cannot truthfully certify touch hardware, browser chrome, virtual keyboards, safe-area insets, or mobile assistive technology. These checks remain operator-executed and evidence-backed.

## Evidence manifest

Copy `docs/evidence/accessibility-device.example.json`, replace every placeholder, attach screenshots beside the manifest, and run:

```bash
bun run certify:device -- /absolute/path/to/accessibility-device.json
```

The verifier rejects incomplete, placeholder, failed, stale, or mismatched evidence. It checks the exact Git commit, required browser/assistive-technology combinations, required Android/iOS coverage, route coverage, screenshot existence, and optional SHA-256 values.

Do not commit customer data, production URLs, credentials, resident names, payment details, or unredacted screenshots. Store certification evidence in the release record or another access-controlled evidence repository.
