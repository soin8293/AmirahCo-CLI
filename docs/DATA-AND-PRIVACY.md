# Data, credentials and network access

The app uses your selected model provider and the tools you authorize. Model requests can include your prompt, relevant project context, file excerpts and tool results. Review those providers and tool destinations before using sensitive material.

## Saved files

Default Windows locations are:

| Data | Location or owner |
|---|---|
| Installed version folders and bundled runtimes | `%LOCALAPPDATA%\Programs\AmirahCo CLI` |
| Guided intake, PRD revisions and project records | `%LOCALAPPDATA%\AmirahCo CLI\state\projects` |
| Native configuration and conversation history | Native profile directory, normally `~/.openclaude` |
| Native global configuration | Normally `~/.openclaude.json`, with existing compatibility rules |
| Files the agent creates or edits | The project workspace you select |
| Update intent, downloads and version selection | `.updates` beside the installed version folders |

Compatibility names in profile paths are retained to preserve existing state. `OPENCLAUDE_CONFIG_DIR`, `CLAUDE_CONFIG_DIR` and `XDG_STATE_HOME` can change locations; those overrides do not all select the same store. See [`.env.example`](../.env.example), [native path resolution](../src/utils/envUtils.ts) and the [project storage reference](windows-native-storage.md). Do not move a live project database into a synchronized or network directory.

Back up your project files and resolved profile/state folders after closing the app and its writers normally. A copied live database is not a qualified backup. The binary updater does not copy or roll back project databases, credentials or Stop state.

## Credentials and partner access

Use **Add API key** or `/provider` for native setup. Keep keys out of Git, project instructions, issue reports and screenshots. Project `.env` files are not automatically loaded; an explicit `--provider-env-file` must name the private file you intend to use.

Partner sign-in uses Google to identify an account. A separate manually approved grant controls credential access, expiry and usage. Downloading or updating the client does not approve an account, replenish quota or enable paid fallback. Revocation and replacement follow the account policy; requesting another key does not grant another allowance.

The client contains the public update verification key. The private release-signing key and hosted partner/provider administration credentials are not distributed with it.

## Network and diagnostics

Provider requests go through the route you configure. Tools, MCP servers, hooks and integrations can introduce other network destinations or local access; review their configuration and native permission requests. Advanced source builds also expose optional reporting and diagnostic settings documented in [advanced setup](advanced-setup.md). Review the settings that apply to your build before enabling them.

The Windows updater checks the signed AmirahCo feed and downloads approved packages. GitHub hosts source, release notes and manual downloads. Using your browser to visit the website or sign in is separate from model traffic.

Treat conversation logs, context packets, traces, project records and tool output as potentially sensitive. Share a minimal redacted reproduction rather than a whole profile. For a security issue, use the private reporting route in [SECURITY.md](../SECURITY.md).
