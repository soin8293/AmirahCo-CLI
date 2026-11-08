# Release validation, November 7, 2026

## Current r8 receiving

| Check | Observed result |
|---|---|
| Repository protections | Secret scanning and push protection enabled by GitHub API/readback; scanner-generated synthetic-fixture alert reviewed/resolved as used in tests; open-alert readback empty; seven badge endpoints render correctly. Push-blocking challenge and scan-history completion are not claimed; see [Security](../SECURITY.md#repository-protections) |
| Clean installation with spaces | Published r8 EXE/ZIP checksums and installer contents match; 30 receiving checks pass across spaced extraction/install/profile/project/shortcut paths, both shortcut command lines, native version/help, icon bindings and install-over with an unchanged unfinished-work sentinel |
| Public GitHub release | Repository public; r8 is a published prerelease; anonymous EXE/ZIP checks pass and all six asset digests match prepared files |
| Signed production update | Feed signature, exact bytes, full ZIP size/hash and direct same-origin HTTPS verified |
| Actual installed upgrade | Packaged r7 client approved the production r8 download without early installation; actual staged-process crash followed by same-digest restart recovery and both fixture shortcut switches |
| State and branding preservation | Stopped intake reopens at question 3; database/history/work hashes match; CLI/UI and emerald icon bytes unchanged |
| Native commands | Installed r8 reports `1.0.1 (AmirahCo CLI)` and `AmirahCo CLI is up to date.` |
| Updater/signing regression suite | 18 tests passed, including the protected-key signing fixture and existing recovery cases |
| Public website preservation | All 149 prior hosted file hashes retained; no grant, router, sign-in or allowance changes included |

Run `node --test tests/windows-updater.test.mjs tests/windows-update-release.test.mjs` for the source fixtures. That suite is separate from the recorded real production-package receiving. GitHub Actions remains disabled; these are not claims of a green automated CI run.

The maintainer retains exact release receipts and private fixture paths. Public artifacts and `SHA256SUMS.txt` let you check the released file identities without exposing project stores. The installed recovery test used the same computer and isolated shortcuts, not a fresh Windows device.

Repeat the path test with `tests/windows-clean-install.ps1`, as described in the [Windows packaging guide](../packaging/windows/README.md#clean-installation-with-spaces). A separate native PTY smoke check reached the first-run theme screen and confirmed Down changes the selection in an isolated spaced profile/project directory. This does not qualify the complete authenticated project flow, physical desktop shortcut interaction or a second Windows device. No inference, allowance changes, router changes or package rebuild was needed.

## Earlier r6 source and package receiving

These are bounded source, package and fixture checks. They do not establish universally unattended project completion or owner acceptance on a separate computer.

| Check | Observed result |
|---|---|
| Isolated source dependency installation | Frozen lockfile installation passed; no blocked install script was automatically trusted |
| TypeScript | `tsc --noEmit` passed |
| CLI/SDK build | Passed, including SDK boundary/export and build guards |
| Native startup, skill pack, scoped Build guidance and teammate model contracts | 47 tests passed; 314 assertions |
| New Windows EXE extraction | Complete verified payload extracted; previous incomplete test extraction retained |
| Real installer interruption | Terminated its own fixture child during extraction before version publication; prior selection, shortcuts and saved-work bytes unchanged |
| Retry/install-over | Completed from the same interrupted state; older binaries preserved; native launcher reports 1.0.1 |
| Icon and shortcuts | Both fixture shortcuts target the quoted native launcher and approved ICO; EXE icon matches the prior qualified frame bytes |
| Saved project recovery | Same stopped intake reopened at step 3 through the existing record API; database, history fixture and unfinished-work hashes unchanged |
| Installed updater | 17 recovery tests passed against the installed r6 module; no inference or provider activation |

The installed-updater fixture run initially encountered a sandbox-only `EPERM` on a temporary atomic rename. The unchanged suite passed outside filesystem virtualization. Both results were retained; no updater guard was weakened.

An existing isolated router fixture run also reported 75 passing access-control/identity/admission/SSE tests with network disabled, no provider credentials and no production volumes. This is not a current capacity check or real partner inference test.

## Not claimed by this receiving

- Another-device installation, visible onboarding, real provider setup and delivered-project usability acceptance.
- New or renewed tester grants, an active partner pool, partner-credit availability or inference throughput.
- Authenticode signing or unlimited distribution bandwidth. The production feed and public release are now verified separately above.
- Exact selected-team, app/lead restart, channel rollover and sustained-load project completion.
- Approval of the generated repository banner or a uniform license for all inherited code.

See [release checklist](RELEASE-CHECKLIST.md), [capability boundaries](CAPABILITIES.md) and the release asset checksums.

## Documentation review

The public guides were compared with the owner's released [Workflow Creator](https://github.com/soin8293/workflow-creator), [Context Keeper](https://github.com/soin8293/context-keeper) and [memory_Db](https://github.com/soin8293/memory_Db) documentation. The comparison covered install requirements, an actual-use example, invocation details, data/recovery guidance, contributor entry points and evidence limits.

The review corrected unpublished package commands and upstream clone instructions, added a documentation index and first-project/skill/recovery/privacy/development guides, and removed stale release/feed claims. `node scripts/check-release-docs.mjs` checks local links/headings, required guide presence, bundled skill names, runtime pins and obsolete package-install commands. Its five self-checks run with `--self-test`. External provider behavior and a new live model run are outside this documentation check.
