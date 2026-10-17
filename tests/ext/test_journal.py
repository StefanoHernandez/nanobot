"""Daily journal collection, settings, routes, and the scheduled job."""

from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from websockets.datastructures import Headers
from websockets.http11 import Request as WsRequest

from nanobot.cron.service import CronService
from nanobot.ext import journal
from nanobot.ext.kanban import KanbanStore
from nanobot.session.manager import SessionManager

DAY = date(2026, 10, 16)
MASTER = "master"


class _Tokens:
    def check_api_token(self, request: object) -> bool:
        headers = getattr(request, "headers", {})
        return headers.get("Authorization") == f"Bearer {MASTER}"


def _sessions(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    return workspace, SessionManager(workspace, sessions_root=tmp_path / "sessions")


def _say(sessions: SessionManager, key: str, role: str, content: str, stamp: str, **extra: object) -> None:
    session = sessions.get_or_create(key)
    session.messages.append({"role": role, "content": content, "timestamp": stamp, **extra})
    sessions.save(session)


def _ms(day: date, hour: int = 12) -> int:
    return int(datetime(day.year, day.month, day.day, hour, tzinfo=timezone.utc).timestamp() * 1000)


def test_collect_day_filters_sessions_and_tools(tmp_path, monkeypatch):
    workspace, sessions = _sessions(tmp_path)
    _say(sessions, "websocket:chat", "user", "decide the NAS layout", "2026-10-16T10:00:00")
    _say(sessions, "websocket:chat", "assistant", "use two disks", "2026-10-16T10:01:00")
    _say(sessions, "websocket:chat", "assistant", "", "2026-10-16T10:02:00", tool_calls=[{"id": "1"}])
    _say(sessions, "websocket:chat", "tool", "tool output that must stay out", "2026-10-16T10:03:00", tool_call_id="1")
    _say(sessions, "websocket:chat", "user", "yesterday", "2026-10-15T10:00:00")
    _say(sessions, "dream:20261016-100000", "user", "dream secret", "2026-10-16T11:00:00")
    _say(sessions, "kanban:wake:1", "user", "kanban secret", "2026-10-16T11:00:00")
    _say(sessions, "cron:1", "assistant", "cron secret", "2026-10-16T11:00:00")
    _say(sessions, "journal:20261016-110000", "assistant", "journal secret", "2026-10-16T11:00:00")

    db = tmp_path / "kanban.db"
    monkeypatch.setenv("NANOBOT_KANBAN_DB", str(db))
    KanbanStore(db)
    conn = sqlite3.connect(db)
    conn.execute(
        """
        INSERT INTO tasks (
            id, board_id, title, description, status, priority, workspace_mode, workspace_path,
            recurrence_expr, retries, max_retries, summary, artifacts_json, review_feedback,
            blocked_reason, created_at_ms, updated_at_ms
        ) VALUES ('t1', 'main', 'Ship notes', '', 'done', 'medium', 'scratch', '', '', 0, 2, '', '[]', '', '', 0, 0)
        """
    )
    conn.execute(
        """
        INSERT INTO task_runs (
            id, task_id, bot_id, session_key, status, summary, artifacts_json, started_at_ms, finished_at_ms, error
        ) VALUES ('r1', 't1', 'coder', 'kanban:t1', 'done', 'shipped', '[]', 0, ?, '')
        """,
        (_ms(DAY),),
    )
    conn.execute(
        """
        INSERT INTO task_runs (
            id, task_id, bot_id, session_key, status, summary, artifacts_json, started_at_ms, finished_at_ms, error
        ) VALUES ('r0', 't1', 'coder', 'kanban:t1', 'failed', '', '[]', 0, ?, 'old failure')
        """,
        (_ms(date(2026, 10, 15)),),
    )
    conn.commit()
    conn.close()

    text = journal.collect_day(DAY, sessions, tz_name="UTC")
    assert "decide the NAS layout" in text
    assert "use two disks" in text
    assert "Ship notes" in text and "done" in text and "shipped" in text
    assert "tool output" not in text
    assert "yesterday" not in text
    assert "dream secret" not in text
    assert "kanban secret" not in text
    assert "cron secret" not in text
    assert "journal secret" not in text
    assert "old failure" not in text
    assert workspace.is_dir()


def test_collect_day_keeps_the_newest_under_the_cap(tmp_path):
    _workspace, sessions = _sessions(tmp_path)
    _say(sessions, "websocket:chat", "user", "OLDEST-padding-" + ("x" * 40), "2026-10-16T08:00:00")
    _say(sessions, "websocket:chat", "assistant", "NEWEST-end", "2026-10-16T21:00:00")
    text = journal.collect_day(DAY, sessions, limit=20)
    assert len(text) <= 20
    assert "NEWEST-end" in text or text.endswith("NEWEST-end"[-len(text):])
    assert "OLDEST" not in text


@pytest.mark.asyncio
async def test_empty_day_writes_nothing(tmp_path):
    workspace, sessions = _sessions(tmp_path)

    async def turn(_prompt: str) -> str:
        raise AssertionError("the model must not run")

    result = await journal.execute_day(workspace, sessions, DAY, turn)
    assert result == {"date": "2026-10-16", "written": False}
    assert not (workspace / "memory" / "journal" / "2026-10-16.md").exists()


PRESETS = frozenset({"fast", "writer"})


def test_settings_validation(tmp_path):
    workspace, _sessions_unused = _sessions(tmp_path)
    assert journal.load_settings(workspace) == {"enabled": False, "hour": 3, "model": None}
    saved = journal.save_settings(workspace, {"enabled": True, "hour": 7}, preset_names=PRESETS)
    assert saved == {"enabled": True, "hour": 7, "model": None}
    assert journal.load_settings(workspace)["hour"] == 7
    with pytest.raises(journal.JournalError) as exc:
        journal.parse_settings({"enabled": True, "hour": 24}, preset_names=PRESETS)
    assert exc.value.status == 400 and exc.value.code == "invalid_hour"
    with pytest.raises(journal.JournalError):
        journal.parse_settings({"enabled": True, "hour": True}, preset_names=PRESETS)
    with pytest.raises(journal.JournalError):
        journal.parse_settings({"enabled": "yes", "hour": 7}, preset_names=PRESETS)
    journal.settings_path(workspace).write_text(
        '{"enabled": true, "hour": 9, "model": 4}', encoding="utf-8"
    )
    assert journal.load_settings(workspace)["model"] is None
    journal.settings_path(workspace).write_text(
        '{"enabled": true, "hour": 9, "model": "default"}', encoding="utf-8"
    )
    assert journal.load_settings(workspace)["model"] is None


def test_journal_model_preset_round_trip(tmp_path):
    workspace, _ = _sessions(tmp_path)
    saved = journal.save_settings(
        workspace,
        {"enabled": True, "hour": 9, "model": "writer"},
        preset_names=PRESETS,
    )
    assert saved["model"] == "writer"
    assert journal.load_settings(workspace)["model"] == "writer"


def test_journal_model_unknown_preset_rejected(tmp_path):
    workspace, _ = _sessions(tmp_path)
    with pytest.raises(journal.JournalError) as exc:
        journal.save_settings(
            workspace,
            {"enabled": True, "hour": 9, "model": "missing"},
            preset_names=PRESETS,
        )
    assert exc.value.status == 400 and exc.value.code == "invalid_model"


def test_journal_model_null_and_default_store_null(tmp_path):
    workspace, _ = _sessions(tmp_path)
    journal.save_settings(
        workspace,
        {"enabled": True, "hour": 9, "model": "writer"},
        preset_names=PRESETS,
    )
    for body in ({"enabled": True, "hour": 9, "model": None}, {"enabled": True, "hour": 9, "model": "default"}):
        saved = journal.save_settings(workspace, body, preset_names=PRESETS)
        assert saved["model"] is None
        assert journal.load_settings(workspace)["model"] is None


def test_journal_model_missing_keeps_previous(tmp_path):
    workspace, _ = _sessions(tmp_path)
    journal.save_settings(
        workspace,
        {"enabled": True, "hour": 9, "model": "fast"},
        preset_names=PRESETS,
    )
    saved = journal.save_settings(workspace, {"enabled": False, "hour": 10}, preset_names=PRESETS)
    assert saved == {"enabled": False, "hour": 10, "model": "fast"}


@pytest.mark.asyncio
async def test_agent_turn_uses_preset_runtime(tmp_path):
    workspace, sessions = _sessions(tmp_path)
    journal.save_settings(
        workspace,
        {"enabled": True, "hour": 22, "model": "writer"},
        preset_names=PRESETS,
    )
    runtime = object()
    seen: list[object | None] = []

    class _Agent:
        def __init__(self) -> None:
            self.sessions = sessions
            self.context = SimpleNamespace(memory=SimpleNamespace(workspace=workspace))
            self.runtime_resolver = SimpleNamespace(resolve_preset=lambda name: runtime if name == "writer" else None)

        async def process_direct(self, _prompt: str, **kwargs: object) -> SimpleNamespace:
            seen.append(kwargs.get("runtime"))
            return SimpleNamespace(content="ok")

    turn = journal.agent_turn(_Agent())
    text = await turn("prompt")
    assert text == "ok"
    assert seen == [runtime]


@pytest.mark.asyncio
async def test_agent_turn_falls_back_when_preset_unavailable(tmp_path):
    workspace, sessions = _sessions(tmp_path)
    journal.save_settings(
        workspace,
        {"enabled": True, "hour": 22, "model": "writer"},
        preset_names=PRESETS,
    )
    seen: list[object | None] = []

    class _Agent:
        def __init__(self) -> None:
            self.sessions = sessions
            self.context = SimpleNamespace(memory=SimpleNamespace(workspace=workspace))
            self.runtime_resolver = SimpleNamespace(resolve_preset=lambda _name: (_ for _ in ()).throw(RuntimeError("gone")))

        async def process_direct(self, _prompt: str, **kwargs: object) -> SimpleNamespace:
            seen.append(kwargs.get("runtime", "chat"))
            return SimpleNamespace(content="fallback")

    turn = journal.agent_turn(_Agent())
    text = await turn("prompt")
    assert text == "fallback"
    assert seen == ["chat"]


def _router(workspace, sessions):
    return SimpleNamespace(
        tokens=_Tokens(),
        skills_workspace_path=workspace,
        session_manager=sessions,
    )


def _get(path: str):
    return WsRequest(path, Headers([("Authorization", f"Bearer {MASTER}")]))


def _body(payload: dict) -> bytes:
    return json.dumps(payload).encode("utf-8")


def _post(path: str, payload: dict):
    raw = _body(payload)

    class _Content:
        @staticmethod
        async def read(_limit: int = 0) -> bytes:
            return raw

    return SimpleNamespace(
        method="POST",
        path=path,
        headers={"Authorization": f"Bearer {MASTER}"},
        content=_Content(),
    )


@pytest.mark.asyncio
async def test_routes_list_day_and_run(tmp_path, monkeypatch):
    workspace, sessions = _sessions(tmp_path)
    _say(sessions, "websocket:chat", "user", "talked about the NAS", "2026-10-16T10:00:00")
    router = _router(workspace, sessions)
    cron = CronService(tmp_path / "cron" / "jobs.json")

    listing = journal.dispatch_journal_get(router, _get("/api/ext/journal"), "/api/ext/journal")
    assert listing is not None
    body = json.loads(listing.body.decode("utf-8"))
    assert body["enabled"] is False and body["hour"] == 3 and body["model"] is None and body["days"] == []

    missing = journal.dispatch_journal_get(
        router, _get("/api/ext/journal/day?date=2026-10-16"), "/api/ext/journal/day"
    )
    assert missing is not None and missing.status_code == 404

    bad = journal.dispatch_journal_get(
        router, _get("/api/ext/journal/day?date=tuesday"), "/api/ext/journal/day"
    )
    assert bad is not None and bad.status_code == 400
    assert json.loads(bad.body.decode("utf-8"))["error"] == "invalid_date"

    async def turn(prompt: str) -> str:
        assert "Di cosa abbiamo parlato" in prompt
        assert "talked about the NAS" in prompt
        return "# Diario\n\nDecisione: due dischi."

    journal.bind_journal_turn(turn)
    handler = journal.journal_post_handler(
        MASTER, _Tokens(), _fallback, cron=cron, workspace=workspace, sessions=sessions, timezone="UTC"
    )
    ran = await handler(_post("/api/ext/journal/run", {"date": "2026-10-16"}))
    assert json.loads(ran.text) == {"date": "2026-10-16", "written": True}

    listed = journal.dispatch_journal_get(router, _get("/api/ext/journal"), "/api/ext/journal")
    assert listed is not None
    assert json.loads(listed.body.decode("utf-8"))["days"] == ["2026-10-16"]
    day = journal.dispatch_journal_get(
        router, _get("/api/ext/journal/day?date=2026-10-16"), "/api/ext/journal/day"
    )
    assert day is not None
    assert "Decisione" in json.loads(day.body.decode("utf-8"))["text"]

    saved = await handler(_post("/api/ext/journal/settings", {"enabled": True, "hour": 21}))
    assert json.loads(saved.text) == {"enabled": True, "hour": 21, "model": None}
    jobs = [job for job in cron.list_jobs(include_disabled=True) if job.name == "journal"]
    assert len(jobs) == 1 and jobs[0].schedule.expr == "0 21 * * *"
    monkeypatch.undo()


async def _fallback(_request):
    raise AssertionError("fallback should not run")


def test_job_is_scheduled_only_when_enabled(tmp_path):
    workspace, _sessions_unused = _sessions(tmp_path)
    cron = CronService(tmp_path / "cron" / "jobs.json")
    journal.sync_journal_job(cron, workspace, "UTC")
    assert [job for job in cron.list_jobs(include_disabled=True) if job.name == "journal"] == []
    journal.save_settings(workspace, {"enabled": True, "hour": 22}, preset_names=frozenset())
    journal.sync_journal_job(cron, workspace, "Europe/Rome")
    jobs = [job for job in cron.list_jobs(include_disabled=True) if job.name == "journal"]
    assert len(jobs) == 1
    assert jobs[0].schedule.expr == "0 22 * * *"
    assert jobs[0].schedule.tz == "Europe/Rome"
    journal.save_settings(workspace, {"enabled": False, "hour": 22}, preset_names=frozenset())
    journal.sync_journal_job(cron, workspace, "UTC")
    assert [job for job in cron.list_jobs(include_disabled=True) if job.name == "journal"] == []


@pytest.mark.asyncio
async def test_run_journal_job_writes_the_turn_and_does_not_deliver(tmp_path):
    workspace, sessions = _sessions(tmp_path)
    _say(sessions, "websocket:chat", "user", "open question about backups", "2026-10-15T18:00:00")
    calls: list[str] = []

    class _Resp:
        content = "Diario breve."

    class _Agent:
        def __init__(self) -> None:
            self.sessions = sessions
            self.context = SimpleNamespace(memory=SimpleNamespace(workspace=workspace))

        async def process_direct(self, prompt: str, **_kwargs: object) -> _Resp:
            calls.append(prompt)
            assert _kwargs.get("ephemeral") is True
            return _Resp()

    monkey_day = date(2026, 10, 16)
    original = journal.local_today
    journal.local_today = lambda _tz: monkey_day  # type: ignore[assignment]
    try:
        await journal.run_journal_job(_Agent(), tz_name="UTC")
        assert calls == []  # off by default: a leftover job writes nothing
        journal.save_settings(workspace, {"enabled": True, "hour": 3}, preset_names=frozenset())
        await journal.run_journal_job(_Agent(), tz_name="UTC")
    finally:
        journal.local_today = original
    assert calls and "open question about backups" in calls[0]
    yesterday = monkey_day - timedelta(days=1)
    assert not (workspace / "memory" / "journal" / f"{monkey_day.isoformat()}.md").exists()
    text = (workspace / "memory" / "journal" / f"{yesterday.isoformat()}.md").read_text(encoding="utf-8")
    assert "Diario breve." in text
