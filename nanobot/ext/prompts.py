"""Prompt library (fork extension): saved prompts, global or tied to a project.

Stored in ``~/.nanobot/ext_prompts.json``. Bodies may hold ``{{name}}`` placeholders;
the app fills them before sending, the server only lists them.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, cast
from urllib.parse import parse_qs, urlsplit

from aiohttp import web
from websockets.http11 import Request as WsRequest
from websockets.http11 import Response

from nanobot.ext.devices import DeviceError, admin_authorized, read_json, router_admin_authorized
from nanobot.webui.http_utils import http_error, http_json_response

PREFIX = "/api/ext/prompts"
MAX_PROMPTS = 500
MAX_TITLE = 120
MAX_BODY = 20_000
MAX_PROJECT_ID = 64
_VAR = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_ ]{0,39}?)\s*\}\}")
_lock = threading.Lock()


class PromptError(Exception):
    def __init__(self, status: int, code: str) -> None:
        super().__init__(code)
        self.status = status
        self.code = code


def prompts_file_path() -> Path:
    raw = os.environ.get("NANOBOT_PROMPTS_FILE", "").strip()
    return Path(raw).expanduser() if raw else Path.home() / ".nanobot" / "ext_prompts.json"


def variables(body: str) -> list[str]:
    """Placeholder names in first-seen order, deduplicated."""
    return list(dict.fromkeys(m.group(1).strip() for m in _VAR.finditer(body)))


def _load() -> list[dict[str, Any]]:
    try:
        data = json.loads(prompts_file_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    items = cast(dict[str, Any], data).get("prompts") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return []
    return [p for p in cast(list[Any], items) if isinstance(p, dict) and isinstance(cast(dict[str, Any], p).get("id"), str)]


def _save(items: list[dict[str, Any]]) -> None:
    path = prompts_file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".prompts-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump({"prompts": items}, fh, ensure_ascii=False)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def _text(value: Any, field: str, limit: int, *, required: bool) -> str:
    if value is None:
        value = ""
    if not isinstance(value, str) or len(value) > limit or "\0" in value:
        raise PromptError(400, f"invalid_{field}")
    if required and not value.strip():
        raise PromptError(400, f"missing_{field}")
    return value


def _public(p: dict[str, Any]) -> dict[str, Any]:
    return {**p, "variables": variables(p.get("body", ""))}


def list_prompts(project_id: str | None = None) -> list[dict[str, Any]]:
    """Global prompts plus, when given, that project's; most recently used/edited first."""
    items = [p for p in _load() if p.get("project_id") in (None, project_id)]
    items.sort(key=lambda p: max(p.get("used_at") or 0, p.get("updated_at") or 0), reverse=True)
    return [_public(p) for p in items]


def save_prompt(body: dict[str, Any]) -> dict[str, Any]:
    title = _text(body.get("title"), "title", MAX_TITLE, required=True).strip()
    text = _text(body.get("body"), "body", MAX_BODY, required=True)
    project = body.get("project_id")
    if project is not None and (not isinstance(project, str) or not project or len(project) > MAX_PROJECT_ID):
        raise PromptError(400, "invalid_project_id")
    now = int(time.time() * 1000)
    with _lock:
        items = _load()
        pid = body.get("id")
        if pid is not None:
            current = next((p for p in items if p["id"] == pid), None)
            if current is None:
                raise PromptError(404, "not_found")
            current.update(title=title, body=text, project_id=project, updated_at=now)
            saved = current
        else:
            if len(items) >= MAX_PROMPTS:
                raise PromptError(409, "too_many_prompts")
            saved = {"id": secrets.token_hex(8), "title": title, "body": text, "project_id": project,
                     "created_at": now, "updated_at": now, "used_at": None}
            items.append(saved)
        _save(items)
    return _public(saved)


def delete_prompt(prompt_id: Any) -> None:
    with _lock:
        items = _load()
        kept = [p for p in items if p["id"] != prompt_id]
        if len(kept) == len(items):
            raise PromptError(404, "not_found")
        _save(kept)


def mark_used(prompt_id: Any) -> None:
    with _lock:
        items = _load()
        for p in items:
            if p["id"] == prompt_id:
                p["used_at"] = int(time.time() * 1000)
                _save(items)
                return
    raise PromptError(404, "not_found")


def dispatch_prompts_get(router: Any, request: WsRequest, got: str) -> Response | None:
    if got != PREFIX:
        return None
    secret = router.config.token_issue_secret.strip() or router.config.token.strip()
    if not router_admin_authorized(secret, router, request):
        return http_error(401, "Unauthorized")
    project = parse_qs(urlsplit(request.path).query).get("project", [None])[0]
    return http_json_response({"prompts": list_prompts(project)}, extra_headers=[("Cache-Control", "no-store")])


async def _handle_post(secret: str, tokens: Any, request: web.BaseRequest) -> web.StreamResponse:
    if request.method != "POST":
        return web.json_response({"error": "method_not_allowed"}, status=405)
    if not admin_authorized(secret, tokens, request):
        return web.json_response({"error": "unauthorized"}, status=401)
    try:
        body = await read_json(request)
        if request.path == PREFIX + "/save":
            return web.json_response({"prompt": save_prompt(body)})
        if request.path == PREFIX + "/delete":
            delete_prompt(body.get("id"))
            return web.json_response({"ok": True})
        if request.path == PREFIX + "/used":
            mark_used(body.get("id"))
            return web.json_response({"ok": True})
    except (DeviceError, PromptError) as exc:
        return web.json_response({"error": exc.code}, status=exc.status)
    return web.json_response({"error": "not_found"}, status=404)


def prompts_post_handler(secret: str, tokens: Any, fallback: Any) -> Any:
    async def handler(request: web.BaseRequest) -> web.StreamResponse:
        path = request.path
        if path != PREFIX and not path.startswith(PREFIX + "/"):
            return await fallback(request)
        response = await _handle_post(secret, tokens, request)
        response.headers["Cache-Control"] = "no-store"
        response.force_close()
        return response

    return handler
