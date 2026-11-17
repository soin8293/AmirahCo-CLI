# Windows terminal window branding

The desktop shortcut retains the original green-on-black app icon. The running
AmirahCo window uses the white logo on emerald for its small and large Windows
window icons. The tab/profile icon and the host window icon are separate surfaces.

## Launch behavior

With the AmirahCo Windows Terminal profile configured, a plain interactive CMD
launch opens a dedicated window. The bootstrap identifies it by a unique initial
title, verifies the Terminal process, applies the packaged icon through Windows'
WM_SETICON and checks both icons through WM_GETICON before starting the existing
native launcher. It keeps icon handles alive while the CLI runs and preserves
native title changes. Other windows and existing sessions are left alone.

A bootstrap marker prevents recursion; the profile ID alone is insufficient because
an older window may still be unbranded. Provider and state environment overrides
are forwarded unchanged using Terminal's native --inheritEnvironment option.
Arguments, redirected input/output and CI retain their existing in-place behavior.
Missing Terminal/profile/assets fall back to the native launcher. Branding failures
are reported, and uncertain Terminal handoffs do not start a duplicate session.
The launcher does not modify the default Terminal profile.

## Verify

Run the focused tests:

```powershell
node --test bin/windows-terminal-profile.test.mjs
```

For the opt-in live Windows test, set AMIRAHCO_WINDOW_ICON_TEST_ROOT to an existing
fixture directory, then run node --test bin/windows-terminal-profile.live.test.mjs.
It opens one visible disposable window without inference. It checks actual icon
images before and after a native title change, TTY/cwd/profile identity, and
inheritance of a harmless synthetic provider key and isolated state path. Receipts
and fixtures remain under the selected directory; the test process exits itself.

Local receiving passed five dispatch tests and the live icon/environment test.
The installer fixture passed 30 clean-install/install-over checks on the initial
candidate. The final local candidate was installed side by side, its files and
shortcut targets verified, and both actual running-app window icons matched the
expected images. Original desktop artwork, existing sessions and unfinished work
were preserved. These checks do not establish fresh-device or human visual
acceptance. Public installers and the update feed remain unchanged by this commit.

## Windows API references

- [Profile icon settings](https://learn.microsoft.com/en-us/windows/terminal/customize-settings/profile-general)
- [WM_SETICON](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-seticon)
- [WM_GETICON](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-geticon)
