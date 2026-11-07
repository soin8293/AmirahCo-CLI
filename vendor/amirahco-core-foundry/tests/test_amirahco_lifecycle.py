from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "runtime"))
sys.path.insert(0, str(ROOT / "scripts"))

from amirahco_workflow import bind_activation, validate_contract, validate_decision, validate_verdict
from workflow_foundry.compiler import compile_file
from workflow_foundry.runtime import RevisionConflict, SQLiteRuntime


GRAPH = ROOT / "workflows" / "amirahco-project-lifecycle.json"


class LifecycleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="amirahco-lifecycle-")
        self.db = Path(self.temp.name) / "workflow.sqlite"
        self.workflow = compile_file(GRAPH)
        self.runtime = SQLiteRuntime(self.db)
        self.run = self.runtime.start_run(
            self.workflow,
            "run-1",
            {"project_id": "project-1", "native_session_id": "session-1"},
        )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def advance(self, outcome: str, result: dict) -> dict:
        node = self.workflow.nodes[self.run["current_node"]]
        validate_contract(self.workflow.spec, node, result)
        validate_decision(node["id"], outcome, result)
        validate_verdict(node["id"], outcome, result)
        self.run = self.runtime.complete_node("run-1", outcome, self.run["revision"], result)
        return self.run

    def reach_review(self) -> None:
        self.advance("success", {
            "project_id": "project-1", "native_session_id": "session-1",
            "context_revision": "ctx-1", "control_state": "active", "skill_profile": "amirahco-core@1.0.0",
        })
        self.advance("success", {
            "source_refs": ["source-1"], "confirmed_facts": ["fact"],
            "open_questions": [], "scope_boundaries": ["local-only"],
        })
        self.advance("false", {"ambiguities": [], "basis": "No material gaps"})
        self.advance("success", {
            "prd_revision": "prd-1", "markdown_path": "PRD.md",
            "record_receipt": "record-1", "open_blockers": [],
        })
        self.run = SQLiteRuntime(self.db).resume_wait(
            "run-1", "prd.approved", "current-prd", "success", self.run["revision"],
            {"actor": "owner", "evidence": [{"kind": "approved_prd_revision"}]},
        )
        self.advance("true", {
            "control_ref": "control-1", "approved_prd_revision": "prd-1", "activation_ref": "activation-1",
        })
        self.advance("true", {"control_ref": "control-1", "permission_state": "approved", "eligible": True})
        with self.assertRaisesRegex(ValueError, "lacks required fields"):
            self.advance("success", {"task_ref": "task-1"})
        self.advance("success", {
            "task_ref": "task-1", "requirement_refs": ["FR-1"],
            "artifact_refs": ["artifact-1"], "check_refs": ["check-1"], "result_ref": "result-1",
        })

    def test_normal_path_rejects_superficial_result_and_completes_with_evidence(self) -> None:
        self.reach_review()
        self.advance("pass", {
            "reviewer_ref": "reviewer-1", "criteria_revision": "criteria-1",
            "artifact_refs": ["artifact-1"], "evidence_refs": ["check-1", "wrong-result-probe-1"],
            "verdict": "pass", "findings": [],
        })
        self.assertEqual(self.run["terminal_outcome"], "complete")
        self.assertTrue(self.runtime.replay("run-1")["matches_projection"])

    def test_failed_review_enters_bounded_repair_and_rechecks_admission(self) -> None:
        self.reach_review()
        self.advance("fail", {
            "reviewer_ref": "reviewer-1", "criteria_revision": "criteria-1",
            "artifact_refs": ["artifact-1"], "evidence_refs": ["failing-check-1"],
            "verdict": "fail", "findings": ["criterion failed"],
        })
        self.assertEqual(self.run["current_node"], "repair")
        self.advance("success", {
            "repair_ref": "repair-1", "affected_criteria": ["AC-1"],
            "artifact_refs": ["artifact-2"], "check_refs": ["check-2"],
        })
        self.assertEqual(self.run["current_node"], "admission")

    def test_saved_wait_reopens_and_stale_revision_is_rejected(self) -> None:
        self.advance("success", {
            "project_id": "project-1", "native_session_id": "session-1",
            "context_revision": "ctx-1", "control_state": "active", "skill_profile": "amirahco-core@1.0.0",
        })
        old_revision = self.run["revision"]
        reopened = SQLiteRuntime(self.db)
        self.assertEqual(reopened.get_run("run-1")["revision"], old_revision)
        reopened.complete_node("run-1", "success", old_revision, {
            "source_refs": ["source-1"], "confirmed_facts": ["fact"],
            "open_questions": [], "scope_boundaries": ["local-only"],
        })
        with self.assertRaises(RevisionConflict):
            reopened.complete_node("run-1", "success", old_revision, {})

    def test_activation_binding_is_replay_safe_and_stops_at_native_admission(self) -> None:
        inputs = {
            "project_id": "project-2", "native_session_id": "session-2",
            "context_revision": "ctx@1", "context_digest": "a" * 64,
            "control_ref": "activation:one", "approved_prd_revision": "1:meaning",
            "approval_ref": "approval:one", "activation_ref": "activation:one",
            "skill_profile": "profile-digest", "prd_path": "/private/PRD.md",
        }
        first = bind_activation(self.runtime, self.workflow, "activation-run", inputs)
        self.assertEqual(first["run"]["current_node"], "admission")
        self.assertEqual(first["run"]["status"], "ready")
        self.assertTrue(first["replay"]["matches_projection"])
        second = bind_activation(SQLiteRuntime(self.db), self.workflow, "activation-run", inputs)
        self.assertEqual(second["run"]["revision"], first["run"]["revision"])
        admitted = self.runtime.complete_node("activation-run", "true", first["run"]["revision"], {"control_ref": inputs["control_ref"], "permission_state": "default", "eligible": True})
        resumed = bind_activation(SQLiteRuntime(self.db), self.workflow, "activation-run", inputs)
        self.assertEqual(resumed["run"]["current_node"], "work")
        self.assertEqual(resumed["run"]["revision"], admitted["revision"])
        with self.assertRaisesRegex(ValueError, "different activation inputs"):
            bind_activation(self.runtime, self.workflow, "activation-run", {**inputs, "activation_ref": "activation:other"})


if __name__ == "__main__":
    unittest.main()
