"""Server-side backups of the nanobot home (fork extension).

Archives stay on the server (``~/nanobot-backups`` next to ``~/.nanobot``); they are never
downloaded, because the home holds API keys and the server secret. SQLite files are
copied with the online backup API so a live database is never archived half-written.

Restore moves the current home aside (``<home>.pre-restore-<stamp>``), unpacks the
archive in its place and asks for a gateway restart.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import sqlite3
import tarfile
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, cast

from aiohttp import web
from loguru import logger
from websockets.http11 import Request as WsRequest
from websockets.http11 import Response

from nanobot.ext.devices import DeviceError, admin_authorized, read_json, router_admin_authorized
from nanobot.webui.http_utils import http_error, http_json_response

PREFIX = "/api/ext/backup"
MAX_BACKUPS = 10
SKIP_DIRS = {"logs"}
SKIP_SUFFIXES = ("-wal", "-shm", "-journal", ".lock")
_NAME = re.compile(r"^nanobot-\d{8}-\d{6}\.tar\.gz$")
_SQLITE_MAGIC = b"SQLite format 3\x00"
_lock = threading.Lock()


class BackupError(Exception):
    def __init__(self, status: int, code: str) -> None:
        super().__init__(code)
        self.status = status
        self.code = code


def home_dir() -> Path:
    from nanobot.config.paths import get_data_dir

    return get_data_dir()


def backup_settings_path() -> Path:
    return home_dir() / "backup.json"


def _load_backup_dir_from_settings() -> Path | None:
    path = backup_settings_path()
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            dict_data = cast(dict[str, Any], data)
            raw = dict_data.get("dir")
            if isinstance(raw, str) and raw.strip():
                p = Path(raw.strip()).expanduser()
                if p.is_absolute():
                    return p
    except Exception:
        return None
    return None


def backup_dir() -> Path:
    raw = os.environ.get("NANOBOT_BACKUP_DIR", "").strip()
    if raw:
        return Path(raw).expanduser()
    from_file = _load_backup_dir_from_settings()
    if from_file is not None:
        return from_file
    return home_dir().parent / "nanobot-backups"


def _workspace_dir() -> Path | None:
    """The workspace set explicitly in home's config.json; None means the default, inside home."""
    try:
        data = json.loads((home_dir() / "config.json").read_text(encoding="utf-8"))
        raw = data["agents"]["defaults"]["workspace"]
    except (OSError, ValueError, KeyError, TypeError):
        return None
    return Path(raw).expanduser().resolve() if isinstance(raw, str) and raw.strip() else None


def _add_tree(tar: tarfile.TarFile, src: Path, prefix: str, skip: Path) -> None:
    for dirpath, dirnames, filenames in os.walk(src):
        rel_dir = Path(dirpath).relative_to(src)
        if rel_dir == Path("."):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        dirnames[:] = [d for d in dirnames if Path(dirpath, d).resolve() != skip]
        dirnames.sort()
        for name in sorted(filenames):
            path = Path(dirpath) / name
            if name.endswith(SKIP_SUFFIXES) or path.is_symlink() or not path.is_file():
                continue
            arcname = prefix + str(rel_dir / name)
            if _is_sqlite(path):
                _add_sqlite(tar, path, arcname)
            else:
                tar.add(path, arcname=arcname, recursive=False)


def validate_and_save_backup_dir(raw_dir: object) -> Path:
    if not isinstance(raw_dir, str) or not raw_dir.strip():
        raise BackupError(400, "invalid_dir")
    p = Path(raw_dir.strip())
    if not p.is_absolute():
        raise BackupError(400, "invalid_dir")

    home = home_dir().resolve()
    resolved = p.resolve()

    if resolved == home or resolved.is_relative_to(home):
        raise BackupError(400, "invalid_dir")

    ws = _workspace_dir()
    if ws is not None:
        ws_resolved = ws.resolve()
        if resolved == ws_resolved or resolved.is_relative_to(ws_resolved):
            raise BackupError(400, "invalid_dir")

    if not p.exists():
        try:
            p.mkdir(parents=True, exist_ok=True)
        except OSError:
            raise BackupError(400, "invalid_dir") from None
    elif not p.is_dir():
        raise BackupError(400, "invalid_dir")

    test_file = p / f".write_test_{os.getpid()}_{int(time.time() * 1000)}"
    try:
        test_file.touch()
        test_file.unlink(missing_ok=True)
    except OSError:
        raise BackupError(400, "invalid_dir") from None

    path = backup_settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"dir": str(p)}), encoding="utf-8")
    return p


def _is_sqlite(path: Path) -> bool:
    try:
        with path.open("rb") as fh:
            return fh.read(16) == _SQLITE_MAGIC
    except OSError:
        return False


def _add_sqlite(tar: tarfile.TarFile, path: Path, arcname: str) -> None:
    fd, tmp = tempfile.mkstemp(suffix=".sqlite3")
    os.close(fd)
    try:
        src = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True, timeout=5)
        dst = sqlite3.connect(tmp)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
        tar.add(tmp, arcname=arcname, recursive=False)
    finally:
        Path(tmp).unlink(missing_ok=True)


def _entry(path: Path) -> dict[str, Any]:
    st = path.stat()
    return {"name": path.name, "size": st.st_size, "created_at": int(st.st_mtime * 1000)}


def list_backups() -> list[dict[str, Any]]:
    root = backup_dir()
    if not root.is_dir():
        return []
    items = [_entry(p) for p in root.iterdir() if p.is_file() and _NAME.match(p.name)]
    return sorted(items, key=lambda b: b["name"], reverse=True)


def create_backup() -> dict[str, Any]:
    home, root = home_dir(), backup_dir()
    with _lock:
        root.mkdir(parents=True, exist_ok=True)
        os.chmod(root, 0o700)
        target = root / time.strftime("nanobot-%Y%m%d-%H%M%S.tar.gz")
        if target.exists():
            raise BackupError(409, "backup_in_progress")
        part = target.with_name(target.name + ".part")
        fd = os.open(part, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            with os.fdopen(fd, "wb") as fh, tarfile.open(fileobj=fh, mode="w:gz") as tar:
                _add_tree(tar, home, "", root.resolve())
                ws = _workspace_dir()
                if ws is not None and ws.is_dir() and not ws.is_relative_to(home.resolve()):
                    _add_tree(tar, ws, "workspace-external/", root.resolve())
            os.replace(part, target)
        except BaseException:
            part.unlink(missing_ok=True)
            raise
        for old in list_backups()[MAX_BACKUPS:]:
            (root / old["name"]).unlink(missing_ok=True)
    return _entry(target)


def _path(name: Any) -> Path:
    if not isinstance(name, str) or not _NAME.match(name):
        raise BackupError(400, "invalid_name")
    path = backup_dir() / name
    if not path.is_file():
        raise BackupError(404, "not_found")
    return path


def delete_backup(name: Any) -> None:
    with _lock:
        _path(name).unlink()


def _safe_members(tar: tarfile.TarFile) -> list[tarfile.TarInfo]:
    members = tar.getmembers()
    for m in members:
        parts = Path(m.name).parts
        if m.name.startswith("/") or ".." in parts or not (m.isfile() or m.isdir()):
            raise BackupError(400, "unsafe_archive")
    return members


def restore_backup(name: Any) -> dict[str, Any]:
    home = home_dir()
    with _lock:
        archive = _path(name)
        aside = home.with_name(f"{home.name}.pre-restore-{time.strftime('%Y%m%d-%H%M%S')}")
        staging = Path(tempfile.mkdtemp(dir=home.parent, prefix=f".{home.name}.restore-"))

        ws = _workspace_dir()
        ws_is_external = ws is not None and ws.is_dir() and not ws.is_relative_to(home.resolve())
        staging_ws: Path | None = None
        aside_ws: Path | None = None

        try:
            with tarfile.open(archive, "r:gz") as tar:
                members = _safe_members(tar)
                if not any(m.name == "config.json" for m in members):
                    raise BackupError(400, "not_a_nanobot_backup")

                home_members = [m for m in members if not m.name.startswith("workspace-external/")]
                ws_members = [m for m in members if m.name.startswith("workspace-external/")]

                if hasattr(tarfile, "data_filter"):
                    tar.extractall(staging, members=home_members, filter="data")
                else:
                    tar.extractall(staging, members=home_members)

                if ws_members and ws_is_external and ws is not None:
                    staging_ws = Path(tempfile.mkdtemp(dir=ws.parent, prefix=f".{ws.name}.restore-"))
                    for m in ws_members:
                        m.name = m.name[len("workspace-external/") :]
                    if hasattr(tarfile, "data_filter"):
                        tar.extractall(staging_ws, members=ws_members, filter="data")
                    else:
                        tar.extractall(staging_ws, members=ws_members)

            os.chmod(staging, 0o700)
            home.rename(aside)
            staging.rename(home)

            if staging_ws is not None and ws is not None:
                os.chmod(staging_ws, 0o700)
                aside_ws = ws.with_name(f"{ws.name}.pre-restore-{time.strftime('%Y%m%d-%H%M%S')}")
                ws.rename(aside_ws)
                staging_ws.rename(ws)
        except BaseException:
            shutil.rmtree(staging, ignore_errors=True)
            if staging_ws is not None:
                shutil.rmtree(staging_ws, ignore_errors=True)
            raise
    return {"ok": True, "restored": archive.name, "previous": aside.name, "restart_required": True}


def _payload() -> dict[str, Any]:
    home = home_dir()
    bdir = backup_dir()
    usage_target = bdir if bdir.is_dir() else home
    usage = shutil.disk_usage(usage_target)
    return {
        "workspace_included": True,
        "backups": list_backups(),
        "max_backups": MAX_BACKUPS,
        "dir": str(bdir).replace(str(Path.home()), "~", 1),
        "disk_free": usage.free,
    }


def dispatch_backup_get(router: Any, request: WsRequest, got: str) -> Response | None:
    if got != PREFIX:
        return None
    secret = router.config.token_issue_secret.strip() or router.config.token.strip()
    if not router_admin_authorized(secret, router, request):
        return http_error(401, "Unauthorized")
    return http_json_response(_payload(), extra_headers=[("Cache-Control", "no-store")])


async def _handle_post(secret: str, tokens: Any, request: web.BaseRequest) -> web.StreamResponse:
    if request.method != "POST":
        return web.json_response({"error": "method_not_allowed"}, status=405)
    if not admin_authorized(secret, tokens, request):
        return web.json_response({"error": "unauthorized"}, status=401)
    try:
        body = await read_json(request)
        if request.path == PREFIX + "/settings":
            saved = await asyncio.to_thread(validate_and_save_backup_dir, body.get("dir"))
            return web.json_response({"ok": True, "dir": str(saved)})
        if request.path == PREFIX + "/create":
            return web.json_response({"backup": await asyncio.to_thread(create_backup)})
        if request.path == PREFIX + "/delete":
            await asyncio.to_thread(delete_backup, body.get("name"))
            return web.json_response({"ok": True})
        if request.path == PREFIX + "/restore":
            if body.get("confirm") is not True:
                return web.json_response({"error": "confirm_required"}, status=400)
            return web.json_response(await asyncio.to_thread(restore_backup, body.get("name")))
    except (DeviceError, BackupError) as exc:
        return web.json_response({"error": exc.code}, status=exc.status)
    except (OSError, tarfile.TarError, sqlite3.Error):
        logger.exception("backup operation failed")
        return web.json_response({"error": "backup_failed"}, status=500)
    return web.json_response({"error": "not_found"}, status=404)


def backup_post_handler(secret: str, tokens: Any, fallback: Any) -> Any:
    async def handler(request: web.BaseRequest) -> web.StreamResponse:
        path = request.path
        if path != PREFIX and not path.startswith(PREFIX + "/"):
            return await fallback(request)
        response = await _handle_post(secret, tokens, request)
        response.headers["Cache-Control"] = "no-store"
        response.force_close()
        return response

    return handler
