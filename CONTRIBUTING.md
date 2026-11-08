# Contributing to AmirahCo CLI

Start with a focused issue for a reproducible bug or a larger proposed change. Search existing issues and pull requests before starting overlapping work. Use issues for prototype setup questions; Discussions and automated CodeRabbit review are not configured for this repository.

## Scope and preservation

Preserve the native interface, existing sessions, project records, unfinished work, permission checks, Stop/recovery behavior and provider limits. Reuse existing native commands and components before adding another layer. Do not reset user state to simplify a fix.

Discuss runtime changes, new dependencies, new Python code, provider routing changes and broad refactors before implementation. Keep changes scoped to the approved problem. Follow AGENTS.md and retain upstream notices.

## Local setup

Use the versions in `.node-version` and `.bun-version`:

```sh
bun install --frozen-lockfile
bun run build
node bin/amirahcocli
```

Source workflow execution also needs native Python 3.11+ with sqlite3. Windows package contributors should follow [the existing build recipe](packaging/windows/README.md).

## Verification

Run the narrowest meaningful checks for the behavior changed. For relevant source changes:

```sh
bun run typecheck
bun run build
bun test --max-concurrency=1 path/to/changed.test.ts
node --test tests/windows-updater.test.mjs
```

The repository contains a manual Ubuntu/Windows verification workflow. GitHub Actions is currently disabled; no automatic PR checks or third-party review service are promised. Local results do not establish another-device or live-provider acceptance. State exactly what you tested and what remains unverified. See [development](docs/DEVELOPMENT.md) for entry points and [validation](docs/VALIDATION.md) for recorded release checks.

## Pull requests

Explain the concrete problem, resulting user behavior, changed interfaces and relevant validation. Include a small reproduction or behavioral regression check when appropriate. Address maintainer feedback, preserve dirty user work and avoid unrelated rewrites or formatting churn. A code-quality suggestion does not authorize weakening security or removing requested features.

Never attach real credentials, login links, full profiles, project databases or private conversations. Use synthetic fixtures and redacted evidence. Follow [SECURITY.md](SECURITY.md) for sensitive reports and [license scope](LICENSE-SCOPE.md) for inherited code.
