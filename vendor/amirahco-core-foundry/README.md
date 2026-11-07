# AmirahCo core workflow runtime

This directory ships the selected Workflow Foundry 0.2.0 runtime, unchanged, plus an AmirahCo-owned lifecycle graph and a thin evidence-checking entrypoint. It requires Python 3.11 or newer and no third-party Python packages.

The runtime saves graph state in the SQLite database supplied by the caller. Use the runner or adapter; do not edit that database directly.

```text
python scripts/foundry.py --self-test
python scripts/foundry.py compile workflows/amirahco-project-lifecycle.json
python scripts/amirahco_workflow.py compile
python scripts/amirahco_workflow.py start --db PROJECT_STATE/workflow.sqlite --run-id RUN_ID --input-json INPUT_JSON
python scripts/amirahco_workflow.py inspect --db PROJECT_STATE/workflow.sqlite --run-id RUN_ID
```

The graph and skill prompts do not grant permissions or prove app-record, native-session, provider, message-board or external effects. Missing current context, approval, activation, permission or evidence remains a hold.

`UPSTREAM-README.md` and `LICENSE` preserve the bundled runtime's own documentation and MIT notice.
