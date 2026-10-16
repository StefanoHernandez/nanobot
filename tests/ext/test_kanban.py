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


def test_recurrence_every_requeues_ready(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "tick", status="ready", assignee="coder", recurrence_expr="every:3600s")
    store.claim_ready_tasks(0)
    before_ms = kb._now_ms()
    store.complete_task("tick", "cycle done", ["log.txt"])

    task = store.get_task_detail("tick")["task"]
    assert task["status"] == "ready"
    assert task["scheduled_at_ms"] is not None
    assert task["scheduled_at_ms"] > before_ms
    runs = store.get_task_detail("tick")["runs"]
    assert runs and runs[-1]["status"] == "done"


def test_recurrence_waits_until_scheduled_at(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "tick", status="ready", assignee="coder", recurrence_expr="every:3600s")
    store.claim_ready_tasks(0)
    store.complete_task("tick", "cycle done", ["log.txt"])
    task = store.get_task_detail("tick")["task"]
    scheduled = task["scheduled_at_ms"]
    assert isinstance(scheduled, int)
    assert store.claim_ready_tasks(scheduled - 1) == []
    assert store.get_task_detail("tick")["task"]["status"] == "ready"
    claimed = store.claim_ready_tasks(scheduled)
    assert [row["task_id"] for row in claimed] == ["tick"]


def test_scheduled_at_create_and_update(store_path):
    store = _store(store_path)
    _board(store)
    now = kb._now_ms()
    when = now + 60_000
    task = store.save_task({"board_id": "main", "title": "later", "scheduled_at_ms": when})
    assert task["scheduled_at_ms"] == when
    cleared = store.save_task({"id": task["id"], "scheduled_at_ms": None})
    assert cleared["scheduled_at_ms"] is None
    again = store.save_task({"id": task["id"], "scheduled_at_ms": when + 1000})
    assert again["scheduled_at_ms"] == when + 1000


def test_scheduled_at_rejects_bool_and_far_future(store_path):
    store = _store(store_path)
    _board(store)
    now = kb._now_ms()
    with pytest.raises(kb.KanbanError) as bad_type:
        store.save_task({"board_id": "main", "title": "bad", "scheduled_at_ms": True})
    assert bad_type.value.status == 400
    assert bad_type.value.code == "invalid_scheduled_at"
    too_far = now + 367 * 24 * 60 * 60 * 1000
    with pytest.raises(kb.KanbanError) as far:
        store.save_task({"board_id": "main", "title": "far", "scheduled_at_ms": too_far})
    assert far.value.status == 400
    assert far.value.code == "invalid_scheduled_at"


def test_claim_waits_until_parents_are_done(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "parent", status="todo")
    _task(store, "child", status="ready", assignee="coder", parent_ids=["parent"])
    assert store.claim_ready_tasks(0) == []
    assert store.get_task_detail("child")["task"]["status"] == "ready"
    store.move_task("parent", "done")
    claimed = store.claim_ready_tasks(0)
    assert [row["task_id"] for row in claimed] == ["child"]


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


def test_mention_fan_out_is_capped(store_path):
    store = _store(store_path)
    _board(store)
    for name in ("a1", "a2", "a3", "a4", "a5"):
        _bot(store, name)
    msg = store.post_message("main", "@a1 @a2 @a3 @a4 @a5 all of you")
    assert len(msg["triggered_bots"]) == kb.MAX_MENTIONS_PER_MESSAGE


def test_bot_never_wakes_itself(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    msg = store.post_message("main", "@coder talking to myself", author_type="bot", author_id="coder", author_name="Coder")
    assert msg["triggered_bots"] == []


def test_pending_wakes_are_capped(store_path, monkeypatch):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    monkeypatch.setattr(kb, "MAX_PENDING_WAKES", 2)
    assert store.post_message("main", "@coder one")["triggered_bots"] == ["coder"]
    assert store.post_message("main", "@coder two")["triggered_bots"] == ["coder"]
    assert store.post_message("main", "@coder three")["triggered_bots"] == []


def _kanban_router():
    return SimpleNamespace(
        config=SimpleNamespace(token_issue_secret="", token=MASTER),
        check_api_token=lambda request: _Tokens().check_api_token(request),
    )


def _kanban_get(path: str, *, auth: str | None = API):
    from websockets.datastructures import Headers
    from websockets.http11 import Request as WsRequest

    headers: list[tuple[str, str]] = []
    if auth is not None:
        headers.append(("Authorization", f"Bearer {auth}"))
    return WsRequest(path, Headers(headers))


def _events_json(resp):
    return json.loads(resp.body.decode("utf-8"))


def test_events_since_completed_run(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "done1", status="ready", assignee="coder")
    store.claim_ready_tasks(0)
    before = kb._now_ms()
    store.complete_task("done1", "finished", [])
    payload = store.events_since(before - 1)
    assert isinstance(payload["now"], int)
    done = [e for e in payload["events"] if e["kind"] == "done" and e["task_id"] == "done1"]
    assert len(done) == 1
    assert done[0]["key"].startswith("run:")
    assert done[0]["board_id"] == "main"
    assert done[0]["title"] == "done1"


def test_events_since_repeating_card_two_done_cycles(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "tick", status="ready", assignee="coder", recurrence_expr="every:3600s")
    since = kb._now_ms() - 1
    store.claim_ready_tasks(0)
    store.complete_task("tick", "cycle one", [])
    task = store.get_task_detail("tick")["task"]
    scheduled = task["scheduled_at_ms"]
    assert isinstance(scheduled, int)
    store.claim_ready_tasks(scheduled)
    store.complete_task("tick", "cycle two", [])
    payload = store.events_since(since)
    done = [e for e in payload["events"] if e["kind"] == "done" and e["task_id"] == "tick"]
    assert len(done) == 2
    assert done[0]["key"] != done[1]["key"]
    assert all(e["key"].startswith("run:") for e in done)


def test_events_since_request_review_not_run(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "work", status="ready", assignee="coder")
    since = kb._now_ms() - 1
    store.claim_ready_tasks(0)
    store.request_review("work", "please review", [])
    payload = store.events_since(since)
    review = [e for e in payload["events"] if e["task_id"] == "work"]
    assert len(review) == 1
    assert review[0]["kind"] == "review"
    assert review[0]["key"].startswith("review:work:")
    assert not any(e["key"].startswith("run:") for e in payload["events"])


def test_events_since_block_task(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "stuck", status="running", assignee="coder")
    since = kb._now_ms() - 1
    store.block_task("stuck", "waiting on vendor")
    payload = store.events_since(since)
    blocked = [e for e in payload["events"] if e["task_id"] == "stuck"]
    assert len(blocked) == 1
    assert blocked[0]["kind"] == "blocked"
    assert blocked[0]["key"].startswith("blocked:stuck:")


def test_events_since_filters_older(store_path, monkeypatch):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "old", status="ready", assignee="coder")
    t0 = 1_000_000
    monkeypatch.setattr(kb, "_now_ms", lambda: t0 + 500)
    store.claim_ready_tasks(0)
    store.complete_task("old", "done", [])
    monkeypatch.setattr(kb, "_now_ms", lambda: t0 + 2000)
    payload = store.events_since(t0 + 1000)
    assert not any(e["task_id"] == "old" for e in payload["events"])


def test_events_since_keeps_oldest_fifty(store_path, monkeypatch):
    store = _store(store_path)
    _board(store)
    base = 10_000_000
    since = base - 1
    for i in range(51):
        monkeypatch.setattr(kb, "_now_ms", lambda i=i: base + i * 10)
        tid = f"t{i:02d}"
        store.save_task({"id": tid, "board_id": "main", "title": tid, "status": "review"})
    payload = store.events_since(since)
    assert len(payload["events"]) == 50
    titles = [e["title"] for e in payload["events"]]
    assert titles[0] == "t00"
    assert titles[-1] == "t49"
    assert "t50" not in titles


def test_events_since_pages_past_fifty(store_path, monkeypatch):
    store = _store(store_path)
    _board(store)
    base = 20_000_000
    for i in range(60):
        monkeypatch.setattr(kb, "_now_ms", lambda i=i: base + i * 10)
        tid = f"p{i:02d}"
        store.save_task({"id": tid, "board_id": "main", "title": tid, "status": "review"})
    monkeypatch.setattr(kb, "_now_ms", lambda: base + 10_000)
    first = store.events_since(base - 1)
    assert len(first["events"]) == 50
    assert first["now"] < base + 50 * 10
    second = store.events_since(first["now"])
    keys = {e["key"] for e in first["events"]} | {e["key"] for e in second["events"]}
    assert len(keys) == 60


def test_events_since_hides_events_after_the_clock(store_path, monkeypatch):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "late", status="ready", assignee="coder")
    monkeypatch.setattr(kb, "_now_ms", lambda: 5_000)
    store.claim_ready_tasks(0)
    store.complete_task("late", "finished", [])
    monkeypatch.setattr(kb, "_now_ms", lambda: 4_000)
    first = store.events_since(0)
    assert not any(e["task_id"] == "late" for e in first["events"])
    assert first["now"] == 4_000
    monkeypatch.setattr(kb, "_now_ms", lambda: 6_000)
    second = store.events_since(first["now"])
    late = [e for e in second["events"] if e["task_id"] == "late"]
    assert len(late) == 1
    assert late[0]["kind"] == "done"


def test_parse_since_rejects_bad_values():
    with pytest.raises(kb.KanbanError) as exc:
        kb._parse_since_ms(True)
    assert exc.value.status == 400
    assert exc.value.code == "invalid_since"
    with pytest.raises(kb.KanbanError):
        kb._parse_since_ms("-1")
    with pytest.raises(kb.KanbanError):
        kb._parse_since_ms(None)
    assert kb._parse_since_ms(0) == 0
    assert kb._parse_since_ms("42") == 42


def test_events_route_bad_since(store_path):
    router = _kanban_router()
    resp = kb.dispatch_kanban_get(router, _kanban_get("/api/ext/kanban/events?since=abc"), "/api/ext/kanban/events")
    assert resp is not None
    assert resp.status_code == 400
    assert _events_json(resp) == {"error": "invalid_since"}
