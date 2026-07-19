# Contributing

1. Follow the project [Code of Conduct](CODE_OF_CONDUCT.md).
2. Use the appropriate issue template to describe a reproducible bug, scoped feature or extension.
3. Create a focused branch from the current default branch.
4. Run `bun run hooks:install` once after cloning.
5. Keep migrations backward compatible and preserve existing data.
6. Treat every route read, visible action, row action, file-delivery endpoint and Server Action as a permission boundary.
7. Property-owned data must use the matching property-scoped permission, not only role or assignment checks.
8. Represent monetary comparisons in integer minor units and preserve the database two-decimal scale contract.
9. Never commit `.env`, credentials, private keys, databases, uploads, backup archives or duplicated binary bundles.
10. Run `bun run verify:secrets` before committing.
11. Run `bun run audit:dependencies` when registry access is available.
12. Run `bun run gate` before submitting a pull request or publishing a release branch.
13. Run `bun run gate:container` when Docker, Compose, Caddy, storage or startup behaviour changes.
14. Include screenshots and keyboard checks for UI changes and explain security-sensitive behaviour.
15. Document every optional third-party integration, required environment variable, credential, provider fee and operational dependency.

## Pull-request evidence

Include:

- the problem and root cause;
- the permission and data scope affected;
- migration or schema impact;
- commands actually executed;
- relevant gate and dependency-audit output;
- manual browser and accessibility checks;
- rollback considerations.

Do not claim a test passed unless it was actually executed on the reported commit.

## Verification model

The repository gate and Git hooks are the offline-capable source of truth. Network-dependent advisory checks remain separate so a reproducible build does not depend on registry availability.

The optional CircleCI configuration installs the pinned graph, audits production dependencies, runs `bun run gate`, and runs `bun run gate:container` on `main`. Contributions must remain verifiable without a paid SaaS account or private infrastructure.

Source-contract verification does not replace authenticated browser, accessibility, responsive-layout, permission-matrix or production-sized recovery testing.

By contributing, you agree that your contribution is licensed under the MIT License.
