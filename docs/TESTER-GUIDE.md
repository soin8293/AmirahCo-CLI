# Windows tester guide

## Install and start

1. Download the Windows x64 EXE from the release assets after the release is published. Compare its SHA-256 with `SHA256SUMS.txt` using `Get-FileHash -Algorithm SHA256`.
2. Run the installer for your Windows user. It creates Desktop and Start-menu shortcuts; WSL is not required. This prototype is unsigned. If your organization blocks unsigned applications, ask its administrator rather than weakening device security.
3. Open AmirahCo CLI. Use the native setup for a supported provider and your own API key, or connect your separately approved tester access. Project folders are not a place to store keys.
4. Start a chat, create a project, or reopen existing work. For a project, review its generated PRD before choosing Build. Approval of a PRD alone does not dispatch work.

## Optional partner evaluation access

Message the maintainer for pilot instructions. Google sign-in at [tester access](https://www.amirahco.us/ai/tester-access) creates an access request, not an automatic approval. Only an explicit owner grant provides a bounded, expiring key. Replacement requests also require manual approval and do not renew usage. The pilot can be paused or capacity-limited. Your own provider key remains a separate option, subject to that provider's charges.

Powered by [Heabsy](https://heabsy.com). [Inferbase](https://inferbase.ai) participates in the evaluation pilot. No unlimited or permanent free API entitlement is included.

## What to try

- Open a small project and test the personalized questions, PRD review and requested changes before Build.
- Try the bundled quality skills and `/simplify`, checking which actions you approve and whether the resulting code is useful.
- Save and reopen work. Use Stop, reopen the same session and explicitly resume when ready.
- Check menus, scrolling, input history, the logo/globe/info table and native agent tabs.
- Start with one agent. Native teams are experimental and explicitly enabled with `--agent-teams`; selected-team recovery and unattended completion are not universally qualified.
- Make a small requirement change and record any context the agent loses or repeats.

Use a backed-up test project with recoverable data. Review tool permissions, proposed external actions and final results. Keep your original session and unfinished work when reporting an interruption; do not replay an uncertain action just to obtain a screenshot.

## Report useful feedback safely

Include app version, Windows version/architecture, the steps taken, expected versus actual behavior and whether reopening recovered the same work. Describe which workflow or skill was involved and where you had to intervene. Share a minimal synthetic project when possible.

Do not upload API keys, bearer tokens, login links, private project content, full profiles, databases or unreviewed logs. Redact screenshots before posting. Security reports belong in the route described in [SECURITY.md](../SECURITY.md).

## Updates

The updater supports deferral and recovery, but this candidate's online feed is inactive. Do not assume automatic updates are available. Keep your project/profile data outside installed application binaries and follow each successor's release instructions.
