# Native Windows Build and workflow interpreter

November 5, 2026. This increment extends the existing Build action, typed record
writer and packaged Foundry driver. The emerald UI layout, native sessions/tabs,
permissions, skill pack, schema and automatic-quality-repair setting are preserved.
It follows native storage checkpoint `ddf78cede92be1b6838f0b8ebd41b12dd5850267`.

## Workspace binding

Windows Build requires an existing, canonical, drive-absolute directory on a fixed
local disk. POSIX, relative, UNC, missing and junction/reparse bindings are refused.
The existing Windows handle guard holds the workspace ancestors while the writer
is active. Linux admission retains its original behavior. No project is relocated,
no owner store is migrated and no previously approved PRD is silently replaced.

## Interpreter selection

`AMIRAHCO_PYTHON`, if set, must name one absolute native Python executable, without
shell flags. Otherwise the driver prefers an app-local `vendor/python/python.exe`
(Windows) or `vendor/python/bin/python3` (Linux), then discovers a host Python or
Windows Python launcher. This increment defines and packages the optional app-local
location; it does not download or bundle a Python distribution.

The resolver probes in isolated UTF-8 mode (`-I -X utf8`), checks Python 3.11+,
imports standard-library sqlite3, verifies the host platform and resolves the actual
executable returned by a launcher. Windows Store aliases, relative PATH entries and
the current working directory are excluded from discovery. An explicitly selected
or staged app-local interpreter that fails validation holds the build; it does not
silently switch interpreters. The probe has a five-second timeout and bounded output.

Workflow effects use that resolved executable with an argument array, without a
shell or WSL translation. Native handoff instructions quote every argument for
PowerShell on Windows or the POSIX shell on Linux and identify the actual Python.
The existing Windows launcher still uses WSL; replacing it belongs to the later
native launch/installer qualification, not this platform-boundary increment.

## Recovery and control

The existing Build action saves the activation first. Interpreter unavailability
holds that activation without creating another project/run or replaying native
work. Binding rereads current app records before issuing the effect. The native
handoff rechecks live Stop/current PRD before admission and after the admission
reply; stopped or changed projects do not dispatch native work. A reopened admitted
run remains at its current obligation instead of creating another run or admission.
Final native tool permissions remain authoritative.

Three Foundry compatibility readers now close their SQLite connections explicitly,
using the core runtime's existing `closing` pattern. Windows contract tests exposed
file locks in board reads and route recovery before this fix. No Foundry schema,
claim, event, replay or outbox policy changed.

## Receiving evidence

The full Windows receiving suite passes **45 tests, zero exclusions/skips**. The
previously excluded native artifact and prepared-result cases now execute unchanged
behavior assertions on Windows. Escape-path fixtures use a directory junction on
Windows, preserving the outside-workspace rejection without requiring file-symlink
privileges. The PRD fixture supplies only fields allowed for each operation.

Coverage includes actual Windows Node/Python, spaces/apostrophes/metacharacters,
invalid interpreter holds, binding/admission, original run reopening, Stop/resume,
stale requirements, interrupted saves and bounded SQLite FULL. Python Foundry
contracts, Linux regressions, UI/skills/permission checks, TypeScript and the compiled
CLI/SDK gates are recorded in `windows-build-increment-2-receipt.json`.

Run `bun run test:intake-storage` on the target OS. The runner compiles the owning
record API, copies the existing packaged workflow into its disposable package
layout, and runs native Node tests. On this development host the entrypoint was
compiled with pinned WSL Bun and executed using actual Windows Node, with
`AMIRAHCO_INTAKE_TEST_MODULE` set to its file URL, `NODE_PATH` pointing to the source
node_modules, and NODE_ENV=test. No live owner database or provider call was used.
Manual database inspection remains through AODB and each owning API/notes file.

## Remaining qualification and reversal

These are native Build/record/interpreter boundary tests, not physical owner UI
acceptance or a real-provider Windows project run. A clean-machine installer,
Python distribution delivery, update/rollback, the native launcher/desktop shortcut
and the previously documented Koffi install-script gate remain open. Other Windows
architectures and physical power-loss are unqualified. No automatic quality repair
was implemented or enabled.

Reversal: rebuild the preceding source checkpoint while retaining every store,
workspace and session. It can reopen native Windows records but cannot activate
new Windows workspaces. Do not reset, delete, replay prompts or implicitly migrate
state to reverse this code selection.
