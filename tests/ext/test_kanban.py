"""Kanban store and HTTP helpers."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from nanobot.ext import kanban as kb

MASTER = "master-secret-kanban"
API = "api-token-kanban"


class _Tokens:
    def check_api_token(self, request):
        auth = request.headers.get("Authorization") or request.headers.get("authorization")
        return auth == f"Bearer {API}"


@pytest.fixture
def store_path(tmp_path, monkeypatch):
    path = tmp_path / "kanban.db"
    monkeypatch.setenv("NANOBOT_KANBAN_DB", str(path))
    return path


def _store(store_path, *, seed: bool = False) -> kb.KanbanStore:
    return kb.KanbanStore(store_path, seed=seed)


def _board(store: kb.KanbanStore, board_id: str = "main", *, max_concurrent: int = 2) -> None:
    store.create_board(board_id=board_id, title="Board", max_concurrent=max_concurrent)


def _bot(store: kb.KanbanStore, bot_id: str, *, max_concurrent: int = 1) -> None:
    store.create_bot(bot_id=bot_id, name=bot_id.title(), max_concurrent=max_concurrent)


def _task(
    store: kb.KanbanStore,
    task_id: str,
    *,
    board_id: str = "main",
    status: str = "todo",
    assignee: str | None = None,
    parent_ids: list[str] | None = None,
    max_retries: int = 2,
    recurrence_expr: str = "",
) -> dict:
    body = {
        "id": task_id,
        "board_id": board_id,
        "title": task_id,
        "description": f"work for {task_id}",
        "status": status,
        "assignee_bot_id": assignee,
        "parent_ids": parent_ids or [],
    }
    task = store.save_task(body)
    if max_retries != 2 or recurrence_expr:
        store._update_task(
            task_id,
            {"max_retries": max_retries, "recurrence_expr": recurrence_expr},
        )
        task = store.get_task_detail(task_id)["task"]
    return task


def test_parent_promotion_claim_context_and_cycle_rejected(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "p1", status="done", assignee="coder")
    store._update_task("p1", {"summary": "P1 done"})
    _task(store, "p2", status="ready", assignee="coder")
    _task(store, "c1", status="todo", assignee="coder")
    store.add_dependency("p1", "c1")
    store.add_dependency("p2", "c1")

    child = store.get_task_detail("c1")["task"]
    assert child["status"] == "todo"

    store.complete_task("p2", "API ready", ["src/api.py"])

    child = store.get_task_detail("c1")["task"]
    assert child["status"] == "ready"

    with pytest.raises(kb.KanbanError) as exc:
        store.add_dependency("c1", "p1")
    assert exc.value.code == "cycle"

    claimed = store.claim_ready_tasks(0)
    assert len(claimed) == 1
    ctx = claimed[0]["runtime_context"].content
    assert "P1 done" in ctx
    assert "API ready" in ctx
    assert "src/api.py" in ctx


def test_concurrency_caps_and_session_key(store_path):
    store = _store(store_path)
    _board(store, max_concurrent=2)
    _bot(store, "coder", max_concurrent=1)
    _bot(store, "researcher", max_concurrent=2)
    for tid in ("t1", "t2", "t3"):
        _task(store, tid, status="ready", assignee="coder")
    _task(store, "t4", status="ready", assignee="researcher")

    claimed = store.claim_ready_tasks(0)
    coder_claims = [c for c in claimed if c["bot_id"] == "coder"]
    assert len(coder_claims) == 1
    assert len(claimed) <= 2
    assert claimed[0]["session_key"] == f"kanban:{claimed[0]['task_id']}:{claimed[0]['bot_id']}"


def test_review_loop_session_key_and_approval(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "work", status="ready", assignee="coder")

    first = store.claim_ready_tasks(0)
    session_key = first[0]["session_key"]

    store.request_review("work", "done work", ["a.py"])
    store.review_verdict("work", approved=False, feedback="Fix edge case")

    task = store.get_task_detail("work")["task"]
    assert task["status"] == "ready"
    assert task["review_feedback"] == "Fix edge case"

    second = store.claim_ready_tasks(0)
    assert second[0]["session_key"] == session_key
    assert "Fix edge case" in second[0]["runtime_context"].content

    store.request_review("work", "done work", ["a.py"])
    store.review_verdict("work", approved=True)
    task = store.get_task_detail("work")["task"]
    assert task["status"] == "done"


def test_record_failure_transient_and_blocked(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "fragile", status="running", assignee="coder", max_retries=2)

    task = store.record_failure("fragile", "timeout", transient=True)
    assert task["status"] == "ready"
    assert task["retries"] == 0

    store.move_task("fragile", "running")
    store.record_failure("fragile", "crash")
    task = store.get_task_detail("fragile")["task"]
    assert task["retries"] == 1
    assert task["status"] == "ready"

    store.move_task("fragile", "running")
    task = store.record_failure("fragile", "crash again")
    assert task["status"] == "blocked"
    assert "Max retries (2) exceeded" in task["blocked_reason"]


def test_recurrence_every_requeues_todo(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "tick", status="ready", assignee="coder", recurrence_expr="every:3600s")
    store.claim_ready_tasks(0)
    before_ms = kb._now_ms()
    store.complete_task("tick", "cycle done", ["log.txt"])

    task = store.get_task_detail("tick")["task"]
    assert task["status"] == "todo"
    assert task["scheduled_at_ms"] is not None
    assert task["scheduled_at_ms"] > before_ms
    runs = store.get_task_detail("tick")["runs"]
    assert runs and runs[-1]["status"] == "done"


def test_mentions_hop_limit(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")

    user_msg = store.post_message("main", "@coder please help")
    assert user_msg["triggered_bots"] == ["coder"]

    bot_msg = store.post_message(
        "main",
        "@coder ping",
        author_type="bot",
        author_id="other",
        author_name="Other",
        parent_hop_count=2,
    )
    assert bot_msg["hop_count"] == 3
    assert bot_msg["triggered_bots"] == []


def _move_request(body: bytes, *, auth: str | None = MASTER):
    class _Content:
        @staticmethod
        async def read(_limit: int) -> bytes:
            return body

    headers = {"Content-Type": "application/json"}
    if auth is not None:
        headers["Authorization"] = f"Bearer {auth}"
    return SimpleNamespace(
        method="POST",
        path="/api/ext/kanban/tasks/move",
        headers=headers,
        content_length=len(body),
        content=_Content(),
    )


@pytest.mark.asyncio
async def test_tasks_move_requires_auth(store_path):
    store = _store(store_path)
    _board(store)
    _task(store, "moveme", status="todo")

    handler = kb.kanban_post_handler(MASTER, _Tokens(), fallback=_fail_fallback)
    body = json.dumps({"id": "moveme", "status": "ready"}).encode("utf-8")

    denied = await handler(_move_request(body, auth=None))
    assert denied.status == 401
    assert json.loads(denied.text) == {"error": "unauthorized"}

    allowed = await handler(_move_request(body))
    assert allowed.status == 200
    payload = json.loads(allowed.text)
    assert payload["task"]["status"] == "ready"


@pytest.mark.asyncio
async def test_review_requires_a_real_boolean(store_path):
    store = _store(store_path)
    _board(store)
    _task(store, "moveme", status="review")

    handler = kb.kanban_post_handler(MASTER, _Tokens(), fallback=_fail_fallback)
    body = json.dumps({"id": "moveme", "approved": "false"}).encode("utf-8")
    request = _move_request(body)
    request.path = "/api/ext/kanban/tasks/review"
    denied = await handler(request)
    assert denied.status == 400
    assert store.get_task_detail("moveme")["task"]["status"] == "review"

    saved = store.save_task({"id": "moveme", "description": "line one\nline two"})
    assert saved["description"] == "line one\nline two"


async def _fail_fallback(_request):
    raise AssertionError("fallback should not run")
