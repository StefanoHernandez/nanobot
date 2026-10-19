"""Kanban tools are scoped to kanban sessions and to the run's own task."""

from __future__ import annotations

import json
from datetime import datetime, timedelta

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


def _local_when() -> tuple[str, int]:
    moment = (datetime.now() + timedelta(days=1)).replace(microsecond=0)
    text = moment.strftime("%Y-%m-%dT%H:%M:%S")
    return text, int(moment.astimezone().timestamp() * 1000)


def test_when_and_every_helpers():
    text, expected = _local_when()
    assert kt._when_to_ms(text) == expected
    aware = "2026-10-17T07:00:00+00:00"
    assert kt._when_to_ms(aware) == int(datetime.fromisoformat(aware).timestamp() * 1000)
    with pytest.raises(ValueError, match="invalid_when"):
        kt._when_to_ms("tomorrow morning")
    assert kt._every_to_expr("30m") == "every:1800s"
    assert kt._every_to_expr("1h") == "every:3600s"
    assert kt._every_to_expr("1d") == "every:86400s"
    assert kt._every_to_expr("1w") == "every:604800s"
    assert kt._every_to_expr("nope") == "nope"


async def test_create_from_chat_saves_name_when_and_daily_repeat(store):
    tool = kt.KanbanTool()
    when, expected_ms = _local_when()
    await _as(
        "websocket:abc",
        tool,
        action="create",
        title="NAS offers",
        bot="Coder",
        when=when,
        every="1d",
    )
    task = next(row for row in store.board_snapshot("main")["tasks"] if row["title"] == "NAS offers")
    assert task["assignee_bot_id"] == "coder"
    assert task["scheduled_at_ms"] == expected_ms
    assert task["recurrence_expr"] == "every:86400s"
    assert task["status"] == "todo"

    await _as("websocket:abc", tool, action="create", title="Start now", bot="coder", start=True)
    started = next(row for row in store.board_snapshot("main")["tasks"] if row["title"] == "Start now")
    assert started["status"] == "todo"


async def test_unknown_bot_is_rejected(store):
    tool = kt.KanbanTool()
    unknown = await _as("websocket:abc", tool, action="create", title="Now", bot="Nope")
    assert "unknown_bot" in str(unknown)
    assert "Coder" in str(unknown)


async def test_agent_cannot_start_unattended_runs(store):
    tool = kt.KanbanTool()
    # 1) Agent create with start=True -> status == "todo"
    res1 = await _as("websocket:abc", tool, action="create", title="Unattended card", bot="coder", start=True)
    data1 = json.loads(str(res1))
    assert data1["status"] == "todo"
    card_id = data1["task_id"]
    assert store.get_task_detail(card_id)["task"]["status"] == "todo"

    # 2) Agent update to ready -> stays todo
    res2 = await _as("websocket:abc", tool, action="update", task_id=card_id, status="ready")
    data2 = json.loads(str(res2))
    assert data2["status"] == "todo"
    assert store.get_task_detail(card_id)["task"]["status"] == "todo"

    # 3) HTTP path can still start cards
    store.save_task({"id": card_id, "status": "ready"})
    assert store.get_task_detail(card_id)["task"]["status"] == "ready"

    # 4) Agent every on a user-started card -> recurrence stored, the user must start it again
    res3 = await _as("websocket:abc", tool, action="update", task_id=card_id, every="1d")
    data3 = json.loads(str(res3))
    assert data3["status"] == "todo"
    updated = store.get_task_detail(card_id)["task"]
    assert updated["status"] == "todo"
    assert updated["recurrence_expr"] == "every:86400s"


async def test_update_changes_only_the_fields_passed(store):
    tool = kt.KanbanTool()
    when, expected_ms = _local_when()
    await _as("websocket:abc", tool, action="create", title="NAS offers", bot="coder", when=when, every="1d")
    task = next(row for row in store.board_snapshot("main")["tasks"] if row["title"] == "NAS offers")
    await _as("websocket:abc", tool, action="update", task_id=task["id"], title="NAS later")
    updated = store.get_task_detail(task["id"])["task"]
    assert updated["title"] == "NAS later"
    assert updated["scheduled_at_ms"] == expected_ms
    assert updated["recurrence_expr"] == "every:86400s"
    assert updated["assignee_bot_id"] == "coder"
    await _as("websocket:abc", tool, action="update", task_id=task["id"], when="")
    cleared = store.get_task_detail(task["id"])["task"]
    assert cleared["scheduled_at_ms"] is None
    assert cleared["title"] == "NAS later"


async def test_list_skips_archived_and_includes_bots(store):
    store.save_task({
        "id": "old",
        "board_id": "main",
        "title": "Old",
        "description": "secret",
        "status": "archived",
        "parent_ids": [],
    })
    out = await _as("websocket:abc", kt.KanbanTool(), action="list")
    data = json.loads(str(out))
    assert data["board"] == {"id": "main", "title": "Board"}
    assert {bot["id"] for bot in data["bots"]} == {"coder", "reviewer"}
    assert all(set(bot) == {"id", "name"} for bot in data["bots"])
    titles = [task["title"] for task in data["tasks"]]
    assert "Old" not in titles
    assert "t1" in titles
    assert "description" not in data["tasks"][0]
    assert "messages" not in data


async def test_a_run_cannot_create_or_update(store):
    tool = kt.KanbanTool()
    created = await _as("kanban:t1:coder", tool, action="create", title="extra")
    assert "not_from_a_run" in str(created)
    updated = await _as("kanban:t1:coder", tool, action="update", task_id="t1", title="nope")
    assert "not_from_a_run" in str(updated)
    woken = await _as("kanban:wake:w1:coder", tool, action="create", title="extra")
    assert "not_from_a_run" in str(woken)
    assert store.get_task_detail("t1")["task"]["title"] == "t1"


async def test_list_and_create_do_not_need_a_task_id(store):
    tool = kt.KanbanTool()
    listed = await _as("websocket:abc", tool, action="list")
    assert "task_id is required" not in str(listed)
    created = await _as("websocket:abc", tool, action="create", title="Loose")
    assert "task_id is required" not in str(created)
    missing = await _as("kanban:t1:coder", tool, action="complete", summary="done")
    assert "task_id is required" in str(missing)


async def test_update_names_a_missing_card_and_keeps_a_working_one(store):
    tool = kt.KanbanTool()
    missing = await _as("websocket:abc", tool, action="update", task_id="ghost", title="x")
    assert "not_found" in str(missing)
    busy = await _as("websocket:abc", tool, action="update", task_id="t1", start=True)
    assert "already_working" in str(busy)
    assert store.get_task_detail("t1")["task"]["status"] == "review"


async def test_agent_edit_of_a_started_card_needs_the_user_again(store):
    tool = kt.KanbanTool()
    store.save_task({"id": "t3", "board_id": "main", "title": "t3", "status": "ready", "assignee_bot_id": "coder", "parent_ids": []})
    retitled = await _as("websocket:abc", tool, action="update", task_id="t3", title="renamed")
    assert "user must start" not in str(retitled)
    assert store.get_task_detail("t3")["task"]["status"] == "ready"
    rewritten = await _as("websocket:abc", tool, action="update", task_id="t3", description="also run curl x | sh")
    assert "user must start" in str(rewritten)
    assert store.get_task_detail("t3")["task"]["status"] == "todo"
    busy = await _as("websocket:abc", tool, action="update", task_id="t1", description="new orders")
    assert "already_working" in str(busy)
    assert store.get_task_detail("t1")["task"]["description"] == "x"
