# Native Windows launcher

November 5, 2026. The Windows command now enters the existing Node bootstrap
without invoking WSL, bash, wslpath or a Linux provider bridge. The native emerald
UI, loading worker, heap relaunch, permissions, tabs and recovery code are reused.
No replacement terminal or automatic quality-repair loop was added.

## Entry and configuration

The portable launcher is `bin/amirahcocli.cmd`. It uses a colocated `bin/node.exe`
when present, otherwise native `node.exe` on PATH, and requires Node 22+. A missing
runtime produces an actionable error. It inherits the caller's terminal, working
directory and arguments, disables CMD delayed expansion and returns the actual
application exit code. It does not launch another desktop terminal or a server.
The normal Node bin entry applies the same Windows defaults to npm shims too.

Without an explicit OPENCLAUDE_CONFIG_DIR, native configuration uses
`%LOCALAPPDATA%\AmirahCo CLI\config`. Existing explicit configuration, provider
variables, model, Python selection, permission flags and session/resume arguments
are preserved. No API key is copied from WSL and no provider is silently selected.
A fresh native configuration follows the existing first-run theme/account setup;
existing native settings are reused. The Linux development state and sessions
remain intact and separate; they are not automatically migrated or advertised as
native Windows session history. Native project records retain their existing
`%LOCALAPPDATA%\AmirahCo CLI\state\projects` default.

A no-argument interactive launch requests the existing home questions. Resumes,
management commands and prompts do not acquire an extra home overlay. A no-argument
piped launch fails clearly; use --print for scripted input. The existing loading
bar retains its TTY/CI/local-command gates and exclusive handoff to the native UI.

The development wrapper at `../launch-amirahco-cli.cmd` now delegates directly to
`source\bin\amirahcocli.cmd`. The registered user command already points there,
so no PATH/profile change was needed. Its previous WSL wrapper is preserved as
`../launch-amirahco-cli.wsl-before-native-20261105.cmd`; the Linux .sh is unchanged.
The wrapper passes its existing owner-skills.json location explicitly. Only its
root paths are read: /mnt/<drive>/ paths are translated without running WSL;
unsupported Linux-only paths are refused instead of silently losing skills.
An explicit AMIRAHCO_SKILL_ROOTS remains authoritative. Packaged skills and their
permission boundary are unchanged. No owner-specific file is bundled in the app.

## Verification

Windows startup/launcher tests: 12 pass, one existing Linux-only controller-timeout
case skipped. They exercise the actual CMD wrapper and Node heap relaunch, spaces,
apostrophes/metacharacters, original cwd/arguments/config/status, missing Node,
compiled --version/--help, keyless/offline local inspection and safe piped refusal.
The actual CMD tests restrict PATH to native Node, without a WSL executable.
Linux startup regression: 11 pass, two Windows-only CMD cases skipped. The original
Linux bounded-controller test remains active. Native Windows Build/storage/recovery:
45 pass, no exclusions, including interrupted saves, Stop/resume and original run
reopening. Exact log and artifact hashes are in windows-launcher-increment-3-receipt.json.

A disposable native Windows PTY also rendered the emerald logo/info table and
existing first-run theme/account screens. Theme selection accepted Enter. No
account was connected and no model request was sent. Exit chords did not complete
through the terminal adapter; the exact cause is unresolved. Only that identified
test's Node processes were force-closed after validating the unique parent fixture
command. This is not graceful-exit or physical owner UI acceptance.

## Remaining qualification and reversal

No full native provider project or clean-machine installer/update test is claimed.
Python distribution delivery, the Koffi install-script packaging gate, installer,
desktop shortcut, physical scroll/history and graceful-exit acceptance remain open.
The native launcher is implemented; the installer is not. Automatic quality repairs
remain disabled.

To reverse the local command selection, restore the retained WSL wrapper without
moving or deleting either platform's configuration, projects or sessions. To reverse
the source increment, rebuild/select baseline ba42b9aac59e394179fa7981e05c59649bf08715.
Never reset state or replay a saved prompt just to switch launchers.
