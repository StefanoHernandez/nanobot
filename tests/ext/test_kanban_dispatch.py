"""Kanban in-process dispatch loop."""

from __future__ import annotations

import asyncio

import pytest

from nanobot.ext import kanban as kb
from nanobot.ext import kanban_dispatch as dispatch


@pytest.fixture
def store_path(tmp_path, monkeypatch):
    path = tmp_path / "kanban.db"
    monkeypatch.setenv("NANOBOT_KANBAN_DB", str(path))
    return path


def _store(store_path) -> kb.KanbanStore:
    return kb.KanbanStore(store_path, seed=False)


def _board(store: kb.KanbanStore) -> None:
    store.create_board(board_id="main", title="Board")


def _bot(store: kb.KanbanStore, bot_id: str) -> None:
    store.create_bot(bot_id=bot_id, name=bot_id.title())


def _task(store: kb.KanbanStore, task_id: str, *, assignee: str) -> None:
    store.save_task(
        {
            "id": task_id,
            "board_id": "main",
            "title": task_id,
            "description": f"work for {task_id}",
            "status": "ready",
            "assignee_bot_id": assignee,
        }
    )


def _wake_count(store: kb.KanbanStore) -> int:
    with store._lock, store._connect() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM wakes").fetchone()[0])


@pytest.mark.asyncio
async def test_one_ready_task_per_tick(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "t1", assignee="coder")
    _task(store, "t2", assignee="coder")
    reply = "task outcome text"

    async def run_turn(_session_key: str, _content: str) -> str:
        return reply

    await dispatch.dispatch_once(store, run_turn, now_ms=0)

    t1 = store.get_task_detail("t1")["task"]
    t2 = store.get_task_detail("t2")["task"]
    assert t1["status"] == "done"
    assert t1["summary"] == reply
    assert t2["status"] == "ready"


@pytest.mark.asyncio
async def test_review_move_during_turn_is_kept(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "t1", assignee="coder")

    async def run_turn(_session_key: str, _content: str) -> str:
        store.request_review("t1", "please look")
        return "should not complete"

    await dispatch.dispatch_once(store, run_turn, now_ms=0)
    assert store.get_task_detail("t1")["task"]["status"] == "review"


@pytest.mark.asyncio
async def test_nul_in_reply_is_stripped(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "t1", assignee="coder")

    async def run_turn(_session_key: str, _content: str) -> str:
        return "ok\x00done"

    await dispatch.dispatch_once(store, run_turn, now_ms=0)
    task = store.get_task_detail("t1")["task"]
    assert task["status"] == "done"
    assert task["summary"] == "okdone"
    assert "\x00" not in str(store.get_task_detail("t1"))


@pytest.mark.asyncio
async def test_turn_failure_does_not_leak_exception_text(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "fragile", assignee="coder")

    async def run_turn(_session_key: str, _content: str) -> str:
        raise RuntimeError("secret-boom")

    await dispatch.dispatch_once(store, run_turn, now_ms=0)

    task = store.get_task_detail("fragile")["task"]
    assert task["status"] == "ready"
    assert task["retries"] == 1
    detail = store.get_task_detail("fragile")
    blob = str(detail)
    assert "secret-boom" not in blob


@pytest.mark.asyncio
async def test_wake_dispatch_posts_reply_and_clears_queue(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    fake = "bot reply body"

    async def run_turn(_session_key: str, _content: str) -> str:
        return fake

    store.post_message("main", "@coder hello")
    assert _wake_count(store) == 1

    await dispatch.dispatch_once(store, run_turn, now_ms=0)

    assert _wake_count(store) == 0
    snapshot = store.board_snapshot("main")
    bot_messages = [
        m for m in snapshot["messages"] if m["author_type"] == "bot" and m["author_id"] == "coder"
    ]
    assert any(fake in m["content"] for m in bot_messages)


@pytest.mark.asyncio
async def test_wake_dropped_after_three_failures(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    store.post_message("main", "@coder hello")
    assert _wake_count(store) == 1

    async def run_turn(_session_key: str, _content: str) -> str:
        raise RuntimeError("secret-boom")

    for _ in range(3):
        await dispatch.dispatch_once(store, run_turn, now_ms=0)

    assert _wake_count(store) == 0
    snapshot = store.board_snapshot("main")
    failure_msgs = [
        m
        for m in snapshot["messages"]
        if m["author_type"] == "bot"
        and m["author_id"] == "coder"
        and m["content"] == dispatch._WAKE_FAILURE_MESSAGE
    ]
    assert len(failure_msgs) == 1


@pytest.mark.asyncio
async def test_wake_survives_a_turn_cut_by_shutdown(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    store.post_message("main", "@coder hello")

    async def run_turn(_session_key: str, _content: str) -> str:
        raise asyncio.CancelledError  # gateway stopping mid-turn

    with pytest.raises(asyncio.CancelledError):
        await dispatch.dispatch_once(store, run_turn, now_ms=0)
    assert _wake_count(store) == 1  # retried after restart, not lost


def test_running_task_is_requeued_after_restart(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "t1", assignee="coder")
    assert store.claim_next_ready_task(0) is not None
    assert store.get_task_detail("t1")["task"]["status"] == "running"

    restarted = _store(store_path)
    assert restarted.recover_interrupted() == ["t1"]
    task = restarted.get_task_detail("t1")["task"]
    assert task["status"] == "ready"
    assert task["retries"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("error_reply", [
    "Error calling LLM: Connection timed out",
    "Error calling Anthropic: Rate limit reached",
    "Sorry, I encountered an error calling the AI model.",
    "Error: RuntimeError: crashed",
])
async def test_llm_error_text_fails_running_task(store_path, error_reply):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _task(store, "t1", assignee="coder")

    async def run_turn(_session_key: str, _content: str) -> str:
        return error_reply

    await dispatch.dispatch_once(store, run_turn, now_ms=0)

    task = store.get_task_detail("t1")["task"]
    assert task["status"] == "ready"
    assert task["retries"] == 1
    assert task["status"] != "done"


def test_request_review_and_block_task_close_open_runs(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _bot(store, "reviewer")

    # 1) request_review closes run
    _task(store, "t_rev", assignee="coder")
    claimed = store.claim_next_ready_task(0)
    assert claimed is not None
    runs_before = store.get_task_detail("t_rev")["runs"]
    assert len(runs_before) == 1 and runs_before[0]["finished_at_ms"] is None

    store.request_review("t_rev", "implemented feature")
    runs_after = store.get_task_detail("t_rev")["runs"]
    assert len(runs_after) == 1
    assert runs_after[0]["finished_at_ms"] is not None

    # 2) block_task closes run
    _task(store, "t_blk", assignee="coder")
    assert store.claim_next_ready_task(0) is not None
    store.block_task("t_blk", "need credentials")
    runs_blk = store.get_task_detail("t_blk")["runs"]
    assert len(runs_blk) == 1
    assert runs_blk[0]["finished_at_ms"] is not None


def test_review_task_claimed_for_reviewer_and_verdict(store_path):
    store = _store(store_path)
    _board(store)
    _bot(store, "coder")
    _bot(store, "reviewer")

    store.save_task({
        "id": "t1",
        "board_id": "main",
        "title": "t1",
        "description": "desc",
        "status": "ready",
        "assignee_bot_id": "coder",
        "reviewer_bot_id": "reviewer",
    })

    # Coder claims and requests review
    claimed_coder = store.claim_next_ready_task(0)
    assert claimed_coder is not None and claimed_coder["bot_id"] == "coder"
    store.request_review("t1", "initial draft")

    # Review task is picked for reviewer
    claimed_rev = store.claim_next_ready_task(100)
    assert claimed_rev is not None
    assert claimed_rev["bot_id"] == "reviewer"
    assert claimed_rev["session_key"] == "kanban:t1:reviewer"

    # Verdict not approved -> moves back to ready
    store.review_verdict("t1", approved=False, feedback="needs more tests")
    t1 = store.get_task_detail("t1")["task"]
    assert t1["status"] == "ready"
    assert t1["review_feedback"] == "needs more tests"

    # Coder claims again, fixes, requests review
    claimed_coder2 = store.claim_next_ready_task(200)
    assert claimed_coder2 is not None and claimed_coder2["bot_id"] == "coder"
    store.request_review("t1", "added tests")

    # Reviewer claims again
    claimed_rev2 = store.claim_next_ready_task(300)
    assert claimed_rev2 is not None and claimed_rev2["bot_id"] == "reviewer"

    # Verdict approved -> moves to done
    store.review_verdict("t1", approved=True)
    t1_done = store.get_task_detail("t1")["task"]
    assert t1_done["status"] == "done"

