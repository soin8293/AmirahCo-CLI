# AmirahCo CLI VS Code Extension

A practical VS Code companion for AmirahCo CLI with a project-aware **Control Center**, predictable terminal launch behavior, and quick access to useful AmirahCo CLI workflows.

## Features

- **Real Control Center status** in the Activity Bar:
  - whether the configured `amirahcocli` command is installed
  - the launch command being used
  - whether the launch shim injects `CLAUDE_CODE_USE_OPENAI=1`
  - the current workspace folder
  - the launch cwd that will be used for terminal sessions
  - whether `.openclaude-profile.json` exists in the current workspace root
  - a conservative provider summary derived from the workspace profile or known environment flags
- **Project-aware launch behavior**:
  - `Launch AmirahCo CLI` launches from the active editor's workspace when possible
  - falls back to the first workspace folder when needed
  - avoids launching from an arbitrary default cwd when a project is open
- **Practical sidebar actions**:
  - Launch AmirahCo CLI
  - Launch in Workspace Root
  - Open Workspace Profile
  - Open Repository
  - Open Setup Guide
  - Open Command Palette
- **Built-in dark theme**: `AmirahCo CLI Terminal Black`
- **Microsoft Foundry / Azure OpenAI**: optional wizard and settings store endpoint, API version, deployment name, and API key (Secret Storage); launch injects `OPENAI_*` and `AZURE_OPENAI_API_VERSION` into the AmirahCo CLI terminal (see `docs/advanced-setup.md` on the repo).

## Requirements

- VS Code `1.95+`
- `amirahcocli` available in your terminal PATH (`npm install -g @amirahco/cli@latest`)

## Commands

- `AmirahCo CLI: Open Control Center`
- `AmirahCo CLI: Launch in Terminal`
- `AmirahCo CLI: Launch in Workspace Root`
- `AmirahCo CLI: Open Repository`
- `AmirahCo CLI: Open Setup Guide`
- `AmirahCo CLI: Open Workspace Profile`
- `AmirahCo CLI: New Chat` / `AmirahCo CLI: Open Chat Panel` / `AmirahCo CLI: Resume Session` / `AmirahCo CLI: Abort Generation`
- `AmirahCo CLI: Configure Azure / Foundry Chat (wizard)`
- `AmirahCo CLI: Set Azure / Foundry API Key (Secret Storage)`
- `AmirahCo CLI: Clear Azure / Foundry API Key`
- `AmirahCo CLI: Open Azure / Foundry Settings`

## Microsoft Foundry / Azure OpenAI (terminal chat)

1. Command Palette → **AmirahCo CLI: Configure Azure / Foundry Chat (wizard)** and enter endpoint, API version, deployment name, and API key; or set `openclaude.azure.*` in Settings and use **AmirahCo CLI: Set Azure / Foundry API Key**.
2. Enable **AmirahCo CLI: Azure: Enabled** (the wizard turns this on).
3. **AmirahCo CLI: Launch in Terminal** — the extension merges env vars the OpenAI shim expects (`CLAUDE_CODE_USE_OPENAI`, `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `AZURE_OPENAI_API_VERSION`, and `OPENAI_AZURE_STYLE` when forced).

If you use `.openclaude-profile.json` for the same workspace, leave Azure injection off to avoid conflicting provider configuration.

## Settings

- `openclaude.launchCommand` (default: `amirahcocli`)
- `openclaude.terminalName` (default: `AmirahCo CLI`)
- `openclaude.useOpenAIShim` (default: `false`)
- `openclaude.azure.*` — Foundry / Azure OpenAI terminal injection (see Settings UI)
- `openclaude.permissionMode` — chat permission mode

`openclaude.useOpenAIShim` only injects `CLAUDE_CODE_USE_OPENAI=1` when Azure injection did not already set it. It does not configure endpoints or keys by itself.

## Notes on Status Detection

- Provider status prefers the real workspace `.openclaude-profile.json` file when present.
- If no saved profile exists, the extension falls back to known environment flags available to the VS Code extension host.
- If the source of truth is unclear, the extension shows `unknown` instead of guessing.

## Development

From this folder:

```bash
npm run test
npm run lint
```

To package (optional):

```bash
npm run package
```

