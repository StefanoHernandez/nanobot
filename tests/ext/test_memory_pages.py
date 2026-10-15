"""Memory pages fork module: payload and GET dispatch."""

import json
from types import SimpleNamespace

from websockets.datastructures import Headers
from websockets.http11 import Request as WsRequest

from nanobot.ext import memory_pages as mp
from nanobot.utils.gitstore import GitStore

TOKEN = "api-token-test"
TRACKED = ["SOUL.md", "USER.md", "memory/MEMORY.md", "memory/.dream_cursor"]


class _Tokens:
    def check_api_token(self, request):
        return request.headers.get("Authorization") == f"Bearer {TOKEN}"


def _router(tmp_path):
    return SimpleNamespace(tokens=_Tokens(), skills_workspace_path=tmp_path)


def _get(path: str, *, auth=True):
    headers = [("Authorization", f"Bearer {TOKEN}")] if auth else []
    return WsRequest(path, Headers(headers))


def _json(resp):
    return json.loads(resp.body.decode("utf-8"))


def test_missing_files_empty_latest_and_dream_echoed(tmp_path):
    payload = mp.pages_payload(tmp_path, enabled=True, schedule="every 2h")
    assert payload["dream"] == {"enabled": True, "schedule": "every 2h"}
    assert payload["latest"] is None
    for key in ("user", "memory", "soul"):
        assert payload["pages"][key] == {"text": "", "truncated": False}


def test_existing_pages_round_trip_and_truncation(tmp_path):
    tmp_path.joinpath("USER.md").write_text("user body", encoding="utf-8")
    tmp_path.joinpath("SOUL.md").write_text("soul body", encoding="utf-8")
    memory_dir = tmp_path / "memory"
    memory_dir.mkdir()
    memory_dir.joinpath("MEMORY.md").write_text("memory body", encoding="utf-8")

    payload = mp.pages_payload(tmp_path, enabled=False, schedule="off")
    assert payload["pages"]["user"]["text"] == "user body"
    assert payload["pages"]["memory"]["text"] == "memory body"
    assert payload["pages"]["soul"]["text"] == "soul body"
    assert all(not payload["pages"][k]["truncated"] for k in ("user", "memory", "soul"))

    long_text = "x" * (100_000 + 50)
    tmp_path.joinpath("USER.md").write_text(long_text, encoding="utf-8")
    payload = mp.pages_payload(tmp_path, enabled=False, schedule="off")
    assert len(payload["pages"]["user"]["text"]) == 100_000
    assert payload["pages"]["user"]["truncated"] is True


def test_latest_dream_commit_without_sha(tmp_path):
    git = GitStore(tmp_path, tracked_files=TRACKED)
    git.init()
    tmp_path.joinpath("SOUL.md").write_text("before", encoding="utf-8")
    git.auto_commit("init follow-up")
    tmp_path.joinpath("SOUL.md").write_text("after dream", encoding="utf-8")
    git.auto_commit("dream: nightly consolidation")

    payload = mp.pages_payload(tmp_path, enabled=True, schedule="every 2h")
    latest = payload["latest"]
    assert latest is not None
    assert latest["subject"] == "dream: nightly consolidation"
    assert latest["time"]
    assert "after dream" in latest["diff"] or latest["diff"] != ""
    assert latest["truncated"] is False
    assert "sha" not in latest


def test_dispatch_memory_get_routes(tmp_path, monkeypatch):
    dream = SimpleNamespace(enabled=True, describe_schedule=lambda: "every 2h")
    config = SimpleNamespace(agents=SimpleNamespace(defaults=SimpleNamespace(dream=dream)))

    def fake_load_config():
        return config

    monkeypatch.setattr("nanobot.config.loader.load_config", fake_load_config)

    router = _router(tmp_path)
    tmp_path.joinpath("USER.md").write_text("hello", encoding="utf-8")

    assert mp.dispatch_memory_get(router, _get("/api/other"), "/api/other") is None
    path = mp.PATH
    assert mp.dispatch_memory_get(router, _get(path, auth=False), path).status_code == 401

    resp = mp.dispatch_memory_get(router, _get(path), path)
    body = _json(resp)
    assert body["dream"] == {"enabled": True, "schedule": "every 2h"}
    assert body["pages"]["user"]["text"] == "hello"
    assert any(k.lower() == "cache-control" and v == "no-store" for k, v in resp.headers.raw_items())


def test_symlink_outside_workspace_is_not_read(tmp_path):
    workspace = tmp_path / "ws"
    workspace.mkdir()
    outside = tmp_path / "secret.txt"
    outside.write_text("SECRET_OUTSIDE", encoding="utf-8")
    (workspace / "USER.md").symlink_to(outside)

    payload = mp.pages_payload(workspace, enabled=False, schedule="every 2h")
    assert "SECRET_OUTSIDE" not in json.dumps(payload)
    assert payload["pages"]["user"]["text"] == ""


def test_history_jsonl_not_exposed_in_payload(tmp_path):
    memory_dir = tmp_path / "memory"
    memory_dir.mkdir()
    secret = "HISTORY_JSONL_LEAK_MARKER_9f3a2b1c"
    memory_dir.joinpath("history.jsonl").write_text(
        json.dumps({"content": secret}) + "\n",
        encoding="utf-8",
    )
    memory_dir.joinpath("MEMORY.md").write_text("visible memory", encoding="utf-8")

    payload = mp.pages_payload(tmp_path, enabled=False, schedule="cron")
    blob = json.dumps(payload)
    assert secret not in blob
    assert payload["pages"]["memory"]["text"] == "visible memory"
