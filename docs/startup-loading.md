# Startup loading feedback

The existing executable shows an emerald indeterminate bar with elapsed time
before importing the main application. It is display-only: it creates no agent,
session, project, permission or inference request. The small Node worker remains
responsive while the main thread parses the application. It never hides the
terminal cursor or replaces stream/signal controls.

The CLI entrypoint awaits `finishStartupLoading()` before provider startup output
and the native banner. Shutdown waits for the display worker to exit, clears its
line and emits any deferred connection notice. No worker frames may follow this
handoff. The accepted logo/globe/table and existing React/Ink UI remain unchanged.

CI, redirected streams, print and local management commands do not animate. Literal
arguments after `--` and values such as `--system-prompt "--print"` are not flags.
Unknown option shapes suppress animation and leave execution to the native parser.
`AMIRAHCO_STARTUP_PROGRESS=0` disables just this display. Older bundles without the
handoff marker remain usable without an overlay.

The private local launcher may supply `AMIRAHCO_ROUTER_BRIDGE`. Only for its exact
loopback `31416` route, bootstrap reuses an existing listener or runs that existing
transport controller with a five-second bound, after loading feedback starts. It
never starts another router or changes provider/model/payer configuration. A failed
preparation produces a nonfatal notice; local menus remain usable. Other routes
and local inspection commands do not run this preparation.

Focused checks:

```sh
node --test bin/startup-loading.test.mjs bin/startup-connection.test.mjs
bun test src/utils/startupLoading.test.ts src/entrypoints/cli.test.ts
```

The outer workspace's `work/launch-reliability-20261102/` contains the real PTY,
Windows argument and shell-fixture receiving checks. Their real startup record
distinguishes bar visibility, animation, native artwork handoff and menu readiness.
Backend output cannot certify the user's terminal pane is visually painted.
