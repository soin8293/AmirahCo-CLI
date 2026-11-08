# Windows launchers and optional shell use

The r8 installer creates Desktop and Start-menu shortcuts. Use those shortcuts for the supported first-run path; no global npm package or PowerShell profile helper is required.

The installer quotes the native launcher path, including spaces. Its default application folder is `%LOCALAPPDATA%\Programs\AmirahCo CLI`, with a separate folder for each release. The signed updater changes the shortcuts on a safe launch after verifying the new version.

## Use a source checkout

From the repository root:

```powershell
node .\bin\amirahcocli --version
node .\bin\amirahcocli
```

Keep the checkout and its configured runtime separate from installed version folders. Do not point an installed shortcut at another checkout to repair an update or missing command.

## When a shell command is missing

Use the installed shortcut, or the source commands above. The current installer does not promise a global `amirahcocli` alias. Installing a similarly named package does not register the published Windows app.

See [Windows setup](quick-start-windows.md), [troubleshooting](TROUBLESHOOTING.md) and [Windows updates](windows-updates.md). Historical launcher increment notes remain in [native launcher](windows-native-launcher.md).
