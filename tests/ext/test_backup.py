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


def _post(path, body, auth):
    raw = json.dumps(body).encode("utf-8")

    class _Content:
        @staticmethod
        async def read(_limit: int) -> bytes:
            return raw

    headers = {"Content-Type": "application/json"}
    if auth:
        headers["Authorization"] = f"Bearer {auth}"
    return SimpleNamespace(method="POST", path=bk.PREFIX + path, headers=headers,
                           content_length=len(raw), content=_Content())


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
