"""Automations: route for creating a new automation from the app."""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any, cast

from aiohttp import web

from nanobot.cron.service import CronService
from nanobot.ext.devices import admin_authorized
from nanobot.session.manager import SessionManager
from nanobot.webui.session_automations import serialize_automation_jobs
from nanobot.webui.session_identity import (
    is_valid_webui_chat_id,
    is_webui_session_key,
    webui_chat_id,
)
from nanobot.webui.ws_http import (
    _parse_automation_schedule,  # pyright: ignore[reportPrivateUsage]
    _validate_automation_schedule,  # pyright: ignore[reportPrivateUsage]
)

PREFIX = "/api/ext/automations"


class AutomationError(Exception):
    def __init__(self, status: int, code: str) -> None:
        self.status = status
        self.code = code
        super().__init__(code)


def create_automation(
    body: dict[str, Any],
    *,
    cron: CronService,
    sessions: SessionManager,
) -> dict[str, Any]:
    # 1. message (required, non-empty)
    raw_message = body.get("message")
    if not isinstance(raw_message, str):
        raise AutomationError(400, "invalid_message")
    message = raw_message.strip()
    if not message:
        raise AutomationError(400, "invalid_message")

    # 2. name (optional, defaults to first 40 chars of message)
    raw_name = body.get("name")
    if isinstance(raw_name, str) and raw_name.strip():
        name = raw_name.strip()
    else:
        name = message[:40]

    # 3. schedule (kind: "at" | "every" | "cron")
    raw_schedule = body.get("schedule")
    if not isinstance(raw_schedule, dict):
        raise AutomationError(400, "invalid_schedule")

    schedule_dict = cast(dict[str, Any], raw_schedule)
    parsed_schedule = _parse_automation_schedule(schedule_dict)
    if isinstance(parsed_schedule, str):
        raise AutomationError(400, "invalid_schedule")

    schedule_err = _validate_automation_schedule(parsed_schedule)
    if schedule_err is not None:
        raise AutomationError(400, "invalid_schedule")

    if parsed_schedule.kind == "every" and (
        parsed_schedule.every_ms is None or parsed_schedule.every_ms < 60_000
    ):
        raise AutomationError(400, "invalid_schedule")

    delete_after_run = parsed_schedule.kind == "at"

    # 4. session_key (existing, non-temporary websocket chat)
    raw_session_key = body.get("session_key")
    if not isinstance(raw_session_key, str) or not raw_session_key.strip():
        raise AutomationError(400, "invalid_chat")
    session_key = raw_session_key.strip()

    if not is_webui_session_key(session_key):
        raise AutomationError(400, "invalid_chat")
    chat_id = webui_chat_id(session_key)
    if not chat_id or not is_valid_webui_chat_id(chat_id):
        raise AutomationError(400, "invalid_chat")

    session = sessions.get_existing(session_key)
    if session is None:
        # Check if this chat was created/staged by the user (in title_overrides)
        from nanobot.webui.sidebar_state import read_webui_sidebar_state

        try:
            sidebar = read_webui_sidebar_state()
            if session_key in sidebar.get("title_overrides", {}):
                session = sessions.get_or_create(session_key)
                sessions.save(session)
        except Exception:
            pass

    if session is None or not getattr(session.policy, "persist", True):
        raise AutomationError(400, "invalid_chat")

    origin_channel = "websocket"
    origin_chat_id = chat_id
    origin_metadata: dict[str, Any] = {}

    try:
        job = cron.add_job(
            name=name,
            schedule=parsed_schedule,
            message=message,
            delete_after_run=delete_after_run,
            session_key=session_key,
            origin_channel=origin_channel,
            origin_chat_id=origin_chat_id,
            origin_metadata=origin_metadata,
        )
    except ValueError:
        raise AutomationError(400, "invalid_schedule") from None

    serialized = serialize_automation_jobs([job], include_details=True, session_manager=sessions)
    return serialized[0]


async def _read_json(request: web.BaseRequest) -> dict[str, Any]:
    raw = await request.content.read()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        raise AutomationError(400, "invalid_json") from None
    if not isinstance(data, dict):
        raise AutomationError(400, "invalid_json")
    return cast(dict[str, Any], data)


async def _handle_post(
    secret: str,
    tokens: Any,
    request: web.BaseRequest,
    *,
    cron: CronService | None,
    sessions: SessionManager | None,
) -> web.StreamResponse:
    if request.method != "POST":
        return web.json_response({"error": "method_not_allowed"}, status=405)
    if not admin_authorized(secret, tokens, request):
        return web.json_response({"error": "unauthorized"}, status=401)
    if cron is None or sessions is None:
        return web.json_response({"error": "unavailable"}, status=503)
    if request.path != PREFIX + "/create":
        return web.json_response({"error": "not_found"}, status=404)

    try:
        body = await _read_json(request)
        job_payload = create_automation(
            body,
            cron=cron,
            sessions=sessions,
        )
        return web.json_response(job_payload)
    except AutomationError as exc:
        return web.json_response({"error": exc.code}, status=exc.status)


def automations_post_handler(
    secret: str,
    tokens: Any,
    fallback: Callable[[web.BaseRequest], Awaitable[web.StreamResponse]],
    *,
    cron: CronService | None = None,
    sessions: SessionManager | None = None,
) -> Callable[[web.BaseRequest], Awaitable[web.StreamResponse]]:
    async def handler(request: web.BaseRequest) -> web.StreamResponse:
        path = request.path
        if path != PREFIX and not path.startswith(PREFIX + "/"):
            return await fallback(request)
        response = await _handle_post(
            secret, tokens, request, cron=cron, sessions=sessions
        )
        response.headers["Cache-Control"] = "no-store"
        response.force_close()
        return response

    return handler

