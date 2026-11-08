# Develop AmirahCo CLI

Read [AGENTS.md](../AGENTS.md) and [CONTRIBUTING.md](../CONTRIBUTING.md). Preserve the native UI, existing state, dirty user work, permissions and recovery protections. Reuse existing tools and components before adding another layer.

## Build the source

Use Node.js 24.22.1 and Bun 1.4.4, as pinned in [`.node-version`](../.node-version) and [`.bun-version`](../.bun-version). Source workflow execution also needs native Python 3.11 or newer with `sqlite3`. The Windows installer bundles its qualified runtimes; source setup is a separate path.

```sh
git clone https://github.com/soin8293/AmirahCo-CLI.git
cd AmirahCo-CLI
bun install --frozen-lockfile
bun run build
node bin/amirahcocli --version
```

The last command prints `1.0.1 (AmirahCo CLI)` for this source version. Run `node bin/amirahcocli` to open the native UI. Configure your own provider through the native menu or an explicitly selected private environment file. Keep production keys and real project stores outside the checkout.

## Find the owning code

| Area | Entry point |
|---|---|
| Installed launcher and update routing | [`bin/amirahcocli`](../bin/amirahcocli), [`bin/windows-updater.mjs`](../bin/windows-updater.mjs) |
| Startup questions, PRD review and Build UI | [`src/commands/start/start.tsx`](../src/commands/start/start.tsx) |
| Project record API and storage worker | [`intakeStore.ts`](../src/services/projectRecords/intakeStore.ts), [`intakeWorker.cjs`](../src/services/projectRecords/intakeWorker.cjs) |
| Workflow admission and run binding | [`foundryBridge.ts`](../src/services/projectRecords/foundryBridge.ts) |
| Core and quality skill registrations | [`src/skills/bundled/`](../src/skills/bundled/) |
| Native tasks and terminal components | [`src/tasks/`](../src/tasks/), [`src/components/`](../src/components/) |
| Provider integration ownership | [Integration guide](integrations/overview.md) |
| Installer packaging | [`packaging/windows/`](../packaging/windows/) |

App records, native sessions/tasks and Foundry coordination have separate owners. Use the existing APIs and current identifiers instead of mirroring stores or writing SQL. [Project recovery](private-prototype-recovery.md) explains original-action handling; [skills](WORKFLOWS-AND-SKILLS.md) explains the user-facing workflow. The [repo-map feature](repo-map.md) is a separate optional code-navigation tool.

## Run relevant checks

For a source change, select the tests that exercise its observable behavior. Common checks are:

```sh
bun run typecheck
bun run build
bun test --max-concurrency=1 src/skills/bundled/amirahcoQuality.test.ts
node --test tests/windows-updater.test.mjs tests/windows-update-release.test.mjs
node scripts/check-release-docs.mjs
```

The release-signing fixture uses Windows PowerShell and DPAPI and is skipped on other platforms. Updater fixtures use disposable state and local HTTP servers; they do not require partner credits. On Windows, run expensive builds serially. If a restricted execution environment prevents atomic rename or local servers, record that environment failure separately rather than weakening the recovery checks.

GitHub Actions is currently disabled. The checked-in verification workflow is manual-only; a public repository does not imply passing CI on every push. Do not report unrun checks as pass. [Validation](VALIDATION.md) distinguishes previous source/package receiving from current project acceptance.

## Package and release

Follow [Windows packaging](../packaging/windows/README.md) for the pinned runtime base and installer build. It needs the existing qualified base archive and Windows packaging tools. Do not include credentials or live project state.

Use the [update release runbook](UPDATE-RELEASE-RUNBOOK.md) for signing, monotonic release numbers, immutable downloads, same-origin transport and receiving. A source checkout containing `.git` does not self-update through the installed binary channel. Documentation edits do not require changing or replacing already published binaries.
