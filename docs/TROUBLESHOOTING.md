# Troubleshooting and recovery

Keep the existing session, project files and saved records while diagnosing a failure. Record the last visible message and whether the action may already have happened.

## The app does not open

Use the installed Desktop or Start-menu shortcut. The Windows installer includes its own runtimes; installing Node globally or starting WSL is not a repair step for this package.

If Windows reports a missing or changed file, verify the download checksum and reinstall the same reviewed version over its original per-user location. Close sessions normally first. If the terminal window is blank or transparent, check whether a regular terminal has the same problem and include that distinction in a report. Keep loading time separate from a missing window or rendering failure.

If device policy blocks an unsigned app, contact the device administrator. Do not change system security settings to make a report disappear.

## amirahcocli is not recognized

Open the installed shortcut. The current installer does not promise a global shell command. From a source checkout, use `node bin/amirahcocli`. Do not install a similarly named package or point a shortcut at an unrelated checkout.

## AI access or personalized questions fail

Check the provider profile, endpoint and exact model with **Add API key** or `/provider`. Confirm that your provider key has access to that model and sufficient quota. Keep the last error, with credentials removed.

Saved intake answers remain available after a failed follow-up request. Use the offered continue, retry or save-and-return action. An uncertain request should not be repeatedly submitted merely to clear an error.

For partner access, sign-in and approval are separate. Pending accounts need maintainer review. Expired, exhausted, revoked or paused access needs an access/capacity review, not a new project or an assumption that retrieving the same key renews it. If a retrieval button is offered but the server reports inactive access, ask the maintainer to review the grant. See [native tester access](native-tester-onboarding.md).

## Saved work is missing or stopped

Use **Session history** for the original conversation and **Open saved project** for saved intake or PRD work. Check that you are using the same Windows user and native profile. Unsaved keystrokes are not a recovered saved answer.

For a stopped intake, choose **Resume saved intake** only when you intend to continue. Preserve the saved record if it is unavailable. Do not create an empty replacement store or copy a live SQLite file between running app instances. Read [data locations](DATA-AND-PRIVACY.md) before changing folders.

If Build waits, inspect the actual message: approval, Stop, missing context, permissions, tools and provider availability have different remedies. Reopening or sending another start message does not supply missing authority or reconcile an uncertain external action.

## An update fails or waits

Close other AmirahCo CLI sessions normally, check free space and connectivity, then review `/update` again. A download or installation resumes the same signed update identity; it does not need a new project or conversation.

Older r6 packages need one manual r8 install-over because their update trust is unconfigured. Retained binaries do not authorize a downgrade of project state. Keep `.updates` recovery metadata intact; do not delete a lock because it looks old. See [Windows updates](windows-updates.md).

## Remove the app while keeping work

Close the app normally. The installer uses version folders under `%LOCALAPPDATA%\Programs\AmirahCo CLI` and its Desktop/Start-menu shortcuts. Keep your project folders, native profiles and `%LOCALAPPDATA%\AmirahCo CLI\state\projects` when removing application binaries. Review custom state paths before removing anything.

## Report a problem

Open a [bug report](https://github.com/soin8293/AmirahCo-CLI/issues/new/choose) with the app version, Windows architecture/version, installation method, steps, expected result, actual message and what reopening recovered. Use a small synthetic example. Keep provider credentials, login URLs, private code, database files and unreviewed logs out of public reports. Use [SECURITY.md](../SECURITY.md) for sensitive reports.
