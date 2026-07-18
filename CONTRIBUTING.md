# Contributing

1. Open an issue describing the problem, feature or extension.
2. Create a focused branch.
3. Run `bun run hooks:install` once after cloning.
4. Keep migrations backward compatible and property-scope every query.
5. Never commit `.env`, credentials, private keys, databases, uploads or backup archives.
6. Run `bun run verify:secrets` before committing.
7. Run `bun run gate` before submitting a pull request or publishing a branch.
8. Include screenshots for UI changes and explain security-sensitive behavior.
9. Document any optional third-party integration, its cost implications and every required environment variable.

The local gate and repository Git hooks are the source of truth. Contributions must not require GitHub Actions, a paid SaaS account or private infrastructure to validate the core project.

By contributing, you agree that your contribution is licensed under the MIT License.
