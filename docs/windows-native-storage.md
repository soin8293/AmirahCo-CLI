# Native Windows project storage — increment 1

Current follow-through: [native Windows Build and interpreter support](windows-native-build.md)
now implements the later workspace/interpreter boundary and removes the two Windows
Build/result test exclusions. The storage evidence below remains the original
increment record; it does not describe the current Build implementation.

The existing IntakeStore APIs now save, reopen and edit project records on native
Windows. Intake, personalized-answer state, PRD revisions and Stop/Resume continue
through the same typed writer and schema v1 (twelve tables, twenty record kinds).
There is no replacement UI, migration, new database authority or automatic quality
repair. Linux retains its existing worker-thread and filesystem path.

## Location and host boundary

The default root is `%LOCALAPPDATA%\AmirahCo CLI\state\projects`.
An explicit Windows drive-absolute `XDG_STATE_HOME` selects
`<override>\amirahco-cli\projects`. Storage requires a local fixed NTFS volume;
UNC/network paths, reparse/junction ancestors, alternate streams, trailing aliases
and multiply-linked database files are refused. Paths containing spaces are tested.
Existing Linux stores are not copied or automatically migrated.

New private directories receive a protected owner/SYSTEM/Administrators ACL.
Existing broad or inherited root ACLs are refused without rewriting permissions
or user files. Held native directory/database handles prevent replacement while
the writer is active. Closing the writer releases them. A missing database on
reopen remains unavailable; it is never silently initialized.

Koffi **3.3.6**, pinned in the dependency and bundling contracts, calls the Windows
APIs. The helper is loaded only by the Windows writer. Install the matching runtime
dependency and architecture binary using the package manager; copying the JavaScript
bundle alone is insufficient. The tested host is Windows x64 with Node 24.22.1.
Other Windows architectures and minimum Node versions are not qualified here.

## Save and recovery

SQLite still uses DELETE journaling and synchronous EXTRA. The native helper pins
the database identity before its canonical path is opened. Publication retains
immutable snapshots, hashes, atomic hardlink/rename and authoritative readback.
Directory durability uses an actual write-capable backup-semantics directory handle
and `FlushFileBuffers`; failed flushes return errors instead of being ignored.

Windows runs the sole writer in a dedicated Node child process, so forced writer
exit also releases native handles. This is an internal helper, not another agent
session. Startup acknowledgment precedes queued requests; shutdown awaits process
close and drained IPC. Idle writer pipes are unreferenced so they cannot keep the
app open. Diagnostic causes remain bounded; an uncertain reply still returns the
existing UNKNOWN outcome and requires reconciliation of the original operation.

Stop priority, live fencing during a failed save, explicit scoped Resume and the
rule that a newer Stop defeats prepared Resume are unchanged. Process interruption
before commit retains the prior complete revision. Interruption after commit
reconciles the original operation and republishes only its exact saved projection.
This projection recovery is not automatic code-quality repair.

## Receiving evidence and reproduction

`bun run test:intake-storage` compiles the owning source and runs native Node tests.
The Windows runner uses file URLs, includes the native boundary suite and excludes
exactly two Linux-only Build/result cases; it prints that scope restriction.
On this host, the test module was compiled with the existing WSL Bun toolchain,
then executed by **Windows Node**, outside the tool sandbox's restricted token.
No owner database was used. A disposable fixture was also inspected through AODB
overview. Manual inspections must continue through AODB and owning `.agent.json`.

Windows: **37 passed**, both serial and default parallel receiving runs. Coverage
includes saves/reopen/edits, interrupted transactions, lost commit replies, original
identity reconciliation, Stop/Resume, stale writers, bounded SQLite FULL, PRD and
clarification recovery, ACL/path/identity negatives and handle release on parent exit.
Linux retains the full original 32-case receiving suite; exact final checks and
artifact hashes belong to `windows-storage-increment-1-receipt.json`.

For a separately compiled test entrypoint, set `NODE_ENV=test`,
`AMIRAHCO_INTAKE_TEST_MODULE` to its **file URL**, and `NODE_PATH` to this checkout's
`node_modules`, then run:

```powershell
node --test --test-skip-pattern '^(native record command|prepared result submissions)' tests/native-intake-storage.test.mjs tests/native-windows-storage.test.mjs
```

Process-crash and fixture storage failures are tested. Physical power-loss,
clean-machine installer/update behavior and visible native UI acceptance are not.

## Remaining Windows gates

This is storage support, not complete native Windows Build support. Workspace
admission still requires Linux/WSL and Foundry interpreter resolution still needs
qualification. The existing Windows launcher continues to use WSL. Native Build,
installer/desktop shortcut and the complete native UI journey remain separate gates.
The two excluded tests retain their assertions and still run on Linux.

Koffi declares an install script. The existing structural no-install-scripts gate
must remain enabled; zero-warning installer qualification is not claimed for this
dependency set. Resolve that packaging contract before tester distribution.

Reversal: select the preceding source checkpoint `4097feb` and rebuild, retaining
all Windows/Linux state directories. Do not reset, delete or migrate records.
That checkpoint cannot open native Windows records; return to this increment to
access them. Never bypass ACL or identity checks to force a reopen.
