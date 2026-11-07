# Native intake record foundation

## Native result-record interface

The preferred lead handoff is `project-records prepare PROJECT_ID submission.json`,
then fill the prepared artifact/evidence paths, performed check methods/outcomes
and optional self-check, and call `project-records submit PROJECT_ID submission.json`.
The app supplies immutable context, criterion identities, file hashes and stable
operation/record identities. Keep the original prepared file for retries; prepare
uses no-clobber creation. Submission preflights current context, exact criteria and
workspace files, reuses already-observed artifact identities, and writes only
through `IntakeStore`. Partial commits reconcile the same derived identities.
Self-review must cover every current blocking criterion and cannot supply owner
review or acceptance. These are evidence declarations with exact source files;
neither an authored outcome nor a saved receipt independently proves the check ran.

`amirahcocli project-records read PROJECT_ID` and `completion PROJECT_ID` use the
existing Linux-local owning writer. `record PROJECT_ID INPUT.json` validates the
existing `projectRecordContract.ts` schema, current activated lead/session and
controls, and actual artifact bytes inside the bound workspace (including symlink
resolution). Keep the same operation UUID and exact input for an interrupted reply;
never generate a replacement operation merely to retry. No schema, table, or kind
is added. The command runs locally without requiring a working model provider.

`expectedSequence` comes from the current `read` response's `sequence` (the saved
intake revision). An operation's returned `operation.sequence` is its commit
receipt; it does not replace that intake revision. Different mutations need
different operation UUIDs. Do not pipe mutation commands through `tail` or other
commands that mask their exit status. A rejected CAS request is not a saved record.

The agent interface refuses acceptance, owner/independent review and requirement
changes. An agent may save self-check evidence; it cannot promote that evidence to
owner approval. `completion` reports remaining evidence and acceptance blockers;
it is not a command to mark work done. Foundry remains a separate authority and its
run/claim/outbox inspection uses the packaged workflow runner.
`project-records verify PROJECT_ID` runs the existing integrated evaluator across
both owning APIs, including current Foundry state and coordination blockers.

## Current PRD review increment

The same writer now supports `IntakeStore.prd` / `NativeIntakeSession.prd`: durable generation intent, validated candidate plan/requirements/criteria, natural-language revision requests and exact current meaning/revision approval. `PRD.md` and immutable `PRD.<commit-sequence>.md` project the committed plan; the current alias changes under a current-head write transaction and unknown manual bytes are preserved. Approval requires current saved inputs, complete publication, no material gaps/newer request and current unstopped control. It creates no activation or Build dispatch. SQLite schemas/tables/kinds remain unchanged.

The native review uses the existing configured model with no tools, at most one outbound admission per explicit request, 32 KiB complete input, 4,096 output tokens and a 180-second deadline. Drafts are capped at 64 KiB, twelve requirements and four criteria each; over-limit/invalid output fails without truncation or automatic regeneration. Existing immutable owner answers remain distinct from model proposals and owner revision text. Interrupted local saves retry their original operation/candidate. Reopen never replays an unresolved model request. An explicit new generation after reopen retains the unfinished owner revision instructions; already-applied instructions are not resubmitted as new requests. Their original immutable request/source links and ordered text remain in every later proposal, review and Markdown. Existing early review plans derive this history from their links without a migration. History is capped at 32 changes / 16 KiB, within the complete 32 KiB prompt budget; over-limit input is held without omission.

Earlier sections below describe the first intake-only implementation. New stores' adjacent AODB notes list the expanded owning API; older notes may retain their historical operation list, while their no-direct-SQL-write policy still names this same owning class. No old database or owner notes are silently migrated. This is a review-only subset, not full core-pack, authenticated native admission, cross-session execution fencing or whole-product qualification.

The `/start` wizard uses `IntakeStore` through `NativeIntakeSession`. The existing REPL, WizardProvider, TextInput, Select, scrolling header and native agent tabs remain the UI. Save completion uses the existing native reconciler to commit the next step and its keyboard handlers together.

The built CLI runs `intakeWorker.cjs` as embedded text in a Node worker; `node:sqlite` stays off the terminal thread. There is no Bun/Python database fallback or new package. This increment is qualified for the Linux/WSL dev runtime only. Normal state is `$XDG_STATE_HOME/amirahco-cli/projects/<UUID>` or `~/.local/state/amirahco-cli/projects/<UUID>`, independent from the code workspace, planned build folder and native history/config.

Each private project has schema 1's twelve STRICT tables, immutable origin records, prepared bound SQL, expected-head checks and original operation fingerprints. The sole public mutation surface accepts only intake answers, exact navigation phase, Stop, explicit Resume and current saved-input confirmation. Other PRD/ledger/review/activation kinds have no write API in this increment. It is not a complete implementation of all twenty record kinds or a full Q01/Q04 qualification.

Answers commit on Enter; agent count and context confirmation also commit before continuing. An unsubmitted field is still volatile. Ctrl+Q closes the live intake gate immediately, independently of saving, and persists Stop against the last saved answers. It never claims that unsubmitted text was recovered. Continue/Open use the same ID and expose one actual continue/resume choice; no newest-folder inference. Unknown or missing stores do not initialize. Ctrl+R reconciles the original failed save; an exited worker must actually exit before replacement. A save cannot clear Stop, and a newer Stop defeats a pending Resume. The REPL entry guard holds project prompts while this process's bound intake is stopped/uncertain. Full cross-session provider/retry/tool/worker fencing remains later work.

`INTAKE.<snapshot-sequence>.md` is a private saved-intake projection, explicitly not an approved PRD. Its exact bytes and publication intent commit together; pending receipt registration precedes an atomic no-clobber hard-link publication and directory flush, then verified readback. Each snapshot has its own immutable path, so an older publisher cannot overwrite a newer view. Manual changes conflict and remain intact. Completed/unknown staging files are retained for later governed cleanup; no deletion/retention engine is enabled here. SQLite is canonical; no separately editable JSON project database is introduced. Adjacent AODB notes deny direct SQL writes and name the owning API.

Run `bun run test:intake-storage` for actual Node/SQLite worker tests. Fault hooks exist only in explicitly compiled test fixtures. The tests terminate a worker before/after commit, interrupt projection/receipt stages and constrain a small fixture database with SQLite max_page_count to produce FULL; they do not fill a system volume. Mounted native UI tests use an explicitly labeled UI-only fixture; they are separate from actual storage and compiled CLI checks. Run the targeted native presentation/history tests and build guards as recorded in the parent project. Physical owner/device and complete end-to-end product acceptance remain separate.

Personalized intake extends this same writer with optional validated clarification JSON, step 12, and the fixed `intake_clarification` head of kind `context_packet`. Model questions are proposals; owner responses remain distinguished from application observations. Application-origin result saves cannot create projects, alter control, overwrite raw owner fields, invent responses or attach to different input facts. No table/kind/schema migration or general PRD writer was added.

Question requests reuse native `queryWithModel` with no tools/agents, a 32 KiB complete-input limit, 2,048 output tokens, a 180-second deadline and at most one outbound admission per selected request. The local request intent and received batch/answers persist before progression. Stop aborts immediately; late output is discarded, and unresolved requests are not silently replayed on reopen. Storage retry reuses its original result candidate without regenerating questions. Ordinary context-only intake still sends no model request.
