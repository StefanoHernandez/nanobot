"""Projects: a folder per project with instructions (AGENTS.md) and files.

Design: mobile/docs/superpowers/specs/2026-10-15-projects-design.md.

A project chat is a normal chat whose workspace scope points at the project
folder; nanobot then loads that folder's AGENTS.md as project instructions.
This module only manages the folders and exposes them over HTTP:

* GET routes through ``dispatch_projects_get`` (hooked in ``GatewayHTTPHandler``);
* POST routes through ``projects_post_handler`` (wraps the body-capable bridge
  handler, which upstream uses only for ``/api/attachments``).
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import secrets
import shutil
import time
import unicodedata
from collections.abc import AsyncIterable, Awaitable, Callable
from pathlib import Path
from typing import Any, cast
from urllib.parse import unquote

from aiohttp import web
from websockets.http11 import Request as WsRequest
from websockets.http11 import Response

from nanobot.webui.http_utils import (
    case_insensitive_header,
    http_error,
    http_json_response,
    http_response,
    parse_request_path,
    query_first,
)

PREFIX = "/api/ext/projects"
META_FILE = "project.json"
INSTRUCTIONS_FILE = "AGENTS.md"
ARCHIVE_DIR = ".archive"
RESERVED = frozenset({META_FILE, INSTRUCTIONS_FILE})

MAX_UPLOAD_BYTES = 100 * 1024 * 1024
MIN_FREE_BYTES = 512 * 1024 * 1024
MAX_FULL_GET_BYTES = 32 * 1024 * 1024
MAX_JSON_BODY_BYTES = 1024 * 1024
MAX_INSTRUCTIONS_CHARS = 200_000
MAX_NAME_CHARS = 120
MAX_DESCRIPTION_CHARS = 2_000
MAX_LIST_FILES = 2_000
MAX_LIST_DEPTH = 6

_ID_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$")


class ProjectError(Exception):
    def __init__(self, status: int, code: str) -> None:
        super().__init__(code)
        self.status = status
        self.code = code


def _byte_range(header: str, size: int) -> tuple[int, int]:
    """Parse a single ``bytes=a-b`` / ``bytes=a-`` / ``bytes=-n`` range; ValueError if unsatisfiable."""
    match = re.fullmatch(r"\s*bytes=(\d*)-(\d*)\s*", header)
    if not match or size <= 0 or match.group(1) == match.group(2) == "":
        raise ValueError("invalid range")
    first, last = match.group(1), match.group(2)
    if first == "":
        start, end = max(0, size - int(last)), size - 1
    else:
        start = int(first)
        end = min(int(last), size - 1) if last else size - 1
    if start > end or start >= size:
        raise ValueError("unsatisfiable range")
    return start, end


def _now_ms() -> int:
    return int(time.time() * 1000)


def _slugify(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")[:48].strip("-")
    return slug or "progetto"


def _clean_text(value: Any, *, field: str, limit: int, required: bool = False) -> str:
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ProjectError(400, f"invalid_{field}")
    text = value.strip() if field != "instructions" else value
    if required and not text.strip():
        raise ProjectError(400, f"missing_{field}")
    if len(text) > limit or "\0" in text:
        raise ProjectError(400, f"invalid_{field}")
    return text


class ProjectStore:
    """Filesystem-backed and stateless: safe to construct per request."""

    def __init__(self, root: Path) -> None:
        self.root = root

    # -- projects -----------------------------------------------------------

    def _dir(self, project_id: str) -> Path:
        if not _ID_RE.match(project_id):
            raise ProjectError(404, "project_not_found")
        path = self.root / project_id
        if not (path / META_FILE).is_file():
            raise ProjectError(404, "project_not_found")
        return path

    def _read_meta(self, path: Path) -> dict[str, Any]:
        try:
            raw = json.loads((path / META_FILE).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raw = {}
        return cast(dict[str, Any], raw) if isinstance(raw, dict) else {}

    def _write_meta(self, path: Path, meta: dict[str, Any]) -> None:
        tmp = path / f".{META_FILE}.{secrets.token_hex(4)}"
        tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, path / META_FILE)

    def _summary(self, path: Path, *, with_stats: bool = True) -> dict[str, Any]:
        meta = self._read_meta(path)
        summary: dict[str, Any] = {
            "id": path.name,
            "name": str(meta.get("name") or path.name),
            "description": str(meta.get("description") or ""),
            "path": str(path.resolve()),
            "created_at": int(meta.get("created_at") or 0),
            "updated_at": int(meta.get("updated_at") or 0),
        }
        if with_stats:
            files, _ = self._walk(path)
            summary["file_count"] = len(files)
            summary["size_bytes"] = sum(f["size"] for f in files)
        return summary

    def list(self) -> list[dict[str, Any]]:
        if not self.root.is_dir():
            return []
        out = [
            self._summary(child)
            for child in sorted(self.root.iterdir())
            if child.is_dir() and _ID_RE.match(child.name) and (child / META_FILE).is_file()
        ]
        out.sort(key=lambda p: p["updated_at"], reverse=True)
        return out

    def get(self, project_id: str) -> tuple[dict[str, Any], str, list[dict[str, Any]], bool]:
        path = self._dir(project_id)
        files, truncated = self._walk(path)
        summary = self._summary(path, with_stats=False)
        summary["file_count"] = len(files)
        summary["size_bytes"] = sum(f["size"] for f in files)
        return summary, self._read_instructions(path), files, truncated

    def _read_instructions(self, path: Path) -> str:
        try:
            return (path / INSTRUCTIONS_FILE).read_text(encoding="utf-8")
        except OSError:
            return ""

    def create(self, name: Any, description: Any = "", instructions: Any = "") -> dict[str, Any]:
        name = _clean_text(name, field="name", limit=MAX_NAME_CHARS, required=True)
        description = _clean_text(description, field="description", limit=MAX_DESCRIPTION_CHARS)
        instructions = _clean_text(instructions, field="instructions", limit=MAX_INSTRUCTIONS_CHARS)
        self.root.mkdir(parents=True, exist_ok=True)
        base = _slugify(name)
        for n in range(1, 1000):
            candidate = base if n == 1 else f"{base[:44]}-{n}"
            path = self.root / candidate
            try:
                path.mkdir()
            except FileExistsError:
                continue
            break
        else:
            raise ProjectError(409, "too_many_projects_with_this_name")
        now = _now_ms()
        self._write_meta(path, {"name": name, "description": description, "created_at": now, "updated_at": now})
        (path / INSTRUCTIONS_FILE).write_text(instructions, encoding="utf-8")
        return self._summary(path)

    def update(
        self, project_id: str, *, name: Any = None, description: Any = None, instructions: Any = None
    ) -> tuple[dict[str, Any], str]:
        path = self._dir(project_id)
        meta = self._read_meta(path)
        if name is not None:
            meta["name"] = _clean_text(name, field="name", limit=MAX_NAME_CHARS, required=True)
        if description is not None:
            meta["description"] = _clean_text(description, field="description", limit=MAX_DESCRIPTION_CHARS)
        if instructions is not None:
            text = _clean_text(instructions, field="instructions", limit=MAX_INSTRUCTIONS_CHARS)
            tmp = path / f".{INSTRUCTIONS_FILE}.{secrets.token_hex(4)}"
            tmp.write_text(text, encoding="utf-8")
            os.replace(tmp, path / INSTRUCTIONS_FILE)
        meta["updated_at"] = _now_ms()
        self._write_meta(path, meta)
        return self._summary(path), self._read_instructions(path)

    def archive(self, project_id: str) -> None:
        path = self._dir(project_id)
        archive = self.root / ARCHIVE_DIR
        archive.mkdir(exist_ok=True)
        os.replace(path, archive / f"{project_id}-{time.strftime('%Y%m%d-%H%M%S')}-{secrets.token_hex(2)}")

    # -- files --------------------------------------------------------------

    def resolve_file(self, project_id: str, rel: Any, *, for_write: bool = False) -> Path:
        root = self._dir(project_id)
        if not isinstance(rel, str) or not rel or "\0" in rel or "\\" in rel or rel.startswith("/"):
            raise ProjectError(400, "invalid_path")
        parts = rel.split("/")
        if any(p in ("", ".", "..") or p.startswith(".") for p in parts):
            raise ProjectError(400, "invalid_path")
        if len(parts) == 1 and parts[0] in RESERVED:
            raise ProjectError(400, "reserved_path")
        if len(parts) > MAX_LIST_DEPTH:
            raise ProjectError(400, "path_too_deep")
        target = root / rel
        root_real = root.resolve()
        probe = target if target.exists() else target.parent
        try:
            probe.resolve().relative_to(root_real)
        except (OSError, ValueError):
            raise ProjectError(400, "invalid_path") from None
        if for_write and target.is_symlink():
            raise ProjectError(400, "invalid_path")
        return target

    def _walk(self, root: Path) -> tuple[list[dict[str, Any]], bool]:
        files: list[dict[str, Any]] = []
        stack: list[tuple[Path, int]] = [(root, 0)]
        while stack:
            folder, depth = stack.pop()
            try:
                entries = sorted(os.scandir(folder), key=lambda e: e.name)
            except OSError:
                continue
            for entry in entries:
                if entry.name.startswith(".") or entry.is_symlink():
                    continue
                if depth == 0 and entry.name in RESERVED:
                    continue
                if entry.is_dir(follow_symlinks=False):
                    if depth + 1 < MAX_LIST_DEPTH:
                        stack.append((Path(entry.path), depth + 1))
                    continue
                if len(files) >= MAX_LIST_FILES:
                    return self._sorted(files), True
                st = entry.stat(follow_symlinks=False)
                rel = Path(entry.path).relative_to(root)
                files.append({"path": rel.as_posix(), "size": st.st_size, "modified_at": int(st.st_mtime * 1000)})
        return self._sorted(files), False

    @staticmethod
    def _sorted(files: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return sorted(files, key=lambda f: f["path"])

    async def save_upload(
        self, project_id: str, rel: Any, chunks: AsyncIterable[bytes], size: int, *, overwrite: bool
    ) -> dict[str, Any]:
        target = self.resolve_file(project_id, rel, for_write=True)
        if size < 0:
            raise ProjectError(411, "length_required")
        if size > MAX_UPLOAD_BYTES:
            raise ProjectError(413, "file_too_large")
        if target.exists() and not overwrite:
            raise ProjectError(409, "file_exists")
        if target.exists() and not target.is_file():
            raise ProjectError(409, "not_a_file")
        target.parent.mkdir(parents=True, exist_ok=True)
        if shutil.disk_usage(target.parent).free - size < MIN_FREE_BYTES:
            raise ProjectError(507, "disk_full")
        tmp = target.parent / f".upload-{secrets.token_hex(8)}"
        received = 0
        try:
            with tmp.open("xb") as out:
                async for chunk in chunks:
                    received += len(chunk)
                    if received > size:
                        raise ProjectError(400, "body_exceeds_length")
                    out.write(chunk)
            if received != size:
                raise ProjectError(400, "body_shorter_than_length")
            os.replace(tmp, target)
        finally:
            if tmp.exists():
                tmp.unlink()
        self._touch(project_id)
        st = target.stat()
        root = self._dir(project_id)
        return {"path": target.relative_to(root).as_posix(), "size": st.st_size, "modified_at": int(st.st_mtime * 1000)}

    def delete_file(self, project_id: str, rel: Any) -> None:
        target = self.resolve_file(project_id, rel, for_write=True)
        if not target.is_file():
            raise ProjectError(404, "file_not_found")
        target.unlink()
        self._touch(project_id)

    def _touch(self, project_id: str) -> None:
        path = self._dir(project_id)
        meta = self._read_meta(path)
        meta["updated_at"] = _now_ms()
        self._write_meta(path, meta)


# ---- HTTP faces ------------------------------------------------------------------


def _store(workspaces: Any) -> ProjectStore:
    return ProjectStore(Path(workspaces.default_scope().project_path) / "projects")


def _route(path: str) -> tuple[str | None, str]:
    """Split ``/api/ext/projects/<id>/<rest>`` into (id, rest)."""
    tail = path[len(PREFIX) :].strip("/")
    if not tail:
        return None, ""
    project_id, _, rest = tail.partition("/")
    return project_id, rest


def dispatch_projects_get(router: Any, request: WsRequest, got: str) -> Response | None:
    """GET face. ``router`` provides ``tokens`` and ``workspaces`` (GatewayHTTPHandler)."""
    if got != PREFIX and not got.startswith(PREFIX + "/"):
        return None
    if not router.tokens.check_api_token(request):
        return http_error(401, "Unauthorized")
    store = _store(router.workspaces)
    project_id, rest = _route(got)
    try:
        if project_id is None:
            return http_json_response({"projects": store.list()}, extra_headers=[("Cache-Control", "no-store")])
        if rest == "":
            project, instructions, files, truncated = store.get(project_id)
            return http_json_response(
                {"project": project, "instructions": instructions, "files": files, "truncated": truncated},
                extra_headers=[("Cache-Control", "no-store")],
            )
        if rest == "file":
            _, query = parse_request_path(request.path)
            return _serve_file(store, project_id, query_first(query, "path") or "", request)
    except ProjectError as exc:
        return http_error(exc.status, exc.code)
    return http_error(404, "not_found")


def _serve_file(store: ProjectStore, project_id: str, rel: str, request: WsRequest) -> Response:
    target = store.resolve_file(project_id, rel)
    if not target.is_file():
        raise ProjectError(404, "file_not_found")
    size = target.stat().st_size
    mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    headers = [("Accept-Ranges", "bytes"), ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff")]
    range_header = case_insensitive_header(request.headers, "Range")
    if range_header:
        try:
            start, end = _byte_range(range_header, size)
        except ValueError:
            return http_response(b"range not satisfiable", status=416, extra_headers=[("Content-Range", f"bytes */{size}")])
        with target.open("rb") as fh:
            fh.seek(start)
            body = fh.read(end - start + 1)
        return http_response(body, status=206, content_type=mime, extra_headers=[*headers, ("Content-Range", f"bytes {start}-{end}/{size}")])
    if size > MAX_FULL_GET_BYTES:
        return http_error(413, "use_range")
    return http_response(target.read_bytes(), content_type=mime, extra_headers=headers)


async def _read_json(request: web.BaseRequest) -> dict[str, Any]:
    if request.content_length is not None and request.content_length > MAX_JSON_BODY_BYTES:
        raise ProjectError(413, "body_too_large")
    raw = await request.content.read(MAX_JSON_BODY_BYTES + 1)
    if len(raw) > MAX_JSON_BODY_BYTES:
        raise ProjectError(413, "body_too_large")
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        raise ProjectError(400, "invalid_json") from None
    if not isinstance(data, dict):
        raise ProjectError(400, "invalid_json")
    return cast(dict[str, Any], data)


def projects_post_handler(
    tokens: Any,
    workspaces: Any,
    fallback: Callable[[web.BaseRequest], Awaitable[web.StreamResponse]],
) -> Callable[[web.BaseRequest], Awaitable[web.StreamResponse]]:
    """Wrap the body-capable bridge handler: our paths here, everything else to ``fallback``."""

    async def handler(request: web.BaseRequest) -> web.StreamResponse:
        path = request.path
        if path != PREFIX and not path.startswith(PREFIX + "/"):
            return await fallback(request)
        response = await _handle_post(tokens, workspaces, request)
        response.headers["Cache-Control"] = "no-store"
        # Same as the attachment upload: a POST connection never switches back to
        # the GET/WS parser, and closing avoids draining rejected bodies.
        response.force_close()
        return response

    return handler


async def _handle_post(tokens: Any, workspaces: Any, request: web.BaseRequest) -> web.StreamResponse:
    if request.method != "POST":
        return web.json_response({"error": "method_not_allowed"}, status=405)
    if not tokens.check_api_token(request):
        return web.json_response({"error": "unauthorized"}, status=401)
    if request.headers.get("Content-Encoding") or request.headers.get("Transfer-Encoding"):
        return web.json_response({"error": "unsupported_framing"}, status=400)
    store = _store(workspaces)
    project_id, rest = _route(request.path)
    try:
        if project_id is None:
            body = await _read_json(request)
            project = store.create(body.get("name"), body.get("description"), body.get("instructions"))
            return web.json_response({"project": project}, status=201)
        if rest == "update":
            body = await _read_json(request)
            project, instructions = store.update(
                project_id, name=body.get("name"), description=body.get("description"), instructions=body.get("instructions")
            )
            return web.json_response({"project": project, "instructions": instructions})
        if rest == "archive":
            store.archive(project_id)
            return web.json_response({"ok": True})
        if rest == "files":
            if request.content_length is None:
                raise ProjectError(411, "length_required")
            rel = unquote(request.query.get("path", ""))
            entry = await store.save_upload(
                project_id,
                rel,
                request.content.iter_chunked(64 * 1024),
                request.content_length,
                overwrite=request.headers.get("X-Overwrite") == "1",
            )
            return web.json_response({"file": entry}, status=201)
        if rest == "files/delete":
            body = await _read_json(request)
            store.delete_file(project_id, body.get("path"))
            return web.json_response({"ok": True})
    except ProjectError as exc:
        return web.json_response({"error": exc.code}, status=exc.status)
    except OSError:
        return web.json_response({"error": "io_error"}, status=500)
    return web.json_response({"error": "not_found"}, status=404)
