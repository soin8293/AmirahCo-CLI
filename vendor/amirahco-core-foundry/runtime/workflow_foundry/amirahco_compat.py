"""Private AmirahCo compatibility layer over Foundry-owned coordination state."""
from __future__ import annotations

import hashlib
import json
from contextlib import closing
from datetime import datetime, timezone
from typing import Any
import uuid

from .runtime import SQLiteRuntime, WorkflowRuntimeError


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _digest(value: Any) -> str:
    return hashlib.sha256(_json(value).encode("utf-8")).hexdigest()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AmirahCoCompatibility:
    """Board, original-action attempts, write scopes and committed route/control heads."""

    def __init__(self, runtime: SQLiteRuntime):
        self.runtime = runtime
        with runtime._transaction() as connection:
            connection.executescript("""
            CREATE TABLE IF NOT EXISTS amirahco_board_events(
              event_id TEXT PRIMARY KEY, logical_id TEXT NOT NULL UNIQUE, run_id TEXT NOT NULL,
              sequence INTEGER NOT NULL, schema_id TEXT NOT NULL CHECK(schema_id='amirahco.board-event.v1'),
              kind TEXT NOT NULL, producer TEXT NOT NULL, recipient TEXT NOT NULL,
              body_json TEXT NOT NULL, body_sha256 TEXT NOT NULL, created_at TEXT NOT NULL,
              UNIQUE(run_id,sequence));
            CREATE TABLE IF NOT EXISTS amirahco_effect_attempts(
              action_key TEXT PRIMARY KEY, attempt_id TEXT NOT NULL UNIQUE, run_id TEXT NOT NULL,
              original_action_identity TEXT NOT NULL, effect_kind TEXT NOT NULL, payload_json TEXT NOT NULL,
              payload_sha256 TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('reserved','observed','unknown')),
              observation_json TEXT, reserved_at TEXT NOT NULL, observed_at TEXT);
            CREATE TABLE IF NOT EXISTS amirahco_write_scope_claims(
              claim_id TEXT NOT NULL, run_id TEXT NOT NULL, scope TEXT NOT NULL, session_id TEXT NOT NULL,
              fence_token TEXT NOT NULL, process_identity TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','released')),
              created_at TEXT NOT NULL, released_at TEXT, PRIMARY KEY(claim_id,scope));
            CREATE UNIQUE INDEX IF NOT EXISTS amirahco_one_active_scope ON amirahco_write_scope_claims(run_id,scope) WHERE state='active';
            CREATE TABLE IF NOT EXISTS amirahco_coordination_control(
              run_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, route_head TEXT NOT NULL,
              stopped INTEGER NOT NULL CHECK(stopped IN (0,1)), prd_revision TEXT NOT NULL,
              context_digest TEXT NOT NULL, body_json TEXT NOT NULL, committed_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS amirahco_schedule_occurrences(
              occurrence_id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL, run_id TEXT NOT NULL,
              action_key TEXT NOT NULL UNIQUE, due_at TEXT NOT NULL, payload_json TEXT NOT NULL,
              payload_sha256 TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('reserved','accepted','discarded','unknown')),
              observation_json TEXT, reserved_at TEXT NOT NULL, resolved_at TEXT);
            CREATE TABLE IF NOT EXISTS amirahco_route_adoptions(
              run_id TEXT NOT NULL, route_head TEXT NOT NULL, agent_id TEXT NOT NULL,
              context_digest TEXT NOT NULL, adopted_at TEXT NOT NULL,
              PRIMARY KEY(run_id,route_head,agent_id));
            """)

    def append_event(self, event: dict[str, Any]) -> dict[str, Any]:
        required = ("logical_id", "run_id", "kind", "producer", "recipient", "body")
        if any(key not in event for key in required) or not isinstance(event["body"], dict):
            raise WorkflowRuntimeError("board event lacks canonical required fields")
        if event.get("schema", "amirahco.board-event.v1") != "amirahco.board-event.v1":
            raise WorkflowRuntimeError("unsupported board event schema")
        body_json, body_sha256 = _json(event["body"]), _digest(event["body"])
        with self.runtime._transaction() as connection:
            existing = connection.execute("SELECT * FROM amirahco_board_events WHERE logical_id=?", (event["logical_id"],)).fetchone()
            if existing:
                if existing["body_sha256"] != body_sha256 or existing["kind"] != event["kind"] or existing["producer"] != event["producer"] or existing["recipient"] != event["recipient"]:
                    raise WorkflowRuntimeError("board logical identity was reused with different content")
                return self._event(dict(existing))
            sequence = connection.execute("SELECT coalesce(max(sequence),0)+1 AS n FROM amirahco_board_events WHERE run_id=?", (event["run_id"],)).fetchone()["n"]
            event_id = str(uuid.uuid4())
            connection.execute("INSERT INTO amirahco_board_events VALUES (?,?,?,?,?,?,?,?,?,?,?)", (event_id,event["logical_id"],event["run_id"],sequence,"amirahco.board-event.v1",event["kind"],event["producer"],event["recipient"],body_json,body_sha256,_now()))
            row = connection.execute("SELECT * FROM amirahco_board_events WHERE event_id=?", (event_id,)).fetchone()
        return self._event(dict(row))

    @staticmethod
    def _event(row: dict[str, Any]) -> dict[str, Any]:
        row["schema"] = row.pop("schema_id")
        row["body"] = json.loads(row.pop("body_json"))
        return row

    def read_events(self, run_id: str, after: int = 0, limit: int = 100) -> list[dict[str, Any]]:
        if limit < 1 or limit > 200:
            raise WorkflowRuntimeError("board read limit must be 1..200")
        with closing(self.runtime._connect()) as connection:
            rows = connection.execute("SELECT * FROM amirahco_board_events WHERE run_id=? AND sequence>? ORDER BY sequence LIMIT ?", (run_id,after,limit)).fetchall()
        return [self._event(dict(row)) for row in rows]

    def reserve_effect_attempt(self, run_id: str, action_key: str, original_action_identity: str, effect_kind: str, payload: dict[str, Any]) -> dict[str, Any]:
        payload_json, payload_sha256 = _json(payload), _digest(payload)
        with self.runtime._transaction() as connection:
            existing = connection.execute("SELECT * FROM amirahco_effect_attempts WHERE action_key=?", (action_key,)).fetchone()
            if existing:
                if existing["original_action_identity"] != original_action_identity or existing["payload_sha256"] != payload_sha256 or existing["effect_kind"] != effect_kind:
                    raise WorkflowRuntimeError("effect action identity was reused with different intent")
                return dict(existing)
            attempt_id = str(uuid.uuid4())
            connection.execute("INSERT INTO amirahco_effect_attempts VALUES (?,?,?,?,?,?,?,'reserved',NULL,?,NULL)", (action_key,attempt_id,run_id,original_action_identity,effect_kind,payload_json,payload_sha256,_now()))
            return dict(connection.execute("SELECT * FROM amirahco_effect_attempts WHERE action_key=?", (action_key,)).fetchone())

    def record_effect_observation(self, action_key: str, attempt_id: str, state: str, observation: dict[str, Any]) -> dict[str, Any]:
        if state not in {"observed","unknown"}:
            raise WorkflowRuntimeError("effect observation state must be observed or unknown")
        observation_json = _json(observation)
        with self.runtime._transaction() as connection:
            row = connection.execute("SELECT * FROM amirahco_effect_attempts WHERE action_key=? AND attempt_id=?", (action_key,attempt_id)).fetchone()
            if not row:
                raise WorkflowRuntimeError("original effect attempt not found")
            if row["observation_json"] is not None and row["observation_json"] != observation_json:
                raise WorkflowRuntimeError("effect attempt already has a different observation")
            connection.execute("UPDATE amirahco_effect_attempts SET state=?,observation_json=?,observed_at=? WHERE action_key=?", (state,observation_json,_now(),action_key))
            return dict(connection.execute("SELECT * FROM amirahco_effect_attempts WHERE action_key=?", (action_key,)).fetchone())

    @staticmethod
    def _overlap(left: str, right: str) -> bool:
        left, right = left.strip("/"), right.strip("/")
        return left == right or left.startswith(right + "/") or right.startswith(left + "/")

    def claim_write_scopes(self, run_id: str, session_id: str, process_identity: str, scopes: list[str]) -> dict[str, Any]:
        cleaned = sorted(set(scope.strip("/") for scope in scopes if isinstance(scope,str) and scope.strip("/")))
        if not cleaned or len(cleaned) > 64:
            raise WorkflowRuntimeError("write scopes must contain 1..64 unique paths")
        with self.runtime._transaction() as connection:
            active = connection.execute("SELECT * FROM amirahco_write_scope_claims WHERE run_id=? AND state='active'", (run_id,)).fetchall()
            conflicts = [dict(row) for row in active if row["session_id"] != session_id and any(self._overlap(row["scope"], scope) for scope in cleaned)]
            if conflicts:
                raise WorkflowRuntimeError("write scope overlaps an active process; expiry alone cannot reassign it")
            own = [dict(row) for row in active if row["session_id"] == session_id]
            if own:
                if sorted(row["scope"] for row in own) != cleaned or any(row["process_identity"] != process_identity for row in own):
                    raise WorkflowRuntimeError("session already holds a different write scope claim")
                return {"claim_id":own[0]["claim_id"],"fence_token":own[0]["fence_token"],"scopes":cleaned}
            claim_id, fence = str(uuid.uuid4()), uuid.uuid4().hex
            for scope in cleaned:
                connection.execute("INSERT INTO amirahco_write_scope_claims VALUES (?,?,?,?,?,?,'active',?,NULL)", (claim_id,run_id,scope,session_id,fence,process_identity,_now()))
            return {"claim_id":claim_id,"fence_token":fence,"scopes":cleaned}

    def release_write_scopes(self, claim_id: str, fence_token: str) -> dict[str, Any]:
        with self.runtime._transaction() as connection:
            rows = connection.execute("SELECT * FROM amirahco_write_scope_claims WHERE claim_id=?", (claim_id,)).fetchall()
            if not rows or any(row["fence_token"] != fence_token for row in rows):
                raise WorkflowRuntimeError("write scope fencing token does not match")
            connection.execute("UPDATE amirahco_write_scope_claims SET state='released',released_at=? WHERE claim_id=? AND state='active'", (_now(),claim_id))
        return {"claim_id":claim_id,"state":"released"}

    def commit_coordination_control(self, run_id: str, expected_revision: int, route_head: str, stopped: bool, prd_revision: str, context_digest: str, body: dict[str, Any]) -> dict[str, Any]:
        with self.runtime._transaction() as connection:
            current = connection.execute("SELECT * FROM amirahco_coordination_control WHERE run_id=?", (run_id,)).fetchone()
            revision = 0 if not current else current["revision"]
            if revision != expected_revision:
                raise WorkflowRuntimeError("coordination control revision is stale")
            next_revision = revision + 1
            connection.execute("INSERT INTO amirahco_coordination_control VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET revision=excluded.revision,route_head=excluded.route_head,stopped=excluded.stopped,prd_revision=excluded.prd_revision,context_digest=excluded.context_digest,body_json=excluded.body_json,committed_at=excluded.committed_at", (run_id,next_revision,route_head,int(stopped),prd_revision,context_digest,_json(body),_now()))
            return {"run_id":run_id,"revision":next_revision,"route_head":route_head,"stopped":stopped,"prd_revision":prd_revision,"context_digest":context_digest,"body":body}

    def reserve_schedule_occurrence(self, occurrence_id: str, schedule_id: str, run_id: str, action_key: str, due_at: str, payload: dict[str, Any]) -> dict[str, Any]:
        payload_json, payload_sha256 = _json(payload), _digest(payload)
        with self.runtime._transaction() as connection:
            existing = connection.execute("SELECT * FROM amirahco_schedule_occurrences WHERE occurrence_id=? OR action_key=?", (occurrence_id,action_key)).fetchone()
            if existing:
                if existing["occurrence_id"] != occurrence_id or existing["action_key"] != action_key or existing["payload_sha256"] != payload_sha256 or existing["due_at"] != due_at:
                    raise WorkflowRuntimeError("schedule occurrence identity was reused with different intent")
                return dict(existing)
            connection.execute("INSERT INTO amirahco_schedule_occurrences VALUES (?,?,?,?,?,?,?,'reserved',NULL,?,NULL)", (occurrence_id,schedule_id,run_id,action_key,due_at,payload_json,payload_sha256,_now()))
            return dict(connection.execute("SELECT * FROM amirahco_schedule_occurrences WHERE occurrence_id=?", (occurrence_id,)).fetchone())

    def resolve_schedule_occurrence(self, occurrence_id: str, state: str, observation: dict[str, Any]) -> dict[str, Any]:
        if state not in {"accepted","discarded","unknown"}:
            raise WorkflowRuntimeError("schedule occurrence resolution is invalid")
        observation_json = _json(observation)
        with self.runtime._transaction() as connection:
            row = connection.execute("SELECT * FROM amirahco_schedule_occurrences WHERE occurrence_id=?", (occurrence_id,)).fetchone()
            if not row:
                raise WorkflowRuntimeError("schedule occurrence was not reserved before handoff")
            if row["observation_json"] is not None and (row["observation_json"] != observation_json or row["state"] != state):
                raise WorkflowRuntimeError("schedule occurrence already has a different readback")
            connection.execute("UPDATE amirahco_schedule_occurrences SET state=?,observation_json=?,resolved_at=? WHERE occurrence_id=?", (state,observation_json,_now(),occurrence_id))
            return dict(connection.execute("SELECT * FROM amirahco_schedule_occurrences WHERE occurrence_id=?", (occurrence_id,)).fetchone())

    def adopt_route(self, run_id: str, route_head: str, agent_id: str, context_digest: str) -> dict[str, Any]:
        with self.runtime._transaction() as connection:
            control = connection.execute("SELECT * FROM amirahco_coordination_control WHERE run_id=?", (run_id,)).fetchone()
            if not control or control["route_head"] != route_head or control["context_digest"] != context_digest:
                raise WorkflowRuntimeError("route adoption does not match the committed route/context head")
            existing = connection.execute("SELECT * FROM amirahco_route_adoptions WHERE run_id=? AND route_head=? AND agent_id=?", (run_id,route_head,agent_id)).fetchone()
            if existing and existing["context_digest"] != context_digest:
                raise WorkflowRuntimeError("agent route adoption already has a different context")
            connection.execute("INSERT OR IGNORE INTO amirahco_route_adoptions VALUES (?,?,?,?,?)", (run_id,route_head,agent_id,context_digest,_now()))
        return self.route_status(run_id)

    def route_status(self, run_id: str) -> dict[str, Any]:
        with closing(self.runtime._connect()) as connection:
            control = connection.execute("SELECT * FROM amirahco_coordination_control WHERE run_id=?", (run_id,)).fetchone()
            if not control:
                raise WorkflowRuntimeError("coordination control is not committed")
            body=json.loads(control["body_json"]);roster=body.get("roster",[])
            adopted=[row["agent_id"] for row in connection.execute("SELECT agent_id FROM amirahco_route_adoptions WHERE run_id=? AND route_head=? AND context_digest=? ORDER BY agent_id", (run_id,control["route_head"],control["context_digest"])).fetchall()]
        missing=sorted(set(roster)-set(adopted))
        return {"run_id":run_id,"route_head":control["route_head"],"context_digest":control["context_digest"],"adopted":adopted,"missing":missing,"drain_ready":not missing}

    def inspect(self, run_id: str) -> dict[str, Any]:
        with closing(self.runtime._connect()) as connection:
            control = connection.execute("SELECT * FROM amirahco_coordination_control WHERE run_id=?", (run_id,)).fetchone()
            attempts = [dict(row) for row in connection.execute("SELECT * FROM amirahco_effect_attempts WHERE run_id=? ORDER BY reserved_at", (run_id,))]
            claims = [dict(row) for row in connection.execute("SELECT * FROM amirahco_write_scope_claims WHERE run_id=? ORDER BY created_at,scope", (run_id,))]
            schedules = [dict(row) for row in connection.execute("SELECT * FROM amirahco_schedule_occurrences WHERE run_id=? ORDER BY due_at,occurrence_id", (run_id,))]
        route=None if not control else self.route_status(run_id)
        return {"control":None if not control else {**dict(control),"body":json.loads(control["body_json"])},"events":self.read_events(run_id),"attempts":attempts,"claims":claims,"schedules":schedules,"route":route}
