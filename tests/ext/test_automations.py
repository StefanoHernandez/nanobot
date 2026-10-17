"""Tests for POST /api/ext/automations/create."""

from __future__ import annotations

import json
import time
from types import SimpleNamespace

import pytest

from nanobot.cron.service import CronService
from nanobot.ext import automations
from nanobot.session.manager import SessionManager

MASTER = "master"


class _Tokens:
    def check_api_token(self, request: object) -> bool:
        headers = getattr(request, "headers", {})
        return headers.get("Authorization") == f"Bearer {MASTER}"


def _sessions(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    return workspace, SessionManager(workspace, sessions_root=tmp_path / "sessions")


def _say(sessions: SessionManager, key: str, role: str, content: str, stamp: str, **extra: object) -> None:
    session = sessions.get_or_create(key)
    session.messages.append({"role": role, "content": content, "timestamp": stamp, **extra})
    sessions.save(session)


def _post(path: str, payload: dict, auth: str | None = f"Bearer {MASTER}"):
    raw = json.dumps(payload).encode("utf-8")

    class _Content:
        @staticmethod
        async def read(_limit: int = 0) -> bytes:
            return raw

    headers = {}
    if auth:
        headers["Authorization"] = auth

    return SimpleNamespace(
        method="POST",
        path=path,
        headers=headers,
        content=_Content(),
    )


async def _fallback(_request):
    raise AssertionError("fallback should not run")


@pytest.fixture(autouse=True)
def _isolate_nanobot_home(tmp_path, monkeypatch):
    """Ensure tests never read or write ~/.nanobot."""
    home_mock = tmp_path / "fake_home"
    home_mock.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("NANOBOT_CONFIG_DIR", str(home_mock / "config"))
    monkeypatch.setenv("NANOBOT_DEVICES_FILE", str(home_mock / "devices.json"))
    monkeypatch.setenv("HOME", str(home_mock))


@pytest.mark.asyncio
async def test_create_automation_cron_schedule(tmp_path):
    workspace, sessions = _sessions(tmp_path)
    _say(sessions, "websocket:chat1", "user", "hello", "2026-10-17T10:00:00")
    cron = CronService(tmp_path / "cron" / "jobs.json")

    handler = automations.automations_post_handler(
        MASTER, _Tokens(), _fallback, cron=cron, sessions=sessions
    )

    body = {
        "name": "Rassegna mattina",
        "message": "Riassumi le notizie su...",
        "schedule": {"kind": "cron", "expr": "0 8 * * *", "tz": "Europe/Rome"},
        "session_key": "websocket:chat1",
    }
    resp = await handler(_post("/api/ext/automations/create", body))
    assert resp.status == 200
    data = json.loads(resp.text)
    assert data["name"] == "Rassegna mattina"
    assert data["payload"]["message"] == "Riassumi le notizie su..."
    assert data["schedule"]["kind"] == "cron"
    assert data["schedule"]["expr"] == "0 8 * * *"
    assert data["schedule"]["tz"] == "Europe/Rome"
    assert data["origin"]["session_key"] == "websocket:chat1"
    assert "chat_binding_revision" in data

    # Verify job in cron store
    jobs = cron.list_jobs(include_disabled=True)
    assert len(jobs) == 1
    assert jobs[0].name == "Rassegna mattina"
    assert jobs[0].payload.session_key == "websocket:chat1"
    assert jobs[0].payload.origin_channel == "websocket"
    assert jobs[0].payload.origin_chat_id == "chat1"


@pytest.mark.asyncio
async def test_create_automation_every_schedule(tmp_path):
    workspace, sessions = _sessions(tmp_path)
    _say(sessions, "websocket:chat2", "user", "hello", "2026-10-17T10:00:00")
    cron = CronService(tmp_path / "cron" / "jobs.json")

    handler = automations.automations_post_handler(
        MASTER, _Tokens(), _fallback, cron=cron, sessions=sessions
    )

    body = {
        "message": "Controlla le notifiche ogni 5 minuti",
        "schedule": {"kind": "every", "every_ms": 300_000},
        "session_key": "websocket:chat2",
    }
    resp = await handler(_post("/api/ext/automations/create", body))
    assert resp.status == 200
    data = json.loads(resp.text)
    # Default name should be first 40 chars of message
    assert data["name"] == "Controlla le notifiche ogni 5 minuti"[:40]
    assert data["schedule"]["kind"] == "every"
    assert data["schedule"]["every_ms"] == 300_000
    assert data["origin"]["session_key"] == "websocket:chat2"


@pytest.mark.asyncio
async def test_create_automation_at_schedule(tmp_path):
    workspace, sessions = _sessions(tmp_path)
    _say(sessions, "websocket:chat3", "user", "hello", "2026-10-17T10:00:00")
    cron = CronService(tmp_path / "cron" / "jobs.json")

    handler = automations.automations_post_handler(
        MASTER, _Tokens(), _fallback, cron=cron, sessions=sessions
    )

    future_ms = int((time.time() + 3600) * 1000)
    body = {
        "name": "Promemoria unico",
        "message": "Ricordati di spedire il pacco",
        "schedule": {"kind": "at", "at_ms": future_ms},
        "session_key": "websocket:chat3",
    }
    resp = await handler(_post("/api/ext/automations/create", body))
    assert resp.status == 200
    data = json.loads(resp.text)
    assert data["name"] == "Promemoria unico"
    assert data["schedule"]["kind"] == "at"
    assert data["schedule"]["at_ms"] == future_ms
    assert data["delete_after_run"] is True


@pytest.mark.asyncio
async def test_rejects_past_at(tmp_path):
    workspace, sessions = _sessions(tmp_path)
    _say(sessions, "websocket:chat1", "user", "hello", "2026-10-17T10:00:00")
    cron = CronService(tmp_path / "cron" / "jobs.json")

    handler = automations.automations_post_handler(
        MASTER, _Tokens(), _fallback, cron=cron, sessions=sessions
    )

    past_ms = int((time.time() - 3600) * 1000)
    body = {
        "message": "Nel passato",
        "schedule": {"kind": "at", "at_ms": past_ms},
        "session_key": "websocket:chat1",
    }
    resp = await handler(_post("/api/ext/automations/create", body))
    assert resp.status == 400
    data = json.loads(resp.text)
    assert data["error"] == "invalid_schedule"


@pytest.mark.asyncio
async def test_rejects_every_under_a_minute(tmp_path):
    workspace, sessions = _sessions(tmp_path)
    _say(sessions, "websocket:chat1", "user", "hello", "2026-10-17T10:00:00")
    cron = CronService(tmp_path / "cron" / "jobs.json")

    handler = automations.automations_post_handler(
        MASTER, _Tokens(), _fallback, cron=cron, sessions=sessions
    )

    body = {
        "message": "Troppo frequente",
        "schedule": {"kind": "every", "every_ms": 30_000},
        "session_key": "websocket:chat1",
    }
    resp = await handler(_post("/api/ext/automations/create", body))
    assert resp.status == 400
    data = json.loads(resp.text)
    assert data["error"] == "invalid_schedule"


@pytest.mark.asyncio
async def test_rejects_empty_message(tmp_path):
    workspace, sessions = _sessions(tmp_path)
    _say(sessions, "websocket:chat1", "user", "hello", "2026-10-17T10:00:00")
    cron = CronService(tmp_path / "cron" / "jobs.json")

    handler = automations.automations_post_handler(
        MASTER, _Tokens(), _fallback, cron=cron, sessions=sessions
    )

    for empty in ("", "   ", None):
        body = {
            "message": empty,
            "schedule": {"kind": "every", "every_ms": 60_000},
            "session_key": "websocket:chat1",
        }
        resp = await handler(_post("/api/ext/automations/create", body))
        assert resp.status == 400
        data = json.loads(resp.text)
        assert data["error"] == "invalid_message"


@pytest.mark.asyncio
async def test_rejects_unknown_chat(tmp_path):
    workspace, sessions = _sessions(tmp_path)
    cron = CronService(tmp_path / "cron" / "jobs.json")

    handler = automations.automations_post_handler(
        MASTER, _Tokens(), _fallback, cron=cron, sessions=sessions
    )

    body = {
        "message": "Chat inesistente",
        "schedule": {"kind": "every", "every_ms": 60_000},
        "session_key": "websocket:nonexistent",
    }
    resp = await handler(_post("/api/ext/automations/create", body))
    assert resp.status == 400
    data = json.loads(resp.text)
    assert data["error"] == "invalid_chat"


@pytest.mark.asyncio
async def test_rejects_temporary_chat(tmp_path):
    workspace, sessions = _sessions(tmp_path)
    # Create transient (temporary) session
    sessions.get_or_create_transient("websocket:temp1")
    cron = CronService(tmp_path / "cron" / "jobs.json")

    handler = automations.automations_post_handler(
        MASTER, _Tokens(), _fallback, cron=cron, sessions=sessions
    )

    body = {
        "message": "Chat temporanea",
        "schedule": {"kind": "every", "every_ms": 60_000},
        "session_key": "websocket:temp1",
    }
    resp = await handler(_post("/api/ext/automations/create", body))
    assert resp.status == 400
    data = json.loads(resp.text)
    assert data["error"] == "invalid_chat"


@pytest.mark.asyncio
async def test_rejects_non_websocket_chat(tmp_path):
    workspace, sessions = _sessions(tmp_path)
    _say(sessions, "telegram:12345", "user", "hello", "2026-10-17T10:00:00")
    cron = CronService(tmp_path / "cron" / "jobs.json")

    handler = automations.automations_post_handler(
        MASTER, _Tokens(), _fallback, cron=cron, sessions=sessions
    )

    body = {
        "message": "Chat telegram",
        "schedule": {"kind": "every", "every_ms": 60_000},
        "session_key": "telegram:12345",
    }
    resp = await handler(_post("/api/ext/automations/create", body))
    assert resp.status == 400
    data = json.loads(resp.text)
    assert data["error"] == "invalid_chat"


@pytest.mark.asyncio
async def test_rejects_unauthorized(tmp_path):
    workspace, sessions = _sessions(tmp_path)
    cron = CronService(tmp_path / "cron" / "jobs.json")

    handler = automations.automations_post_handler(
        MASTER, _Tokens(), _fallback, cron=cron, sessions=sessions
    )

    body = {
        "message": "Non autorizzato",
        "schedule": {"kind": "every", "every_ms": 60_000},
        "session_key": "websocket:chat1",
    }
    resp = await handler(_post("/api/ext/automations/create", body, auth="Bearer wrong"))
    assert resp.status == 401
    data = json.loads(resp.text)
    assert data["error"] == "unauthorized"


@pytest.mark.asyncio
async def test_cron_unavailable(tmp_path):
    workspace, sessions = _sessions(tmp_path)
    _say(sessions, "websocket:chat1", "user", "hello", "2026-10-17T10:00:00")

    handler = automations.automations_post_handler(
        MASTER, _Tokens(), _fallback, cron=None, sessions=sessions
    )

    body = {
        "message": "Senza cron",
        "schedule": {"kind": "every", "every_ms": 60_000},
        "session_key": "websocket:chat1",
    }
    resp = await handler(_post("/api/ext/automations/create", body))
    assert resp.status == 503
    data = json.loads(resp.text)
    assert data["error"] == "unavailable"


@pytest.mark.asyncio
async def test_register_automations_routes(tmp_path):
    workspace, sessions = _sessions(tmp_path)
    _say(sessions, "websocket:chat1", "user", "hello", "2026-10-17T10:00:00")
    cron = CronService(tmp_path / "cron" / "jobs.json")

    async def mock_upload_handle(request):
        return SimpleNamespace(status=404, headers={}, force_close=lambda: None, text='{"error":"not_found"}')

    uploads = SimpleNamespace(handle=mock_upload_handle)
    ws_channel = SimpleNamespace(
        config=SimpleNamespace(token_issue_secret="", token=MASTER),
        gateway=SimpleNamespace(tokens=_Tokens()),
        _uploads=uploads,
    )
    channels = SimpleNamespace(channels={"websocket": ws_channel})

    automations.register_automations_routes(channels, cron=cron, sessions=sessions)
    assert uploads.handle != mock_upload_handle

    body = {
        "message": "Via registered route",
        "schedule": {"kind": "every", "every_ms": 60_000},
        "session_key": "websocket:chat1",
    }
    resp = await uploads.handle(_post("/api/ext/automations/create", body))
    assert resp.status == 200
    data = json.loads(resp.text)
    assert data["name"] == "Via registered route"[:40]

