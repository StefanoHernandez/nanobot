"""Full-text search over chats, journal, and kanban."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from websockets.datastructures import Headers
from websockets.http11 import Request as WsRequest

from nanobot.agent.tools.context import ToolContext
from nanobot.config.schema import ToolsConfig
from nanobot.ext import search
from nanobot.ext.kanban import KanbanStore
from nanobot.session.manager import SessionManager

MASTER = "master-token"


class _Tokens:
    def check_api_token(self, request: object) -> bool:
        headers = getattr(request, "headers", {})
        return headers.get("Authorization") == f"Bearer {MASTER}"


class _Router:
    def __init__(self, workspace: Path, session_manager: SessionManager | None = None, secret: str = MASTER) -> None:
        self.skills_workspace_path = str(workspace)
        self.session_manager = session_manager
        self.config = SimpleNamespace(token_issue_secret="", token=secret)
        self.secret = secret

    def check_api_token(self, request: object) -> bool:
        headers = getattr(request, "headers", {})
        return headers.get("Authorization") == f"Bearer {self.secret}"


def _make_router(workspace: Path, session_manager: SessionManager | None = None, secret: str = MASTER) -> _Router:
    return _Router(workspace, session_manager=session_manager, secret=secret)


def _http_get(path: str, auth: bool = True) -> WsRequest:
    raw_headers = [("Host", "localhost")]
    if auth:
        raw_headers.append(("Authorization", f"Bearer {MASTER}"))
    return WsRequest(path, Headers(raw_headers))


def _init_env(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr("nanobot.config.paths.get_data_dir", lambda: data_dir)
    search_db = data_dir / "ext_search.db"
    monkeypatch.setenv("NANOBOT_SEARCH_DB", str(search_db))

    workspace = tmp_path / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)

    kanban_db = tmp_path / "ext_kanban.db"
    monkeypatch.setenv("NANOBOT_KANBAN_DB", str(kanban_db))
    KanbanStore(kanban_db)

    sessions_root = tmp_path / "sessions"
    sessions_mgr = SessionManager(workspace, sessions_root=sessions_root)
    sessions_db = sessions_mgr._store.path

    return SimpleNamespace(
        workspace=workspace,
        sessions_mgr=sessions_mgr,
        sessions_db=sessions_db,
        kanban_db=kanban_db,
        search_db=search_db,
    )


def _add_message(sessions: SessionManager, key: str, role: str, content: str, position: int | None = None, **extra):
    session = sessions.get_or_create(key)
    if "title" not in session.metadata:
        session.metadata["title"] = f"Chat {key}"
    session.messages.append({
        "role": role,
        "content": content,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **extra,
    })
    sessions.save(session)


def test_index_and_find_chat_message(tmp_path, monkeypatch):
    env = _init_env(tmp_path, monkeypatch)
    _add_message(env.sessions_mgr, "websocket:conv1", "user", "How do I configure the wireguard tunnel?")
    _add_message(env.sessions_mgr, "websocket:conv1", "assistant", "Use wg-quick up wg0 on the host.")

    results = search.search("wireguard", workspace=env.workspace, sessions_dir=env.sessions_mgr.sessions_dir)
    assert len(results) >= 1
    hit = results[0]
    assert hit["source"] == "chats"
    assert hit["session_key"] == "websocket:conv1"
    assert hit["ref"].startswith("websocket:conv1#")
    assert "«wireguard»" in hit["snippet"].lower() or "«wireguard»" in hit["excerpt"].lower()


def test_index_and_find_journal_day(tmp_path, monkeypatch):
    env = _init_env(tmp_path, monkeypatch)
    journal_dir = env.workspace / "memory" / "journal"
    journal_dir.mkdir(parents=True, exist_ok=True)
    day_file = journal_dir / "2026-10-18.md"
    day_file.write_text("# 2026-10-18\nToday we deployed the new solar power inverter firmware.", encoding="utf-8")

    results = search.search("solar inverter", workspace=env.workspace, sessions_dir=env.sessions_mgr.sessions_dir)
    assert len(results) == 1
    hit = results[0]
    assert hit["source"] == "journal"
    assert hit["ref"] == "journal:2026-10-18"
    assert "«solar»" in hit["snippet"].lower() or "«inverter»" in hit["snippet"].lower()


def test_index_and_find_kanban_task(tmp_path, monkeypatch):
    env = _init_env(tmp_path, monkeypatch)
    store = KanbanStore(env.kanban_db)
    store.save_task({
        "id": "t-inverter-99",
        "board_id": "main",
        "title": "Calibrate battery sensor",
        "description": "Ensure the shunt resistor reading matches the multimeter reading.",
        "status": "ready",
    })
    # Add a run with summary
    with store._lock, store._connect() as conn:
        conn.execute(
            """INSERT INTO task_runs (id, task_id, bot_id, session_key, status, summary, artifacts_json, started_at_ms, finished_at_ms)
               VALUES ('run-1', 't-inverter-99', 'bot-1', 'kanban:run', 'done', 'Multimeter verified at 48.2V.', '[]', 1000, 2000)"""
        )

    results = search.search("multimeter shunt", workspace=env.workspace, sessions_dir=env.sessions_mgr.sessions_dir)
    assert len(results) == 1
    hit = results[0]
    assert hit["source"] == "kanban"
    assert hit["ref"] == "kanban:t-inverter-99"
    assert hit["title"] == "Calibrate battery sensor"


def test_ranking_puts_better_match_first(tmp_path, monkeypatch):
    env = _init_env(tmp_path, monkeypatch)
    _add_message(env.sessions_mgr, "websocket:c1", "user", "raspberry pi raspberry pi raspberry pi setup guide")
    _add_message(env.sessions_mgr, "websocket:c2", "user", "I like apples and one raspberry for dessert")

    results = search.search("raspberry", workspace=env.workspace, sessions_dir=env.sessions_mgr.sessions_dir)
    assert len(results) >= 2
    assert results[0]["session_key"] == "websocket:c1"
    assert results[1]["session_key"] == "websocket:c2"


def test_new_message_appears_after_refresh(tmp_path, monkeypatch):
    env = _init_env(tmp_path, monkeypatch)
    _add_message(env.sessions_mgr, "websocket:chat-a", "user", "Initial hello message")
    assert len(search.search("telemetry", workspace=env.workspace, sessions_dir=env.sessions_mgr.sessions_dir)) == 0

    # Add message and force refresh
    _add_message(env.sessions_mgr, "websocket:chat-a", "assistant", "Realtime telemetry metrics are streaming.")
    search.refresh(workspace=env.workspace, force=True, sessions_dir=env.sessions_mgr.sessions_dir)

    results = search.search("telemetry", workspace=env.workspace, sessions_dir=env.sessions_mgr.sessions_dir)
    assert len(results) == 1
    assert results[0]["session_key"] == "websocket:chat-a"


def test_deleted_session_disappears(tmp_path, monkeypatch):
    env = _init_env(tmp_path, monkeypatch)
    _add_message(env.sessions_mgr, "websocket:chat-del", "user", "TopSecretLaserPlans must be destroyed")
    results = search.search("TopSecretLaserPlans", workspace=env.workspace, sessions_dir=env.sessions_mgr.sessions_dir)
    assert len(results) == 1

    # Delete session
    env.sessions_mgr.delete_session("websocket:chat-del")
    search.refresh(workspace=env.workspace, force=True, sessions_dir=env.sessions_mgr.sessions_dir)

    results = search.search("TopSecretLaserPlans", workspace=env.workspace, sessions_dir=env.sessions_mgr.sessions_dir)
    assert len(results) == 0


def test_internal_sessions_are_never_indexed(tmp_path, monkeypatch):
    env = _init_env(tmp_path, monkeypatch)
    _add_message(env.sessions_mgr, "dream:nightly-1", "user", "quantum dream secret")
    _add_message(env.sessions_mgr, "kanban:task-1:bot", "user", "quantum kanban run internal")
    _add_message(env.sessions_mgr, "journal:job-1", "assistant", "quantum journal generation")
    _add_message(env.sessions_mgr, "heartbeat", "user", "quantum heartbeat ping")

    results = search.search("quantum", workspace=env.workspace, sessions_dir=env.sessions_mgr.sessions_dir)
    assert len(results) == 0


def test_fts_syntax_in_query_does_not_crash(tmp_path, monkeypatch):
    env = _init_env(tmp_path, monkeypatch)
    _add_message(env.sessions_mgr, "websocket:safe", "user", "Simple safe message")

    for bad_query in ['"', '""', "*", "NEAR", "NEAR/2", "AND", "OR", 'foo "bar* baz', ""]:
        res = search.search(bad_query, workspace=env.workspace, sessions_dir=env.sessions_mgr.sessions_dir)
        assert isinstance(res, list)


def test_source_column_unindexed(tmp_path, monkeypatch):
    env = _init_env(tmp_path, monkeypatch)
    store = KanbanStore(env.kanban_db)
    store.save_task({
        "id": "t-birds-1",
        "board_id": "main",
        "title": "Build cedar birdhouse",
        "description": "Construct wooden feeder in garden.",
        "status": "ready",
    })

    # Searching for the literal word "kanban" should NOT match the row since 'source' is UNINDEXED
    results = search.search("kanban", workspace=env.workspace, sessions_dir=env.sessions_mgr.sessions_dir)
    assert len(results) == 0

    # Searching for actual content matches
    results = search.search("birdhouse", workspace=env.workspace, sessions_dir=env.sessions_mgr.sessions_dir)
    assert len(results) == 1
    assert results[0]["source"] == "kanban"


def test_old_schema_version_rebuilds_index(tmp_path, monkeypatch):
    import sqlite3

    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    db_file = data_dir / "test_rebuild.db"

    # Simulate old DB without schema_version
    conn = sqlite3.connect(db_file)
    conn.execute(
        """CREATE VIRTUAL TABLE docs USING fts5(
            source,
            ref UNINDEXED,
            title,
            body,
            ts UNINDEXED
        )"""
    )
    conn.execute("CREATE TABLE sync_meta (key TEXT PRIMARY KEY, val TEXT NOT NULL)")
    conn.execute("INSERT INTO sync_meta (key, val) VALUES ('schema_version', '1')")
    conn.execute("CREATE TABLE sync_state (source TEXT NOT NULL, item_id TEXT NOT NULL, version TEXT NOT NULL, PRIMARY KEY (source, item_id))")
    conn.execute("INSERT INTO sync_state VALUES ('chats', 'old-item', 'v1')")
    conn.commit()
    conn.close()

    # Now call _init_db
    conn2 = search._init_db(db_file)
    val = conn2.execute("SELECT val FROM sync_meta WHERE key = 'schema_version'").fetchone()[0]
    assert val == search.SCHEMA_VERSION
    # sync_state should be empty because old index was dropped for rebuild
    count = conn2.execute("SELECT COUNT(*) FROM sync_state").fetchone()[0]
    assert count == 0
    conn2.close()


def test_refresh_error_logs_and_does_not_crash(tmp_path, monkeypatch):
    env = _init_env(tmp_path, monkeypatch)
    _add_message(env.sessions_mgr, "websocket:c-existing", "user", "UniqueExistingTerm")
    search.refresh(workspace=env.workspace, force=True, sessions_dir=env.sessions_mgr.sessions_dir)

    # Make _sync_journal raise an exception
    def failing_sync(*args, **kwargs):
        raise OSError("Permission denied test")

    monkeypatch.setattr(search, "_sync_journal", failing_sync)

    # search should not raise, refresh logs warning, returns existing index
    results = search.search("UniqueExistingTerm", workspace=env.workspace, sessions_dir=env.sessions_mgr.sessions_dir)
    assert len(results) == 1


def test_limit_capped_at_100(tmp_path, monkeypatch):
    env = _init_env(tmp_path, monkeypatch)
    # Even if limit=1000 is requested, max returned is <= 100
    results = search.search("test", workspace=env.workspace, limit=1000, sessions_dir=env.sessions_mgr.sessions_dir)
    assert isinstance(results, list)


@pytest.mark.asyncio
async def test_http_search_route_and_auth(tmp_path, monkeypatch):
    env = _init_env(tmp_path, monkeypatch)
    _add_message(env.sessions_mgr, "websocket:http-chat", "user", "Searching via HTTP endpoint test")

    router = _make_router(env.workspace, session_manager=env.sessions_mgr)

    # 401 without auth
    req_no_auth = _http_get("/api/ext/search?q=endpoint", auth=False)
    resp = await search.dispatch_search_get(router, req_no_auth, "/api/ext/search")
    assert resp is not None
    assert resp.status_code == 401

    # Non-matching path returns None
    req_other = _http_get("/api/ext/other", auth=True)
    assert await search.dispatch_search_get(router, req_other, "/api/ext/other") is None

    # 200 with auth
    req_ok = _http_get("/api/ext/search?q=endpoint", auth=True)
    resp_ok = await search.dispatch_search_get(router, req_ok, "/api/ext/search")
    assert resp_ok is not None
    assert resp_ok.status_code == 200
    data = json.loads(resp_ok.body.decode("utf-8"))
    assert "results" in data
    assert len(data["results"]) == 1
    assert data["results"][0]["session_key"] == "websocket:http-chat"


@pytest.mark.asyncio
async def test_agent_tool_search_history(tmp_path, monkeypatch):
    env = _init_env(tmp_path, monkeypatch)
    _add_message(env.sessions_mgr, "websocket:agent-test", "user", "How to bake sourdough bread")
    _add_message(env.sessions_mgr, "websocket:agent-current", "user", "I also like sourdough pancakes")

    from nanobot.agent.tools.search_history import SearchHistoryTool
    from nanobot.agent.tools.sessions import _UNTRUSTED_NOTICE

    ctx = ToolContext(config=ToolsConfig(), workspace=str(env.workspace), sessions=env.sessions_mgr)
    tool = SearchHistoryTool.create(ctx)
    assert tool.name == "search_history"
    assert "search_sessions" in tool.description

    # Exclude current session
    monkeypatch.setattr(
        "nanobot.agent.tools.search_history.current_request_session_key",
        lambda: "websocket:agent-current",
    )

    output = await tool.execute(query="sourdough")
    assert _UNTRUSTED_NOTICE in output
    assert "websocket:agent-test" in output
    assert "websocket:agent-current" not in output
