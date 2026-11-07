# Native tester-key onboarding

## Registered accounts — November 6, 2026

Streaming/tool follow-up: real SSE `add(2,3)` was assembled by the native adapter
and the validated local fixture calculated 5. The result was not sent back for a
final model answer: the grant is now at 3/3 requests, 29,556 reserved units, two
provider dispatches and zero held work. The first attempt was rejected before
dispatch due to the original false tool-capability flag; that flag is now corrected
for the exact model, with other model fields retained. Original upstream caps and
pauses are restored. Same key/profile/expiry and unrelated provider still reopen;
no allowance was reset. This is fixture tool-message receiving, not full native
tool permissions or UI painting acceptance. [Scoped streaming evidence](tester-stream-tool-receipt-20261106.json).
Earlier remaining-request figures below are historical.

Real native-adapter text receiving also passes: the same approved saved key sent
one `Reply exactly READY.` request through public HTTPS to Heabsy `qwen38` and
returned READY. One wire attempt/dispatch used 18 actual provider tokens. Tester
usage is now 1 request / 8,788 reserved admission units, leaving 2 requests /
91,212 units; expiry and limits are unchanged. All upstream caps/pauses were
restored, with spent usage retained. Fresh-process reopen after inference retained
the key/profile and unrelated provider. [Live receipt and qualifications](tester-real-prompt-receipt-20261106.json).
Earlier zero-inference observations below are historical sign-in-only tests.

Approved-account receiving follow-up: real Google sign-in in Codex, native save
and fresh-process reopen pass under Windows Node 24.22.1 through actual public
HTTPS. Same key digest/profile ID, active selection, native startup profile and
unrelated fixture provider are preserved. Owner default settings were untouched.
One explicitly approved owner test grant exists; it expires November 6 at
15:06:41 MST, with 3 requests / 100,000 admission units. No inference or quota was
spent; existing router services/settings were preserved without restart. This
supersedes the earlier no-approved-account / save-reopen hold below. Physical UI,
another tester machine and provider/release qualification remain separate.

Choose **Add API key → Sign in for tester access**. Complete Google sign-in in
the browser, then return to the terminal. First sign-in requests access and shows
**pending**; it does not issue an API key. AmirahCo approves each account and its
exact allowance manually. After approval, choose **Sign in and check access**.
Fresh sign-in retrieves the same scoped key, verifies its HTTPS model catalogue
and saves/activates the existing native profile. Reopening does not grant more
allowance. Revoked access stays revoked; contact AmirahCo for review.

Google identity uses the existing Firebase project and official SDK. Google tokens
remain in memory and are not saved with native profiles. Partner provider secrets
stay on Alfafa. The limited API key is a bearer credential stored through the
existing native provider writer; encrypted client storage is not added here.
Signing out of Google does not revoke that API key. Owner revocation does.

The public gateway now requires every inference key to be bound to an approved
account. The retained paste-key menu accepts an approved account's issued key;
an older unbound operator key cannot access the public pool. Existing private
operator routes retain their previous behavior. No password/reset/email flow,
automatic quality repair or change to projects/sessions is included.

Receiving: 200 native tests / 691 assertions, typecheck and production build pass.
Real Google sign-in in Codex reached **pending** through the compiled Windows Node
24.22.1 runtime and actual public endpoint. Seven live public account/path checks,
74 backend tests, a final 35-test public-binding run and six gateway fixtures pass.
No real account is approved yet; actual approved-account save/reopen, physical UI
acceptance, separate tester-machine and provider capability/release checks remain
open. No inference was performed. Detailed operator contract and receipts are in
the project planning folder's `REGISTERED-TESTER-ACCOUNTS.md`.

Earlier observations below describe the preceding key-only increment and are
superseded where they call accounts future work or admit unbound public grants.

From the existing home menu, choose **Add API key → Enter tester access key**.
Paste the owner-issued access key and press Enter. The input is masked; the
native loading state shows verification, and Esc cancels. Verification reads
the authenticated model catalogue and does not start inference or a project.
Successful setup saves/activates the existing native provider profile named
`AmirahCo tester access`, then returns home. Other provider setup remains available
under **Connect another provider**. Existing profiles are retained.

The limited tester key uses the existing native provider store. This increment
does not add encrypted client storage. Partner provider secrets stay on Alfafa.
Registered-account setup is now available as described above.

## Qualified deployment

The packaged endpoint is
`https://amirahco-cli-testers.amirahcolorado.workers.dev/v1`.
Public HTTPS credential, route and model boundary acceptance passes. Testers need
only their owner-issued access key; no URL includes a credential. Operators can
override it with `AMIRAHCO_TESTER_BASE_URL` for a separately qualified endpoint.
Temporary Quick Tunnel URLs remain rejected.

The deployed public route is a Cloudflare Worker bound to one specific Workers
VPC Service, a separate private connector and Alfafa's loopback-only restricted
ingress. Existing router, shield and tunnel retain their current roles. The
router remains the credential, reservation and quota authority.

## Request and recovery behavior

Scoped requests bind the existing native session and serialized bounded payload
to a deterministic action hash. Identical session/payload input has the same
identity; this is not a general durable intent journal for regenerated prompts.
Output is bounded to 8192 tokens, caller cancellation is preserved and redirects
are refused. Both the native SDK path and its inner proxy transport are restricted
to one wire attempt for scoped keys. Other providers retain existing retry policy.
Uncertain server effects require inspection/reconciliation, not replay or a quota
reset. Repeated setup reuses the named native profile after an interrupted save.

## Verified November 6, 2026

- Bun 1.4.4: 189 tests pass across eight focused onboarding, keyboard, persistence,
  native startup, SDK and existing provider transport files; 656 assertions.
- `bun run typecheck` and `bun run build` pass. Installed runtime stays Node 22+.
- Worker boundary/stream/cancel fixtures: five pass under Node.
- Real Alfafa ingress accepts the scoped model catalogue, denies broad models,
  admin/MCP/Gemini/query/encoded paths and unified keys, refuses the paused pool
  and rejects the original duplicate identity. Zero provider dispatches; usage
  unchanged; private owner probe grant returned to disabled.
- Existing router/legacy container IDs and start times, shield/tunnel PIDs remain
  unchanged. Only the separate loopback ingress and connector were added.
- Real public HTTPS denies missing/invalid/non-scoped/disabled keys, path/model
  escapes and duplicate action identity. Exact scoped catalogue and paused-pool
  refusal pass with zero provider dispatches and unchanged usage.
- Actual native profile save and fresh-process reopen through HTTPS pass on
  Windows under Node 24.22.1 with compiled production build settings, and under
  Bun 1.4.4, retaining the unrelated fixture provider and native
  startup profile file. A second fixture tests real disk persistence without
  network. Owner profiles are untouched; disposable stores were removed after
  checked target validation. Save readback catches a native writer's refusal.
- Cloudflare's signed-in account shows Free as Current plan; no billing or DNS
  change was made. Worker version f8f75890-83bc-4de2-992f-42be6c1026ad.

Provider tool/SSE/fallback qualification, a separate external tester machine,
full compiled interactive UI acceptance and physical owner acceptance remain open.
Native API/keyboard fixtures are not owner acceptance or completed release proof.

Reversal: select the previous source commit and rebuild without touching stores
or sessions. Remove only the separate ingress Compose project when its connector
is not in use; do not stop the existing router/shield/tunnel or reset grants.
