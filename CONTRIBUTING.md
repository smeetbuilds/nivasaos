# Contributing

1. Use the appropriate issue template to describe a reproducible bug, scoped feature or extension.
2. Create a focused branch from the current default branch.
3. Run `bun run hooks:install` once after cloning.
4. Keep migrations backward compatible and preserve existing data.
5. Treat every route read, visible action, row action and Server Action as a permission boundary.
6. Property-owned data must use the matching property-scoped permission, not only role or assignment checks.
7. Never commit `.env`, credentials, private keys, databases, uploads or backup archives.
8. Run `bun run verify:secrets` before committing.
9. Run `bun run gate` before submitting a pull request or publishing a release branch.
10. Run `bun run gate:container` when Docker, Compose, Caddy, storage or startup behaviour changes.
11. Include screenshots for UI changes and explain security-sensitive behaviour.
12. Document every optional third-party integration, required environment variable, credential, provider fee and operational dependency.

## Pull-request evidence

Include:

- the problem and root cause;
- the permission and data scope affected;
- migration or schema impact;
- commands executed;
- relevant gate output;
- manual browser checks;
- rollback considerations.

Do not claim a test passed unless it was actually executed.

## Verification model

The repository gate and Git hooks are the source of truth.

The optional CircleCI configuration runs `bun run gate` and provides public evidence, but contributions must remain verifiable without a paid SaaS account or private infrastructure.

By contributing, you agree that your contribution is licensed under the MIT License.
