"""Approve shell commands from the phone (fork extension).

Design: mobile/docs/superpowers/specs/2026-10-15-approvals-design.md

When enabled, every ``exec`` call waits for an Allow/Deny from the app (or a chat's
"always allow"). No answer within ``TIMEOUT_S`` denies it. A denied command reaches
the model as an ordinary tool error, so upstream turn handling is unchanged.
"""

from __future__ import annotations

import asyncio
import json
import os
import secrets
import tempfile
import threading
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

from aiohttp import web
from loguru import logger
from websockets.http11 import Request as WsRequest
from websockets.http11 import Response

from nanobot.agent.tools.base import ToolResult
from nanobot.agent.tools.context import current_request_session_key
from nanobot.ext.devices import DeviceError, admin_authorized, read_json, router_admin_authorized
from nanobot.webui.http_utils import http_error, http_json_response

PREFIX = "/api/ext/approvals"
TIMEOUT_S = 300
MAX_PENDING = 20
MAX_SUMMARY = 500
DENIED = "Error: the user denied this command on their phone (or did not answer in time)."
_GUARDED_TOOL = "exec"


def approvals_file_path() -> Path:
    raw = os.environ.get("NANOBOT_APPROVALS_FILE", "").strip()
    return Path(raw).expanduser() if raw else Path.home() / ".nanobot" / "ext_approvals.json"


def _load(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"enabled": False, "allow": {}}
    data = cast(dict[str, Any], data)
    allow = cast(dict[str, Any], data.get("allow") if isinstance(data.get("allow"), dict) else {})
    return {"enabled": data.get("enabled") is True, "allow": {str(k): list(cast(list[Any], v)) for k, v in allow.items() if isinstance(v, list)}}


def _save(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".approvals-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(state, fh)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


@dataclass
class _Pending:
    id: str
    session_key: str
    tool: str
    summary: str
    created_at: float
    expires_at: float
    future: asyncio.Future[bool] = field(repr=False)

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "session_key": self.session_key,
            "tool": self.tool,
            "summary": self.summary,
            "created_at": int(self.created_at),
            "expires_in": max(0, int(self.expires_at - time.time())),
        }


class ApprovalGate:
    """Pending requests live in memory (one gateway process); settings live in a 0600 file."""

    def __init__(self, path: Path | None = None) -> None:
        self._path = path
        self._lock = threading.Lock()
        self._pending: dict[str, _Pending] = {}

    @property
    def path(self) -> Path:
        return self._path or approvals_file_path()

    def state(self) -> dict[str, Any]:
        with self._lock:
            return _load(self.path)

    def set_enabled(self, enabled: bool) -> None:
        with self._lock:
            state = _load(self.path)
            state["enabled"] = enabled
            _save(self.path, state)

    def forget(self, session_key: str) -> None:
        with self._lock:
            state = _load(self.path)
            state["allow"].pop(session_key, None)
            _save(self.path, state)

    def pending(self) -> list[dict[str, Any]]:
        return [p.public() for p in self._pending.values() if not p.future.done()]

    async def request(self, session_key: str, tool: str, summary: str, *, timeout_s: float = TIMEOUT_S) -> bool:
        state = self.state()
        if not state["enabled"] or tool in state["allow"].get(session_key, []):
            return True
        if len(self._pending) >= MAX_PENDING:
            return False  # fail closed rather than queue without bound
        now = time.time()
        item = _Pending(
            id=secrets.token_urlsafe(9),
            session_key=session_key,
            tool=tool,
            summary=summary[:MAX_SUMMARY],
            created_at=now,
            expires_at=now + timeout_s,
            future=asyncio.get_running_loop().create_future(),
        )
        self._pending[item.id] = item
        try:
            return await asyncio.wait_for(asyncio.shield(item.future), timeout_s)
        except TimeoutError:
            return False
        finally:
            self._pending.pop(item.id, None)

    def decide(self, request_id: str, allow: bool, always: bool) -> None:
        item = self._pending.get(request_id)
        if item is None or item.future.done():
            raise DeviceError(404, "not_found")
        if allow and always:
            with self._lock:
                state = _load(self.path)
                tools = state["allow"].setdefault(item.session_key, [])
                if item.tool not in tools:
                    tools.append(item.tool)
                _save(self.path, state)
        # The HTTP bridge may answer from another thread: resolve on the waiting loop.
        loop = item.future.get_loop()
        loop.call_soon_threadsafe(lambda: item.future.done() or item.future.set_result(allow))


GATE = ApprovalGate()


def _summary(params: dict[str, Any]) -> str:
    command: Any = params.get("command") or params.get("cmd") or ""
    if isinstance(command, list):
        command = " ".join(str(c) for c in cast(list[Any], command))
    cwd = params.get("working_dir") or params.get("workdir") or ""
    return f"{command}\n(cwd: {cwd})" if cwd else str(command)


def install() -> None:
    """Guard ``ExecTool.execute`` once per process (main agent and subagents alike)."""
    from nanobot.agent.tools.shell import ExecTool

    if getattr(ExecTool.execute, "_approval_guarded", False):
        return
    original = ExecTool.execute

    async def guarded(self: Any, *args: Any, **kwargs: Any) -> Any:
        if args:  # positional use is not part of the tool-call path; keep it untouched
            return await original(self, *args, **kwargs)
        session_key = current_request_session_key() or "unknown"
        if not await GATE.request(session_key, _GUARDED_TOOL, _summary(kwargs)):
            logger.info("approvals: exec denied for {}", session_key)
            return ToolResult.error(DENIED)
        return await original(self, **kwargs)

    guarded._approval_guarded = True  # type: ignore[attr-defined]
    ExecTool.execute = guarded  # type: ignore[method-assign]


def dispatch_approvals_get(router: Any, request: WsRequest, got: str) -> Response | None:
    if got != PREFIX:
        return None
    secret = router.config.token_issue_secret.strip() or router.config.token.strip()
    if not router_admin_authorized(secret, router, request):
        return http_error(401, "Unauthorized")
    state = GATE.state()
    payload = {"enabled": state["enabled"], "pending": GATE.pending(), "allow": state["allow"]}
    return http_json_response(payload, extra_headers=[("Cache-Control", "no-store")])


async def _handle_post(secret: str, tokens: Any, request: web.BaseRequest) -> web.StreamResponse:
    if request.method != "POST":
        return web.json_response({"error": "method_not_allowed"}, status=405)
    if not admin_authorized(secret, tokens, request):
        return web.json_response({"error": "unauthorized"}, status=401)
    try:
        body = await read_json(request)
        if request.path == PREFIX + "/decide":
            request_id, allow, always = body.get("id"), body.get("allow"), body.get("always", False)
            if not isinstance(request_id, str) or not isinstance(allow, bool) or not isinstance(always, bool):
                return web.json_response({"error": "invalid_body"}, status=400)
            GATE.decide(request_id, allow, always)
            return web.json_response({"ok": True})
        if request.path == PREFIX + "/settings":
            enabled = body.get("enabled")
            if not isinstance(enabled, bool):
                return web.json_response({"error": "invalid_body"}, status=400)
            GATE.set_enabled(enabled)
            return web.json_response({"ok": True, "enabled": enabled})
        if request.path == PREFIX + "/forget":
            session_key = body.get("session_key")
            if not isinstance(session_key, str) or not session_key:
                return web.json_response({"error": "invalid_body"}, status=400)
            GATE.forget(session_key)
            return web.json_response({"ok": True})
    except DeviceError as exc:
        return web.json_response({"error": exc.code}, status=exc.status)
    return web.json_response({"error": "not_found"}, status=404)


def approvals_post_handler(
    secret: str,
    tokens: Any,
    fallback: Callable[[web.BaseRequest], Awaitable[web.StreamResponse]],
) -> Callable[[web.BaseRequest], Awaitable[web.StreamResponse]]:
    async def handler(request: web.BaseRequest) -> web.StreamResponse:
        path = request.path
        if path != PREFIX and not path.startswith(PREFIX + "/"):
            return await fallback(request)
        response = await _handle_post(secret, tokens, request)
        response.headers["Cache-Control"] = "no-store"
        response.force_close()
        return response

    return handler
