# Windows package

The reviewed native Windows x64 EXE and ZIP are staged as release assets, not Git blobs. The public candidate manifest records their exact hashes. Source builds use Node.js 22+ and Bun; no WSL is required for the Windows app.

The existing installer verifies its payload and per-file manifest, installs side by side per user, then updates Desktop/Start-menu shortcuts using the approved emerald icon. Native Node, Python and Git runtimes are bundled in the installer with their own notices. Profiles/projects live outside replaced binaries.

## Build a candidate

First build the source with the qualified versions in `.node-version` and `.bun-version`. On Windows, run:

```powershell
./packaging/windows/build.ps1 -BaseArchive 'C:\packages\AmirahCoCLI-Pilot-1.0.0-r5-Windows-x64.zip' -OutputDirectory 'C:\packages\candidate'
```

The runtime base is a separate release asset named `AmirahCoCLI-Pilot-1.0.0-r5-Windows-x64.zip`; its exact outer and payload hashes are pinned in `runtime-base.json`. It supplies the qualified native Node/Python/Git runtimes and notices. The recipe overlays the current built CLI, SDK, scripts and assets, updates the file manifest, and emits EXE/ZIP/checksums. It uses Windows PowerShell, .NET ZIP APIs and the installed .NET Framework C# compiler. It does not fetch credentials or publish anything. Packaging bytes are reproducible inputs; the EXE build itself is not claimed bit-reproducible.

The published r8 package has an active signed update channel. Preserve its public trust policy when preparing a successor; never add the production signing secret to Git or copy private machine settings into a package. Independent Windows receiving checks are required before publishing a successor.

For subsequent versions, follow the [update delivery runbook](../../docs/UPDATE-RELEASE-RUNBOOK.md). `prepare-update.mjs` inspects the actual successor ZIP, signs its identity/hash using an external Ed25519 key, and checks acceptance with the shipped verifier. It writes a new feed file locally and never publishes it.

## Clean installation with spaces

Run the receiving script in Windows PowerShell 5.1 with a release directory containing the EXE, ZIP and `SHA256SUMS.txt`, and a previously nonexistent fixture folder:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\windows-clean-install.ps1 -ReleaseDirectory 'C:\Release Packages\r8' -FixtureRoot 'C:\Test Workspaces\AmirahCo Clean Install'
```

It verifies both package checksums and matching EXE/ZIP installer contents, then exercises clean installation, the native CMD launcher, both actual shortcut commands, emerald icon bindings and install-over. Extraction, installation, project, profile and shortcut paths contain spaces. Owner shortcuts are never selected as destinations. A synthetic unfinished-work file must remain unchanged. The test writes `receiving.json` inside the fixture and preserves all files, including failed attempts. Use a new fixture for every run; do not delete existing user state to retry.

The command checks use Windows process arguments directly rather than passing nested CMD quotes through PowerShell's argument conversion. This is a same-machine fixture; it does not replace a fresh-device interactive installation or provider test.
