# Private prototype recovery

Use the native AMIRAHCO CLI project picker first. Reopen the saved project; never create a replacement project, prompt, task, UUID, agent or paid allowance merely because a reply was lost.

## Activation or admission interruption

Choose the existing saved project and **Continue this build**. The app verifies the current approved PRD and activation, reopens the activation ID as the Foundry run ID, validates the immutable start inputs and resumes the current node. An already admitted or later run is inspected rather than admitted again.

## Stop and Resume

Stop is app-owned and survives writer or app restart. Resume is explicit and cannot transfer approval to a changed PRD. Before a protected effect, the lead must re-read current app control, the Foundry frontier and the committed coordination control. If they disagree, hold the effect and reconcile; do not clear the stronger/newer Stop.

## Lost or uncertain effect

Inspect the original `action_key` and `attempt_id` through the lifecycle runner's `coordination inspect`. A `reserved` or `unknown` attempt blocks Done. Observe authoritative native/external readback, then attach that observation to the same attempt. Never generate a replacement identity to escape uncertainty.

## Agent or app restart

Inspect the existing Foundry run and frontier. Active write scopes remain exclusive until explicitly released; elapsed time does not authorize overlap. Resume or release the original claim with its fence/checkpoint. Native tasks remain the live task view and are not copied into app records.

## Channel rollover

Commit one new route head, retain old-route board events, and record each agent's adoption of the exact route/context digest. The old route drains only when `route_status` reports every roster member adopted. Late old-route messages remain readable and must be reconciled.

## Protected schedules

Reserve the occurrence identity before handoff. After restart, reopen that occurrence and attach accepted, discarded or unknown readback. Do not advance the schedule for a merely attempted or missing delivery.

## Storage pressure

Use bounded fixture limits for tests; never fill the host disk. The app continues to treat Stop as live if record persistence fails. Reject unsafe new work, quiesce the writer and reconcile the original operation from authoritative readback before freeing or moving unrelated data.

## Completion

For native result handoff use `project-records prepare PROJECT_ID submission.json`,
fill actual artifact/evidence paths and performed outcomes, then `project-records
submit PROJECT_ID submission.json`. Keep the generated context and original file.
The sole writer seals its exact intent before recording artifacts/checks/self-review.
After an interrupted reply, submit that same file; do not create new UUIDs or
silently refresh its context. Changed bytes/outcomes conflict with the original
intent and require explicit reconciliation. Missing evidence is a hold, and a
self-review cannot supply owner acceptance.

`project-records completion PROJECT_ID` reads app evidence; `project-records verify
PROJECT_ID` also checks the current Foundry/coordination owners. These are inspection
commands, never requests to mark a project done.

The assisted November 2 one-agent fixture reached Foundry `review` with seven
blocking criteria satisfied. Separate RESULT and owner ASK events have full-body
readback and observed original-effect receipts. Owner acceptance is deliberately
absent. Its native session is idle at that decision; do not renew its submitted
work claim or create a reviewer under the author's identity. A closing-code-fence
continuation bug found during this run is covered by unit and native query-loop
regressions; live physical acceptance of the rebuilt fix remains separate.

Run the integrated completion evaluator only after the Foundry run reaches `complete`. Done remains refused for stale PRD/publications, missing current artifact/check/review/acceptance records, proposed changes, waits, pending ASKs, active claims, undelivered outbox entries, uncertain attempts, unresolved schedules or incomplete route adoption.
