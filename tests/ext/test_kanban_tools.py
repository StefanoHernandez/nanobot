"""Kanban tools are scoped to kanban sessions and to the run's own task."""

from __future__ import annotations

import pytest

from nanobot.agent.tools import kanban_tools as kt
from nanobot.agent.tools.context import RequestContext, bind_request_context, reset_request_context
from nanobot.ext import kanban as kb


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("NANOBOT_KANBAN_DB", str(tmp_path / "kanban.db"))
    s = kb.KanbanStore(seed=False)
    s.create_board(board_id="main", title="Board", max_concurrent=2)
    for bot in ("coder", "reviewer"):
        s.create_bot(bot_id=bot, name=bot.title(), max_concurrent=1)
    for tid in ("t1", "t2"):
        s.save_task({
            "id": tid, "board_id": "main", "title": tid, "description": "x", "status": "review",
            "assignee_bot_id": "coder", "reviewer_bot_id": "reviewer", "parent_ids": [],
        })
    return s


async def _as(session_key: str, tool, **kwargs):
    token = bind_request_context(RequestContext(channel="system", chat_id="kanban", session_key=session_key))
    try:
        return await tool.execute(**kwargs)
    finally:
        reset_request_context(token)


async def test_kanban_tools_refuse_outside_kanban_task_sessions(store):
    out = await _as("websocket:abc", kt.KanbanTool(), action="block", task_id="t1", reason="nope")
    assert "not_your_task" in str(out)


async def test_a_bot_cannot_touch_another_task(store):
    out = await _as("kanban:t1:coder", kt.KanbanTool(), action="block", task_id="t2", reason="nope")
    assert "not_your_task" in str(out)
    out = await _as("kanban:wake:w1:coder", kt.KanbanTool(), action="block", task_id="t1", reason="nope")
    assert "not_your_task" in str(out)


async def test_assignee_cannot_approve_its_own_review(store):
    out = await _as("kanban:t1:coder", kt.KanbanTool(), action="verdict", task_id="t1", approved=True)
    assert "not_reviewer" in str(out)
    out = await _as("kanban:t1:reviewer", kt.KanbanTool(), action="verdict", task_id="t1", approved=True)
    assert "not_reviewer" not in str(out) and "not_your_task" not in str(out)


async def test_one_tool_covers_every_action(store):
    tool = kt.KanbanTool()
    assert tool.name == "kanban"
    shown = await _as("websocket:abc", tool, action="show", task_id="t1")  # read is open to any session
    assert '"id":"t1"' in str(shown)
    assert "action must be" in str(await _as("kanban:t1:coder", tool, action="delete", task_id="t1"))
    assert "artifacts must be" in str(
        await _as("kanban:t1:coder", tool, action="complete", task_id="t1", summary="s", artifacts="{")
    )
    blocked = await _as("kanban:t1:coder", tool, action="block", task_id="t1", reason="waiting")
    assert '"status":"blocked"' in str(blocked)
