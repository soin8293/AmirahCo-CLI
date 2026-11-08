# AmirahCo CLI

[![Pilot release](https://img.shields.io/github/v/release/soin8293/AmirahCo-CLI?include_prereleases&label=pilot&color=059669)](https://github.com/soin8293/AmirahCo-CLI/releases)
[![Downloads](https://img.shields.io/github/downloads/soin8293/AmirahCo-CLI/total?color=059669)](https://github.com/soin8293/AmirahCo-CLI/releases)
[![Windows x64](https://img.shields.io/badge/Windows-x64-059669)](docs/quick-start-windows.md)
[![Documentation](https://img.shields.io/badge/docs-start_here-059669)](docs/README.md)
[![Secret scanning enabled](https://img.shields.io/badge/secret_scanning-enabled-059669)](SECURITY.md#repository-protections)
[![Push protection enabled](https://img.shields.io/badge/push_protection-enabled-059669)](SECURITY.md#repository-protections)
[![Component license notices](https://img.shields.io/badge/license-component_notices-059669)](LICENSE-SCOPE.md)

![AmirahCo CLI — AI coding and agent orchestration](assets/github/repository-hero.png)

An AI coding CLI centered on agent orchestration: plan a project, carry its context into coding, coordinate agents and check results from your terminal. Based on [OpenClaude](https://github.com/Gitlawb/openclaude), with an emerald interface and bundled project-planning and code-quality skills.

**Release status:** Public Windows tester prototype, [r8 prerelease](https://github.com/soin8293/AmirahCo-CLI/releases/tag/v1.0.1-pilot.8). Bring your own supported provider API key. Optional partner-backed evaluation access is limited and manually approved; no unlimited credits or guaranteed hands-free completion are offered.

[Get started](docs/quick-start-windows.md) · [Documentation](docs/README.md) · [Skills and workflows](docs/WORKFLOWS-AND-SKILLS.md) · [Report a bug](https://github.com/soin8293/AmirahCo-CLI/issues/new/choose)

## Windows

Download the [Windows x64 installer EXE](https://github.com/soin8293/AmirahCo-CLI/releases/download/v1.0.1-pilot.8/AmirahCoCLI-Pilot-1.0.1-r8-Windows-x64.exe) or [ZIP](https://github.com/soin8293/AmirahCo-CLI/releases/download/v1.0.1-pilot.8/AmirahCoCLI-Pilot-1.0.1-r8-Windows-x64.zip), and verify it against [SHA256SUMS.txt](https://github.com/soin8293/AmirahCo-CLI/releases/download/v1.0.1-pilot.8/SHA256SUMS.txt). Run the EXE, or extract the ZIP and run `install.cmd`. It installs per user, creates emerald Desktop and Start-menu shortcuts and bundles its native dependencies; WSL is not required. The installer is unsigned, so Windows may show a trust warning.

Open AmirahCo CLI and configure your provider using its native setup. You may start a chat, create a project or reopen existing work. Never paste keys into project files, issues, screenshots or shared chats. Your provider's quota, terms and billing apply.

The installer bundles Node.js, Git and the workflow Python runtime. You do not need WSL, Bun or a separate Node installation. Use the Desktop or Start-menu shortcut; a global shell command is not required. Follow the [Windows guide](docs/quick-start-windows.md) for checksum commands and first-run setup.

## Try a first project

1. Choose **Add API key**, then connect your own provider or separately approved tester access.
2. Choose **New project** and describe a small project. For example: "Build a local reading-list app with book titles, completion status and filters. No accounts, payments, email or deployment. Start with one agent."
3. Answer the questions and review the generated PRD. Request changes before approving it.
4. Choose **Build** to continue into native work. Review permissions, actual results and checks before accepting the outcome.
5. Return through **Session history** or **Open saved project**. Use **New chat** when you want a conversation without guided intake.

See the [full walkthrough](docs/FIRST-PROJECT.md), [troubleshooting](docs/TROUBLESHOOTING.md) and [data locations](docs/DATA-AND-PRIVACY.md). The goal is to reduce repeated setup and supervision; this tester release still needs your judgment on important decisions and final results.

## What's included

- Native startup menus, scrolling/history, agent tabs, session history and saved intake/PRD review.
- Six project skills for context, discovery, clarification, PRD drafting, scoped work and review.
- Three coding-quality skills adapted from Ponytail, P-Stack and the thermonuclear review, plus /simplify. Invocation uses the native Skill tool and current permissions.
- A packaged Foundry lifecycle component for reviewed project work and evidence. See [capability status](docs/CAPABILITIES.md) for the implementation and qualification boundaries.
- A signed Windows update channel with native Install/Later and next-safe-launch recovery.

For future versions, use `/update`, or install the reviewed successor over the current installation. Sessions and unfinished work are preserved. r6 and older builds without update trust need one manual r8 install-over first. See the [update delivery runbook](docs/UPDATE-RELEASE-RUNBOOK.md) for preparation, signing and recovery checks.

## Source setup

For contributor requirements, the source map and focused checks, read [development](docs/DEVELOPMENT.md). Linux source builds and macOS limitations are covered in [source setup](docs/quick-start-mac-linux.md). No npm or AUR install is published for this release.

Use the qualified native Node.js 24.22.1 and Bun 1.4.4 with the checked-in lockfile:

```sh
git clone https://github.com/soin8293/AmirahCo-CLI.git
cd AmirahCo-CLI
bun install --frozen-lockfile
bun run build
node bin/amirahcocli
```

For an explicitly selected OpenAI-compatible provider, use a private environment file based on .env.example and pass --provider-env-file. The CLI deliberately does not auto-load project .env files. Set only your provider's values. Source workflow execution additionally needs native Python 3.11+ with sqlite3; the Windows installer bundles its qualified runtime.

Experimental native teams use the supported --agent-teams opt-in or CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1. Team orchestration must respect the selected total, current permission mode, Stop, context and budgets. Native team primitives do not establish fully unattended, restart-safe completion of every project.

## Optional partner test access

The public app works with your own supported key. If you want to participate in the Heabsy/Inferbase evaluation pilot, message the maintainer for instructions. Sign-in at [tester access](https://www.amirahco.us/ai/tester-access) is separate from access approval. Pending accounts receive no key. Approval has explicit expiry, usage limits and revocation; replacement never replenishes quota. Availability depends on the approved pilot capacity.

Powered by [Heabsy](https://heabsy.com). Inferbase participates in the limited evaluation pilot. This does not promise a free personal provider account or indefinite credits.

## Development and security

Use `/skills` to inspect the bundled entries. For example: "Use amirahco-code-quality and amirahco-maintainability-review on my current diff. Report findings; do not edit." The [skill guide](docs/WORKFLOWS-AND-SKILLS.md) lists the exact native names, how `/simplify` uses them, and the boundaries between review, authorized cleanup and automatic repair.

Read the [changelog](CHANGELOG.md) and [validation record](docs/VALIDATION.md) for the current release's checks and limits. GitHub Actions is disabled; the repository does not claim automated CI passed on every push.

See [public PRD](docs/PRD.md), [security policy](SECURITY.md), [capability status](docs/CAPABILITIES.md), [Windows build](packaging/windows/README.md) and [license scope](LICENSE-SCOPE.md). Existing state and unfinished work must be preserved during fixes and upgrades. Public issues must not include credentials, private conversations or customer files.

## License and attribution

[LICENSE](LICENSE) preserves the inherited notices. [LICENSE-AMIRAHCO](LICENSE-AMIRAHCO) covers AmirahCo-owned original additions only; it does not relicense third-party or inherited code. See [license scope](LICENSE-SCOPE.md). The open-source publication disposition remains subject to those component boundaries.
