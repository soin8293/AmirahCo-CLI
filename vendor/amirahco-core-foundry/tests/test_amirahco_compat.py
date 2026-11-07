from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "runtime"))

from workflow_foundry.amirahco_compat import AmirahCoCompatibility
from workflow_foundry.runtime import SQLiteRuntime, WorkflowRuntimeError


class CompatibilityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="amirahco-compat-")
        self.runtime = SQLiteRuntime(Path(self.temp.name) / "foundry.sqlite")
        self.compat = AmirahCoCompatibility(self.runtime)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_board_result_and_ask_are_ordered_idempotent_and_full_body_readable(self) -> None:
        result = self.compat.append_event({"schema":"amirahco.board-event.v1","logical_id":"task-1:result","run_id":"run-1","kind":"RESULT","producer":"worker-1","recipient":"lead","body":{"task":"task-1","artifacts":["a"]}})
        ask = self.compat.append_event({"logical_id":"task-1:ask","run_id":"run-1","kind":"ASK","producer":"worker-1","recipient":"lead","body":{"task":"task-1","question":"Need owner choice"}})
        self.assertEqual((result["sequence"],ask["sequence"]),(1,2))
        self.assertEqual(self.compat.append_event({"logical_id":"task-1:result","run_id":"run-1","kind":"RESULT","producer":"worker-1","recipient":"lead","body":{"task":"task-1","artifacts":["a"]}})["event_id"],result["event_id"])
        events=self.compat.read_events("run-1")
        self.assertEqual(events[0]["body"],{"task":"task-1","artifacts":["a"]})
        with self.assertRaises(WorkflowRuntimeError):
            self.compat.append_event({"logical_id":"task-1:result","run_id":"run-1","kind":"RESULT","producer":"worker-1","recipient":"lead","body":{"task":"changed"}})

    def test_original_effect_is_reserved_before_observation_and_never_duplicated(self) -> None:
        first=self.compat.reserve_effect_attempt("run-1","action-1","owner-action-1","native-dispatch",{"prompt":"p"})
        second=self.compat.reserve_effect_attempt("run-1","action-1","owner-action-1","native-dispatch",{"prompt":"p"})
        self.assertEqual(first["attempt_id"],second["attempt_id"])
        observed=self.compat.record_effect_observation("action-1",first["attempt_id"],"unknown",{"reason":"lost reply"})
        self.assertEqual(observed["state"],"unknown")
        with self.assertRaises(WorkflowRuntimeError):
            self.compat.reserve_effect_attempt("run-1","action-1","different","native-dispatch",{"prompt":"p"})

    def test_overlapping_write_scopes_require_explicit_release_not_time(self) -> None:
        first=self.compat.claim_write_scopes("run-1","worker-1","pid:1",["src","tests/a"])
        self.assertEqual(self.compat.claim_write_scopes("run-1","worker-1","pid:1",["src","tests/a"])["claim_id"],first["claim_id"])
        with self.assertRaisesRegex(WorkflowRuntimeError,"expiry alone"):
            self.compat.claim_write_scopes("run-1","worker-2","pid:2",["src/module"])
        self.compat.release_write_scopes(first["claim_id"],first["fence_token"])
        self.assertTrue(self.compat.claim_write_scopes("run-1","worker-2","pid:2",["src/module"])["claim_id"])

    def test_coordination_control_uses_revision_fencing(self) -> None:
        first=self.compat.commit_coordination_control("run-1",0,"route-1",False,"prd-1","a"*64,{"selected_total":2,"roster":["lead","worker-1"]})
        self.assertEqual(first["revision"],1)
        with self.assertRaisesRegex(WorkflowRuntimeError,"stale"):
            self.compat.commit_coordination_control("run-1",0,"route-2",True,"prd-1","a"*64,{})
        stopped=self.compat.commit_coordination_control("run-1",1,"route-1",True,"prd-1","a"*64,{"reason":"owner stop"})
        self.assertTrue(stopped["stopped"])

    def test_schedule_occurrence_and_route_adoption_survive_restart_without_duplicate_handoff(self) -> None:
        occurrence=self.compat.reserve_schedule_occurrence("occ-1","daily","run-1","schedule-action-1","2030-01-01T00:00:00Z",{"task":"check"})
        reopened=AmirahCoCompatibility(SQLiteRuntime(self.runtime.database))
        self.assertEqual(reopened.reserve_schedule_occurrence("occ-1","daily","run-1","schedule-action-1","2030-01-01T00:00:00Z",{"task":"check"})["occurrence_id"],occurrence["occurrence_id"])
        reopened.resolve_schedule_occurrence("occ-1","accepted",{"receipt":"native-readback"})
        reopened.commit_coordination_control("run-1",0,"route-2",False,"prd-1","b"*64,{"roster":["lead","worker-1"]})
        first=reopened.adopt_route("run-1","route-2","lead","b"*64);self.assertFalse(first["drain_ready"])
        second=reopened.adopt_route("run-1","route-2","worker-1","b"*64);self.assertTrue(second["drain_ready"])
        with self.assertRaises(WorkflowRuntimeError):
            reopened.adopt_route("run-1","route-old","worker-1","b"*64)


if __name__ == "__main__":
    unittest.main()
