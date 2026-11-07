"""Evidence-checking entrypoint for the bundled AmirahCo lifecycle graph."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "runtime"
GRAPH = ROOT / "workflows" / "amirahco-project-lifecycle.json"
sys.path.insert(0, str(RUNTIME))

from workflow_foundry.compiler import compile_file  # noqa: E402
from workflow_foundry.runtime import SQLiteRuntime  # noqa: E402
from workflow_foundry.protocol import ExternalAgentProtocol  # noqa: E402
from workflow_foundry.amirahco_compat import AmirahCoCompatibility  # noqa: E402


TYPE_CHECKS = {
    "string": lambda value: isinstance(value, str) and bool(value.strip()),
    "integer": lambda value: isinstance(value, int) and not isinstance(value, bool),
    "number": lambda value: isinstance(value, (int, float)) and not isinstance(value, bool),
    "boolean": lambda value: isinstance(value, bool),
    "object": lambda value: isinstance(value, dict),
    "array": lambda value: isinstance(value, list),
    "null": lambda value: value is None,
}


def object_value(raw: str | None) -> dict[str, Any]:
    value = json.loads(raw or "{}")
    if not isinstance(value, dict):
        raise ValueError("JSON input must be an object")
    return value


def emit(value: Any) -> None:
    print(json.dumps(value, indent=2, sort_keys=True, default=str))


def validate_contract(spec: dict[str, Any], node: dict[str, Any], result: dict[str, Any]) -> None:
    contract_id = node.get("output_contract")
    if not contract_id:
        return
    contract = spec.get("contracts", {}).get(contract_id, {})
    missing = [field for field in contract.get("required_fields", []) if field not in result]
    if missing:
        raise ValueError(f"{node['id']} result lacks required fields: {missing}")
    invalid = []
    for field, expected in contract.get("field_types", {}).items():
        if field in result and not TYPE_CHECKS[expected](result[field]):
            invalid.append(f"{field}:{expected}")
    if invalid:
        raise ValueError(f"{node['id']} result has invalid fields: {invalid}")


def validate_decision(node_id: str, outcome: str, result: dict[str, Any]) -> None:
    if node_id == "clarify_gate":
        if not isinstance(result.get("ambiguities"), list) or not isinstance(result.get("basis"), str):
            raise ValueError("clarify_gate requires ambiguities[] and a non-empty basis")
    elif node_id == "activation":
        if not isinstance(result.get("control_ref"), str) or not result["control_ref"].strip():
            raise ValueError("activation requires a current control_ref")
        if outcome == "true":
            for field in ("approved_prd_revision", "activation_ref"):
                if not isinstance(result.get(field), str) or not result[field].strip():
                    raise ValueError(f"activation true requires {field}")
    elif node_id == "admission":
        required = ("control_ref", "permission_state", "eligible")
        missing = [field for field in required if field not in result]
        if missing or not isinstance(result.get("eligible"), bool):
            raise ValueError("admission requires control_ref, permission_state and boolean eligible")
        if outcome == "true" and result["eligible"] is not True:
            raise ValueError("admission true requires eligible=true")
        if outcome == "false" and result["eligible"] is not False:
            raise ValueError("admission false requires eligible=false")


def validate_verdict(node_id: str, outcome: str, result: dict[str, Any]) -> None:
    if node_id == "review" and outcome in {"pass", "fail"} and result.get("verdict") != outcome:
        raise ValueError(f"review outcome {outcome} requires verdict={outcome}")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="amirahco-workflow")
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("compile")
    for name in ("inspect", "replay"):
        item = commands.add_parser(name)
        item.add_argument("--db", required=True)
        item.add_argument("--run-id", required=True)
    start = commands.add_parser("start")
    start.add_argument("--db", required=True)
    start.add_argument("--run-id", required=True)
    start.add_argument("--input-json", required=True)
    advance = commands.add_parser("advance")
    advance.add_argument("--db", required=True)
    advance.add_argument("--run-id", required=True)
    advance.add_argument("--expected-revision", required=True, type=int)
    advance.add_argument("--outcome", required=True)
    advance.add_argument("--result-json", required=True)
    approve = commands.add_parser("resume-approval")
    approve.add_argument("--db", required=True)
    approve.add_argument("--run-id", required=True)
    approve.add_argument("--expected-revision", required=True, type=int)
    approve.add_argument("--actor", required=True)
    approve.add_argument("--approval-ref", required=True)
    approve.add_argument("--prd-revision", required=True)
    bind = commands.add_parser("bind-activation")
    bind.add_argument("--db", required=True)
    bind.add_argument("--run-id", required=True)
    bind.add_argument("--input-json", required=True)
    admit = commands.add_parser("admit")
    admit.add_argument("--db", required=True)
    admit.add_argument("--run-id", required=True)
    admit.add_argument("--expected-revision", required=True, type=int)
    admit.add_argument("--control-ref", required=True)
    admit.add_argument("--permission-state", required=True)
    admit.add_argument("--native-session-id", required=True)
    admit.add_argument("--provider", required=True)
    admit.add_argument("--model", required=True)
    coordination = commands.add_parser("coordination")
    coordination.add_argument("--db", required=True)
    coordination.add_argument("--operation", required=True, choices=["append_event","read_events","reserve_attempt","observe_effect","claim_scopes","release_scopes","commit_control","reserve_schedule","resolve_schedule","adopt_route","route_status","inspect"])
    coordination.add_argument("--payload-json", required=True)
    return root


def bind_activation(runtime: SQLiteRuntime, workflow: Any, run_id: str, inputs: dict[str, Any]) -> dict[str, Any]:
    required = ("project_id", "native_session_id", "context_revision", "context_digest", "control_ref", "approved_prd_revision", "approval_ref", "activation_ref", "skill_profile")
    missing = [field for field in required if not isinstance(inputs.get(field), str) or not inputs[field].strip()]
    if missing:
        raise ValueError(f"bind-activation lacks required fields: {missing}")
    try:
        run = runtime.get_run(run_id)
        started = next(event for event in runtime.events(run_id) if event["event_type"] == "RUN_STARTED")
        if started["payload"].get("inputs") != inputs:
            raise ValueError("existing run is bound to different activation inputs")
        if run["definition_digest"] != workflow.digest:
            raise ValueError("existing run uses a different lifecycle definition")
    except StopIteration:
        raise ValueError("existing run lacks its immutable start event")
    except Exception as error:
        if "run not found" not in str(error):
            raise
        run = runtime.start_run(workflow, run_id, inputs)
    completed = {
        "context": ("success", {"project_id": inputs["project_id"], "native_session_id": inputs["native_session_id"], "context_revision": inputs["context_revision"], "control_state": inputs["control_ref"], "skill_profile": inputs["skill_profile"]}),
        "discovery": ("success", {"source_refs": [inputs["context_revision"]], "confirmed_facts": [inputs["context_digest"]], "open_questions": [], "scope_boundaries": [inputs["approved_prd_revision"]]}),
        "clarify_gate": ("false", {"ambiguities": [], "basis": "The exact owner-reviewed PRD has no material open blockers."}),
        "prd": ("success", {"prd_revision": inputs["approved_prd_revision"], "markdown_path": inputs.get("prd_path", "app-owned:PRD.md"), "record_receipt": inputs["approval_ref"], "open_blockers": []}),
        "activation": ("true", {"control_ref": inputs["control_ref"], "approved_prd_revision": inputs["approved_prd_revision"], "activation_ref": inputs["activation_ref"]}),
    }
    while run["status"] in {"ready", "waiting"} and (run["current_node"] in completed or run["current_node"] == "prd_review"):
        if run["current_node"] == "prd_review":
            run = runtime.resume_wait(run_id, "prd.approved", "current-prd", "success", run["revision"], {"actor": "owner-via-app-record", "approval_ref": inputs["approval_ref"], "prd_revision": inputs["approved_prd_revision"], "evidence": [{"kind": "approved_prd_revision", "ref": inputs["approval_ref"]}]})
            continue
        outcome, result = completed[run["current_node"]]
        node = workflow.nodes[run["current_node"]]
        validate_contract(workflow.spec, node, result)
        validate_decision(node["id"], outcome, result)
        run = runtime.complete_node(run_id, outcome, run["revision"], result)
    admitted_nodes = {"admission", "work", "review", "repair", "complete", "stopped", "blocked"}
    if run["current_node"] not in admitted_nodes:
        raise ValueError(f"activation binding ended at {run['current_node']} ({run['status']})")
    return runtime.inspect(run_id)


def main() -> None:
    args = parser().parse_args()
    workflow = compile_file(GRAPH)
    if args.command == "compile":
        emit({"valid": True, "workflow_id": workflow.spec["workflow_id"], "digest": workflow.digest})
        return
    runtime = SQLiteRuntime(args.db)
    if args.command == "coordination":
        payload, compat = object_value(args.payload_json), AmirahCoCompatibility(runtime)
        operations = {
            "append_event": lambda: compat.append_event(payload),
            "read_events": lambda: compat.read_events(payload["run_id"], payload.get("after", 0), payload.get("limit", 100)),
            "reserve_attempt": lambda: compat.reserve_effect_attempt(payload["run_id"], payload["action_key"], payload["original_action_identity"], payload["effect_kind"], payload.get("payload", {})),
            "observe_effect": lambda: compat.record_effect_observation(payload["action_key"], payload["attempt_id"], payload["state"], payload.get("observation", {})),
            "claim_scopes": lambda: compat.claim_write_scopes(payload["run_id"], payload["session_id"], payload["process_identity"], payload["scopes"]),
            "release_scopes": lambda: compat.release_write_scopes(payload["claim_id"], payload["fence_token"]),
            "commit_control": lambda: compat.commit_coordination_control(payload["run_id"], payload["expected_revision"], payload["route_head"], payload["stopped"], payload["prd_revision"], payload["context_digest"], payload.get("body", {})),
            "reserve_schedule": lambda: compat.reserve_schedule_occurrence(payload["occurrence_id"], payload["schedule_id"], payload["run_id"], payload["action_key"], payload["due_at"], payload.get("payload", {})),
            "resolve_schedule": lambda: compat.resolve_schedule_occurrence(payload["occurrence_id"], payload["state"], payload.get("observation", {})),
            "adopt_route": lambda: compat.adopt_route(payload["run_id"], payload["route_head"], payload["agent_id"], payload["context_digest"]),
            "route_status": lambda: compat.route_status(payload["run_id"]),
            "inspect": lambda: compat.inspect(payload["run_id"]),
        }
        emit(operations[args.operation]())
    elif args.command == "bind-activation":
        emit(bind_activation(runtime, workflow, args.run_id, object_value(args.input_json)))
    elif args.command == "admit":
        run = runtime.get_run(args.run_id)
        if run["current_node"] != "admission" or run["status"] != "ready":
            raise ValueError("run is not awaiting native admission")
        ExternalAgentProtocol(runtime).register_session(
            args.native_session_id, args.provider, args.model, "lead",
            ["amirahco-context", "amirahco-discovery", "amirahco-prd", "amirahco-clarify", "amirahco-work", "amirahco-review", "native_control", "native_admission"],
            {"control_ref": args.control_ref, "permission_state": args.permission_state},
        )
        emit(runtime.complete_node(args.run_id, "true", args.expected_revision, {"control_ref": args.control_ref, "permission_state": args.permission_state, "eligible": True}))
    elif args.command == "start":
        inputs = object_value(args.input_json)
        for field in ("project_id", "native_session_id"):
            if not isinstance(inputs.get(field), str) or not inputs[field].strip():
                raise ValueError(f"start requires a non-empty {field}")
        emit(runtime.start_run(workflow, args.run_id, inputs))
    elif args.command == "inspect":
        emit(runtime.inspect(args.run_id))
    elif args.command == "replay":
        emit(runtime.replay(args.run_id))
    elif args.command == "advance":
        run = runtime.get_run(args.run_id)
        if run["definition_digest"] != workflow.digest:
            raise ValueError("saved run uses a different lifecycle definition")
        node = workflow.nodes[run["current_node"]]
        result = object_value(args.result_json)
        validate_contract(workflow.spec, node, result)
        validate_decision(node["id"], args.outcome, result)
        validate_verdict(node["id"], args.outcome, result)
        emit(runtime.complete_node(args.run_id, args.outcome, args.expected_revision, result))
    elif args.command == "resume-approval":
        payload = {
            "actor": args.actor,
            "approval_ref": args.approval_ref,
            "prd_revision": args.prd_revision,
            "evidence": [{"kind": "approved_prd_revision", "ref": args.approval_ref}],
        }
        emit(runtime.resume_wait(
            args.run_id,
            "prd.approved",
            "current-prd",
            "success",
            args.expected_revision,
            payload,
        ))


if __name__ == "__main__":
    if sys.version_info < (3, 11):
        raise SystemExit("Python 3.11 or newer is required")
    main()
