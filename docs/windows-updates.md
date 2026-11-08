# Windows updates

## Update delivery status — November 7, 2026

The r8 Windows installer now contains the public signing key and active production feed. The signed ZIP and checksums are served directly from `https://www.amirahco.us/cli-updates/`; the [maintainer runbook](UPDATE-RELEASE-RUNBOOK.md) defines subsequent releases and key custody. All 18 release-signing/updater tests pass. Older r6 builds without trust still require one manual r8 install-over. Real HTTPS signature/hash/size checks passed, with all 149 existing website file hashes preserved. Separate-device physical acceptance remains a gate; the historical r5 receiving notes below remain retained evidence.

Actual installed r7 → r8 production receiving also passed: download/approval, real staged-process interruption, original-digest restart recovery, both isolated shortcut switches, native version/current-feed checks and unchanged stopped intake/history/work. The CLI/UI bundle and emerald icon remain byte-identical. This used fixture-only installation and profile paths, without inference or router/grant changes.

## Historical r5 receiving — native update flow packaged

November 7, 2026. The new unpublished r5 EXE/ZIP include the native update picker, verified download/approval and next-safe-launch recovery flow. The emerald installer/shortcut icon and existing native Matrix Elric, logo, globe, information table, scrolling/history, tabs and recovery UI remain. Current artifacts: AmirahCoCLI-Pilot-1.0.0-r5-Windows-x64.exe, matching ZIP and SHA256SUMS-r5.txt under releases/windows-pilot-20261106. r1–r4 remain preserved; r4 is now historical.

Receiving passed: actual r4-to-r5 fixture installation; deliberate termination during extraction followed by successful retry; old version and shortcut hashes unchanged until commit; both final emerald shortcut/icon bindings; installed native version/update command; 17 recovery cases run against the installed updater module; exact manifest/source identities. All 10,641 prior payload paths remain, with four updater additions and four expected changed files. The stopped native intake reopens at the same question with unchanged answers and database bytes; the explicitly synthetic history fixture and unfinished work file also retain their bytes. The mutation acknowledgement was kept separate from the durable reopened snapshot.

The initial receiving attempt exposed an inherited PowerShell 7 module path in a Node-launched Windows PowerShell child. It held at hash verification before extraction. The corrected r5 bootstrap and updater use child-local built-in module paths; hash checks remain. The regression, remedy and retained initial candidate are recorded in AC-CLI-046 and evidence/r5-initial-receiving. Unchanged native UI evidence (38 tests / 507 assertions) remains applicable; the remedy build passes CLI/SDK guards without a UI rewrite.

No publication, route activation, provider request, allowance renewal, automatic repair or owner-session restart occurred. The installer is unsigned and its live update feed/production keys remain unconfigured. Local fixture receiving does not qualify a complete production HTTPS signed-package rollout, fresh-device UI/reopen acceptance, unusually deep paths or automatic full-UI rollback. Those remain release gates.

[r5 receiving receipt](../../../../../releases/windows-pilot-20261106/evidence/installer-r5-receiving.json). The authoritative receipt is releases/windows-pilot-20261106/evidence/installer-r5-receiving.json. This packaging increment does not rewrite frozen baseline v1 or close unrelated AMR/Done/Q gates.

Status: implemented locally, unpublished. The native CLI and SDK build include the new flow. The retained r4 EXE/ZIP are unchanged historical candidates and do not contain this increment. No feed, signing identity or public download has been activated.

## User flow

- `amirahcocli update` checks the AmirahCo release channel. It never installs or delegates to npm, a system package manager or an older distribution service.
- `/update` opens the existing native arrow-key selection UI. Review the version, numeric release number and notes. **Later** is the safe default. **Install update on next safe launch** downloads and verifies the package, records approval, and returns to the current session.
- Close sessions normally. A fresh no-argument Windows launch reconciles the approved update before opening the native UI. Observable live sessions hold installation. Explicit resume/print/local management invocations do not apply an update. Native session recovery, saved Stop state and unfinished project work retain their existing rules.
- Startup loading feedback remains active while installation is attempted. A failed update keeps the current version available. There is no forced restart, prompt replay, new agent, provider request, allowance renewal or automatic project repair.

The current policy has no feed or trusted keys. The command truthfully reports that the pilot channel is not ready; it does not silently use an older updater. Source checkouts containing `.git` never update themselves through this installer path.

## Release contract

`assets/update-policy.json` is bundled trust configuration: product `amirahco-cli`, channel `pilot`, platform `windows-x64`, numeric current `sequence`, supported `stateSchema`, HTTPS `feed`, and a list of `{id, publicKey}` Ed25519 public keys. Only public verification material belongs in the package. Private signing keys stay outside source, packages and Git. No project file or environment variable can redirect the feed or add a trusted key.

The HTTPS feed returns `{keyId, payload, signature}`. `payload` is base64 of the exact UTF-8 JSON bytes; `signature` is base64 Ed25519 signature over those bytes. The verified payload contains:

```json
{
  "product": "amirahco-cli",
  "channel": "pilot",
  "platform": "windows-x64",
  "sequence": 6,
  "version": "1.0.1",
  "directory": "1.0.1-pilot.6",
  "stateSchema": 1,
  "url": "https://YOUR_APPROVED_RELEASE_ORIGIN/package.zip",
  "sha256": "64 lowercase hexadecimal characters",
  "bytes": 123456,
  "unpackedBytes": 654321,
  "notes": "Changes users can expect.",
  "expiresAt": "2030-01-01T00:00:00.000Z"
}
```

This is a format example, not a configured endpoint or a valid signed release. The package URL must share the feed's origin; redirects, credentials in URLs, incompatible schemas/platforms, expired new offers, stale sequences, conflicting content at a sequence, unknown keys and invalid signatures are rejected. Runtime version and installer directory are separate, explicit fields. Numeric sequence orders revisions even when two packages display the same runtime version.

The ZIP uses the existing pilot package layout: exactly `payload.zip`, `install.ps1`, `install.cmd`, `README.txt`. Its signed hash/size bind the whole archive. The receiving installer must accept explicit InstallRoot/DesktopPath/StartMenuPath/ReceiptPath and return the existing installed receipt. The new app's policy must match the approved product, channel, platform, sequence and state schema, preserve the feed, and retain a trusted verification key. This first increment does not change the state schema or move profiles.

Automatic checks run outside the model loop, with a five-second metadata timeout, five-minute cache/retry suppression shared across launches and a 30-minute in-session interval. Explicit review bypasses that cache. Metadata is bounded to 100 KB, signed payload text to 64 KB, archive download to its signed size (maximum 600 MiB) and declared unpacked size to 3 GiB. File hashing streams rather than loading the package into memory. Admission reserves declared compressed/unpacked space plus 64 MiB; actual filesystem failures still hold safely.

## Recovery and ownership

The app-owned `.updates` directory sits beside version folders, separate from native profiles and project stores. It contains the highest observed signed head, one current intent, digest-named download directories, an installation selection receipt and process leases. The manifest digest is the action identity across retries; no new prompt/task/credit identity is created.

The journal progresses through `offered → downloading → ready → approved → installing → installed`. Downloading or ready without durable approval cannot install. Partial downloads are not executable and a retry reuses the original offer. Admission and installation share one writer lock. A dead writer can be reconciled; a live/reused PID, unreadable lock or unknown recovery state holds rather than guessing ownership. Never clear a lock merely because it is old.

Windows process inspection supplements leases for older Node-based installations. If process visibility is unavailable, application of the update holds. This is not proof that every possible detached external tool has stopped; native recovery remains responsible for its uncertain effects. The updater does not edit project records or restore old control data.

Installation has two passes. Stage invokes the existing installer with preview shortcut destinations, validates the installed policy and performs the new native `--version` check. Commit reuses the same installation and points the real shortcuts at it, then commits the signed selection receipt. A crash between shortcut changes or receipt writes reconciles the same action; the old version remains on disk. If a version check fails before commit, the old selection remains in place. An approval valid when captured remains recoverable after offer expiry; this does not authorize a fresh expired offer or a downgrade. Selection of a previously installed signed version remains usable after its offer expires or a newer offer appears.

The bootstrap honors a committed selection without replaying a conversation. No live SQLite file is copied, no schema migration is performed, and no Stop, requirement change or credential state is rolled back. There is no automatic downgrade after a later UI/runtime fault. Retained binaries and existing native recovery provide an operator fallback subject to state compatibility.

## Verification and remaining gates

Local receiving covers 16 signature/download/storage/session/crash/cache cases; actual process termination is used at download, ready, installation, staged files, shortcut commit and selection boundaries. Native tests cover the arrow picker, explicit approval/Later, legacy routing and retained startup/artwork/Stop/save behavior. A small real PowerShell adapter fixture verifies extraction, preview destinations and repeated shortcut commits. That fixture is not a production-package or fresh-device update test.

The CLI/SDK build and TypeScript check are separate recorded checks. Receipts live in the existing Windows release evidence directory. The existing r4 installers, owner Desktop/Start menu, profiles, open test session, router and partner grants remain unchanged.

Before enabling distribution: choose and provision the approved origin and signing identity, package the updater with matching policy, qualify the complete signed production ZIP and both real shortcut destinations on another Windows device, and obtain physical native UI/reopen acceptance. Windows Authenticode signing, unusually deep installation paths and a full UI health/rollback exercise remain separate release gates. This increment does not publish, deploy or enable them.
