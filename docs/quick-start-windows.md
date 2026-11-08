# Install and run on Windows

Use the Windows x64 installer for the r8 tester release. Node.js, Git and the workflow Python runtime are bundled. You do not need WSL, Bun, a source checkout or an administrator account for the per-user installation.

## Install

1. Open the [r8 release](https://github.com/soin8293/AmirahCo-CLI/releases/tag/v1.0.1-pilot.8).
2. Download `AmirahCoCLI-Pilot-1.0.1-r8-Windows-x64.exe` and `SHA256SUMS.txt`.
3. In PowerShell, check the downloaded file:

```powershell
Get-FileHash "$env:USERPROFILE\Downloads\AmirahCoCLI-Pilot-1.0.1-r8-Windows-x64.exe" -Algorithm SHA256
```

Compare the hash with the EXE entry in `SHA256SUMS.txt`. If your download folder differs, use its actual path. If the values differ, obtain a fresh download before running it.

4. Run the EXE. Installation creates **AmirahCo CLI Pilot** shortcuts on the Desktop and in the Start menu.
5. Open either shortcut. Loading feedback appears before the native menu.

The installer is unsigned. If your organization's device policy blocks it, contact its administrator. This release does not include an ARM64 installer or qualified macOS installer.

If you prefer the ZIP, download the matching r8 ZIP, check its hash, extract the whole archive and run `install.cmd`. Keep `payload.zip` beside the installation scripts until installation finishes.

## Connect your AI access

Choose **Add API key** in the opening menu. Use your supported provider's setup, or choose **Sign in for tester access** if the maintainer has invited you to the partner pilot. In a chat, `/provider` opens provider-profile management.

Google sign-in identifies your account. Tester access still needs manual approval, an active allowance and available pool capacity. Downloading the app does not issue a key. See [tester access](native-tester-onboarding.md).

Use a model ID and endpoint from your provider. A website or chat subscription does not automatically supply an API key. Keep credentials in the native setup, outside project files and shared screenshots.

## Start a chat or project

Use the arrow keys to move the selection and Enter to choose. **New chat** opens a fresh conversation. **New project** opens guided intake and PRD review. **Session history** reopens a previous conversation; **Open saved project** returns to saved intake or PRD work.

Follow the [first-project walkthrough](FIRST-PROJECT.md) for a small coding task. Use the mouse wheel or touchpad for scrollback; up/down in the chat input recalls previous entries. In a selection menu, up/down moves the selection instead.

## Update later

Run `/update` in the app. Choose **Install update on next safe launch** or **Later**. Close your sessions normally, then reopen from the shortcut. The app preserves the current version and saved work if an update cannot finish.

Older r6 builds have no trusted update feed. Install r8 over the same per-user location once to enable it. The default binary folder is `%LOCALAPPDATA%\Programs\AmirahCo CLI`; saved project records live separately.

Use the shortcuts first. A global `amirahcocli` command is not required or promised by this installer. There is no published npm installation path for this release.

See [troubleshooting](TROUBLESHOOTING.md) and [data and privacy](DATA-AND-PRIVACY.md) before moving or removing saved files.
