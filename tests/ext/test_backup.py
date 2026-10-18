"""Server-side backups of the nanobot home."""

from __future__ import annotations

import io
import json
import sqlite3
import sys
import tarfile
from types import SimpleNamespace

import pytest

from nanobot.ext import backup as bk

# The server is Linux (Arduino UNO Q); Windows cannot rename a home holding open files.
pytestmark = pytest.mark.skipif(sys.platform == "win32", reason="POSIX-only backups")


@pytest.fixture
def home(tmp_path, monkeypatch):
    h = tmp_path / ".nanobot"
    (h / "workspace" / "projects" / "p1").mkdir(parents=True)
    (h / "logs").mkdir()
    (h / "config.json").write_text('{"v": 1}')
    (h / "config.json.lock").write_text("")
    (h / "logs" / "gateway.log").write_text("noise")
    (h / "workspace" / "projects" / "p1" / "notes.md").write_text("hello")
    db = sqlite3.connect(h / "kanban.db")
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("CREATE TABLE t (x)")
    db.execute("INSERT INTO t VALUES (42)")
    db.commit()  # left open: a live database with a WAL file
    monkeypatch.setattr(bk, "home_dir", lambda: h)
    monkeypatch.delenv("NANOBOT_BACKUP_DIR", raising=False)
    yield h
    db.close()


def _names(path):
    with tarfile.open(path) as tar:
        return sorted(tar.getnames())


def test_create_skips_logs_locks_and_wal(home):
    entry = bk.create_backup()
    archive = bk.backup_dir() / entry["name"]
    assert archive.parent == home.parent / "nanobot-backups"
    assert archive.stat().st_mode & 0o777 == 0o600
    assert _names(archive) == ["config.json", "kanban.db", "workspace/projects/p1/notes.md"]
    with tarfile.open(archive) as tar:
        out = home.parent / "x"
        tar.extract("kanban.db", out)
    assert sqlite3.connect(out / "kanban.db").execute("SELECT x FROM t").fetchone() == (42,)


def test_rotation_keeps_newest(home, monkeypatch):
    monkeypatch.setattr(bk, "MAX_BACKUPS", 2)
    stamps = iter(["nanobot-20260101-000001.tar.gz", "nanobot-20260101-000002.tar.gz",
                   "nanobot-20260101-000003.tar.gz"])
    monkeypatch.setattr(bk.time, "strftime", lambda _fmt: next(stamps))
    for _ in range(3):
        bk.create_backup()
    assert [b["name"] for b in bk.list_backups()] == [
        "nanobot-20260101-000003.tar.gz", "nanobot-20260101-000002.tar.gz"]


def test_restore_swaps_home_and_keeps_previous(home):
    name = bk.create_backup()["name"]
    (home / "config.json").write_text('{"v": 2}')
    (home / "new.txt").write_text("after backup")
    result = bk.restore_backup(name)
    assert result["restart_required"] is True
    assert json.loads((home / "config.json").read_text()) == {"v": 1}
    assert not (home / "new.txt").exists()
    previous = home.parent / result["previous"]
    assert (previous / "new.txt").read_text() == "after backup"


def _write_archive(path, members):
    with tarfile.open(path, "w:gz") as tar:
        for name, data in members:
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))


@pytest.mark.parametrize("members", [
    [("config.json", b"{}"), ("../escape.txt", b"x")],
    [("/etc/evil", b"x"), ("config.json", b"{}")],
    [("notes.md", b"x")],  # no config.json: not a nanobot backup
])
def test_restore_refuses_bad_archives(home, members):
    root = bk.backup_dir()
    root.mkdir()
    _write_archive(root / "nanobot-20260101-000000.tar.gz", members)
    with pytest.raises(bk.BackupError):
        bk.restore_backup("nanobot-20260101-000000.tar.gz")
    assert json.loads((home / "config.json").read_text()) == {"v": 1}  # home untouched
    assert not (home.parent / "escape.txt").exists()


def test_names_are_validated(home):
    for bad in ("../x.tar.gz", "nanobot-1.tar.gz", None):
        with pytest.raises(bk.BackupError):
            bk.delete_backup(bad)


def _post(
    path: str,
    body: dict,
    auth: str | None = None,
    *,
    remote: str = "127.0.0.1",
    host: str = "127.0.0.1:8765",
):
    raw = json.dumps(body).encode("utf-8")

    class _Content:
        @staticmethod
        async def read(_limit: int = 0) -> bytes:
            return raw

    headers = {"Content-Type": "application/json"}
    if host:
        headers["Host"] = host
    if auth:
        headers["Authorization"] = f"Bearer {auth}"
    return SimpleNamespace(
        method="POST",
        path=bk.PREFIX + path,
        headers=headers,
        content_length=len(raw),
        content=_Content(),
        remote=remote,
    )



class _Tokens:
    def check_api_token(self, request):
        return request.headers.get("Authorization") == "Bearer api"


async def _fallback(_request):
    raise AssertionError("fallback should not run")


async def test_http_create_and_restore_needs_confirm(home):
    handler = bk.backup_post_handler("master", _Tokens(), _fallback)
    assert (await handler(_post("/create", {}, None))).status == 401
    created = await handler(_post("/create", {}, "api"))
    name = json.loads(created.text)["backup"]["name"]
    assert (await handler(_post("/restore", {"name": name}, "api"))).status == 400
    assert (await handler(_post("/restore", {"name": name, "confirm": True}, "api"))).status == 200


@pytest.mark.asyncio
async def test_backup_settings_route_validation(home, tmp_path, monkeypatch):
    handler = bk.backup_post_handler("master", _Tokens(), _fallback)
    # relative
    res = await handler(_post("/settings", {"dir": "relative/path"}, "api"))
    assert res.status == 400
    assert json.loads(res.text)["error"] == "invalid_dir"

    # inside home
    res = await handler(_post("/settings", {"dir": str(home / "sub")}, "api"))
    assert res.status == 400
    assert json.loads(res.text)["error"] == "invalid_dir"

    # inside workspace
    ws = tmp_path / "workspace"
    ws.mkdir()
    monkeypatch.setattr(bk, "_workspace_dir", lambda: ws)
    res = await handler(_post("/settings", {"dir": str(ws / "sub")}, "api"))
    assert res.status == 400
    assert json.loads(res.text)["error"] == "invalid_dir"

    # not writable (file path or unwritable parent)
    unwritable = tmp_path / "read_only"
    unwritable.mkdir()
    unwritable.chmod(0o500)
    try:
        res = await handler(_post("/settings", {"dir": str(unwritable / "deep" / "backup")}, "api"))
        assert res.status == 400
        assert json.loads(res.text)["error"] == "invalid_dir"
    finally:
        unwritable.chmod(0o700)

    # valid
    sd = tmp_path / "sd" / "backups"
    res = await handler(_post("/settings", {"dir": str(sd)}, "api"))
    assert res.status == 200
    assert bk.backup_dir().resolve() == sd.resolve()
    assert json.loads((home / "backup.json").read_text()) == {"dir": str(sd)}


def test_backup_with_external_workspace_contains_memory_git(home, tmp_path, monkeypatch):
    ws = tmp_path / "external_workspace"
    (ws / "memory" / ".git").mkdir(parents=True)
    (ws / "memory" / ".git" / "HEAD").write_text("ref: refs/heads/main\n")
    (ws / "docs").mkdir()
    (ws / "docs" / "plan.md").write_text("my external plan")
    monkeypatch.setattr(bk, "_workspace_dir", lambda: ws)

    entry = bk.create_backup()
    archive = bk.backup_dir() / entry["name"]
    names = _names(archive)
    assert "workspace-external/docs/plan.md" in names
    assert "workspace-external/memory/.git/HEAD" in names


def test_max_backups_still_prunes_in_new_dir(home, tmp_path, monkeypatch):
    new_dir = tmp_path / "new_backup_dir"
    bk.validate_and_save_backup_dir(str(new_dir))
    assert bk.backup_dir().resolve() == new_dir.resolve()

    monkeypatch.setattr(bk, "MAX_BACKUPS", 2)
    stamps = iter(["nanobot-20260101-000001.tar.gz", "nanobot-20260101-000002.tar.gz",
                   "nanobot-20260101-000003.tar.gz"])
    monkeypatch.setattr(bk.time, "strftime", lambda _fmt: next(stamps))
    for _ in range(3):
        bk.create_backup()

    items = bk.list_backups()
    assert [b["name"] for b in items] == [
        "nanobot-20260101-000003.tar.gz", "nanobot-20260101-000002.tar.gz"]
    assert len(list(new_dir.glob("nanobot-*.tar.gz"))) == 2


@pytest.mark.asyncio
async def test_backup_privileged_routes(home, tmp_path, monkeypatch):
    from nanobot.ext import devices as dev
    from nanobot.webui.gateway_tokens import GatewayTokenStore

    devices_path = tmp_path / "devices.json"
    monkeypatch.setenv("NANOBOT_DEVICES_FILE", str(devices_path))

    store = GatewayTokenStore()
    code, _ = dev.create_pairing_code(devices_path)
    _, plain_id, _ = dev.claim_pairing_code(code, "plain-phone", devices_path)
    plain_api = store.issue_api_token(300)
    dev.remember_device_tokens(plain_id, store, plain_api)

    code2, _ = dev.create_pairing_code(devices_path)
    _, fp_id, _ = dev.claim_pairing_code(code2, "fp-phone", devices_path)
    fp_api = store.issue_api_token(300)
    dev.remember_device_tokens(fp_id, store, fp_api)
    dev.set_full_power(fp_id, True, devices_path)

    handler = bk.backup_post_handler("master", store, _fallback)

    # /create stays open to any authorized device (plain device token succeeds)
    create_req = _post("/create", {}, plain_api, remote="100.64.0.1", host="nanobot.remote:8765")
    created = await handler(create_req)
    assert created.status == 200
    assert "name" in json.loads(created.text)["backup"]

    target_dir = tmp_path / "custom_backups"

    # --- /settings ---
    denied = await handler(_post("/settings", {"dir": str(target_dir)}, plain_api, remote="100.64.0.1", host="nanobot.remote:8765"))
    assert denied.status == 403 and json.loads(denied.text) == {"error": "full_power_required"}
    allowed_fp = await handler(_post("/settings", {"dir": str(target_dir)}, fp_api, remote="100.64.0.2", host="nanobot.remote:8765"))
    assert allowed_fp.status == 200
    allowed_local = await handler(_post("/settings", {"dir": str(target_dir)}, "master", remote="127.0.0.1", host="127.0.0.1:8765"))
    assert allowed_local.status == 200

    stamps = iter([f"20260101-00000{i}" for i in range(10)])
    monkeypatch.setattr(bk.time, "strftime", lambda _fmt: next(stamps))

    # Create archives in target_dir for restore and delete tests
    b1 = "nanobot-20260101-000001.tar.gz"
    b2 = "nanobot-20260101-000002.tar.gz"
    b3 = "nanobot-20260101-000003.tar.gz"
    members = [("config.json", b"{}"), ("backup.json", json.dumps({"dir": str(target_dir)}).encode())]
    _write_archive(target_dir / b1, members)
    _write_archive(target_dir / b2, members)
    _write_archive(target_dir / b3, members)

    # --- /restore ---
    denied = await handler(_post("/restore", {"name": b1, "confirm": True}, plain_api, remote="100.64.0.1", host="nanobot.remote:8765"))
    assert denied.status == 403 and json.loads(denied.text) == {"error": "full_power_required"}
    allowed_fp = await handler(_post("/restore", {"name": b1, "confirm": True}, fp_api, remote="100.64.0.2", host="nanobot.remote:8765"))
    assert allowed_fp.status == 200
    allowed_local = await handler(_post("/restore", {"name": b1, "confirm": True}, "master", remote="127.0.0.1", host="127.0.0.1:8765"))
    assert allowed_local.status == 200

    # --- /delete ---
    denied = await handler(_post("/delete", {"name": b2}, plain_api, remote="100.64.0.1", host="nanobot.remote:8765"))
    assert denied.status == 403 and json.loads(denied.text) == {"error": "full_power_required"}
    allowed_fp = await handler(_post("/delete", {"name": b2}, fp_api, remote="100.64.0.2", host="nanobot.remote:8765"))
    assert allowed_fp.status == 200
    allowed_local = await handler(_post("/delete", {"name": b3}, "master", remote="127.0.0.1", host="127.0.0.1:8765"))
    assert allowed_local.status == 200




