# Build from source on Linux or macOS

The published tester installer is Windows x64. This page is for source development. Native saved-project storage supports Linux and Windows; macOS saved intake is not qualified or enabled by the current host guard. A source checkout does not establish full platform support.

## Prepare the tools

Install Git, Node.js and Bun. Use the Node and Bun versions pinned in `.node-version` and `.bun-version`. Workflow execution also needs native Python 3.11 or newer with `sqlite3`.

## Build and open the CLI

```sh
git clone https://github.com/soin8293/AmirahCo-CLI.git
cd AmirahCo-CLI
bun install --frozen-lockfile
bun run build
node bin/amirahcocli --version
node bin/amirahcocli
```

The version command prints `1.0.1 (AmirahCo CLI)` for the current r8 source. The final command opens the native interface. Choose **Add API key** or use `/provider` to configure your own provider.

Use Linux-local storage for project records. A mounted Windows or cloud directory is not an interchangeable state store. See [development](DEVELOPMENT.md) and the [storage reference](windows-native-storage.md) before changing state roots.

The repository has no published npm package, supported AUR installation or Linux/macOS installer for this release. Source checkouts do not self-update through the Windows binary channel. To update a checkout, preserve your local work, review the upstream changes, then use your normal Git and frozen-lockfile build workflow.

For a private provider environment file, use `node bin/amirahcocli --provider-env-file /absolute/path/provider.env`. See [provider configuration](advanced-setup.md) and [`.env.example`](../.env.example). Project `.env` files are not loaded automatically.
