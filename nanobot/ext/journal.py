"""Daily journal: collect one local day, ask for a short Markdown page, store it in the workspace."""

from __future__ import annotations

import json
import re
import sqlite3
from collections.abc import Awaitable, Callable
from datetime import date, datetime
from pathlib import Path
from typing import Any, cast
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from aiohttp import web
from loguru import logger
from websockets.http11 import Request as WsRequest
from websockets.http11 import Response

from nanobot.cron.service import CronService
from nanobot.cron.types import CronJob, CronPayload, CronSchedule
from nanobot.ext.devices import admin_authorized
from nanobot.ext.kanban import kanban_db_path
from nanobot.session.history_visibility import is_hidden_history_message
from nanobot.session.manager import SessionManager
from nanobot.webui.http_utils import http_error, http_json_response

PREFIX = "/api/ext/journal"
CHAR_CAP = 24_000
_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
_Turn = Callable[[str], Awaitable[str]]
_runner: _Turn | None = None


class JournalError(Exception):
    def __init__(self, status: int, code: str) -> None:
        self.status = status
        self.code = code
        super().__init__(code)


def bind_journal_turn(turn: _Turn | None) -> None:
    global _runner
    _runner = turn


def settings_path(workspace: Path) -> Path:
    return workspace / "memory" / "journal" / "settings.json"


def day_path(workspace: Path, day: date) -> Path:
    return workspace / "memory" / "journal" / f"{day.isoformat()}.md"


def load_settings(workspace: Path) -> dict[str, Any]:
    try:
        parsed: object = json.loads(settings_path(workspace).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"enabled": False, "hour": 22, "model": None}
    if not isinstance(parsed, dict):
        return {"enabled": False, "hour": 22, "model": None}
    raw = cast(dict[str, Any], parsed)
    enabled = raw.get("enabled") is True
    hour = raw.get("hour")
    if isinstance(hour, bool) or not isinstance(hour, int) or not 0 <= hour <= 23:
        hour = 22
    model_raw = raw.get("model")
    if model_raw is None or model_raw == "default":
        model: str | None = None
    elif isinstance(model_raw, str) and model_raw:
        model = model_raw
    else:
        model = None
    return {"enabled": enabled, "hour": hour, "model": model}


def _parse_model_value(value: object, preset_names: frozenset[str]) -> str | None:
    if value is None or value == "default":
        return None
    if not isinstance(value, str):
        raise JournalError(400, "invalid_model")
    if value not in preset_names:
        raise JournalError(400, "invalid_model")
    return value


def parse_settings(
    body: dict[str, Any],
    *,
    previous_model: str | None = None,
    preset_names: frozenset[str] | None = None,
) -> dict[str, Any]:
    enabled = body.get("enabled")
    hour = body.get("hour")
    if not isinstance(enabled, bool):
        raise JournalError(400, "invalid_settings")
    if isinstance(hour, bool) or not isinstance(hour, int) or not 0 <= hour <= 23:
        raise JournalError(400, "invalid_hour")
    if "model" in body:
        names = preset_names if preset_names is not None else frozenset[str]()
        model = _parse_model_value(body.get("model"), names)
    else:
        model = previous_model
    return {"enabled": enabled, "hour": hour, "model": model}


def save_settings(workspace: Path, settings: dict[str, Any], *, preset_names: frozenset[str]) -> dict[str, Any]:
    previous = load_settings(workspace)
    clean = parse_settings(
        settings,
        previous_model=previous.get("model"),
        preset_names=preset_names,
    )
    path = settings_path(workspace)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(clean), encoding="utf-8")
    return clean


def parse_day(raw: str | None) -> date:
    if raw is None or not _DATE_RE.fullmatch(raw):
        raise JournalError(400, "invalid_date")
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise JournalError(400, "invalid_date") from None


def local_today(tz_name: str | None) -> date:
    zone = _zone(tz_name)
    if zone is None:
        return datetime.now().astimezone().date()
    return datetime.now(zone).date()


def _zone(tz_name: str | None) -> ZoneInfo | None:
    if not tz_name:
        return None
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        return None


def _is_system_session(key: str) -> bool:
    return (
        key.startswith("kanban:")
        or key.startswith("cron:")
        or key.startswith("dream:")
        or key.startswith("journal:")
        or key == "heartbeat"
    )


def _message_day(raw: object, zone: ZoneInfo | None) -> date | None:
    if not isinstance(raw, str) or not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.date()
    if zone is not None:
        return parsed.astimezone(zone).date()
    return parsed.astimezone().date()


def _message_text(message: dict[str, Any]) -> str | None:
    if is_hidden_history_message(message):
        return None
    role = message.get("role")
    if role not in ("user", "assistant"):
        return None
    if message.get("tool_calls") or message.get("tool_call_id"):
        return None
    content = message.get("content")
    if isinstance(content, str):
        text = content.strip()
    elif isinstance(content, list):
        parts: list[str] = []
        for block in cast(list[object], content):
            if isinstance(block, str):
                parts.append(block)
                continue
            if not isinstance(block, dict):
                continue
            record = cast(dict[str, Any], block)
            text_value = record.get("text")
            if record.get("type") == "text" and isinstance(text_value, str):
                parts.append(text_value)
        text = "\n".join(parts).strip()
    else:
        return None
    if not text:
        return None
    who = "user" if role == "user" else "assistant"
    return f"{who}: {text}"


def _cap(pieces: list[tuple[int, str]], limit: int) -> str:
    """Keep the newest pieces. Cut the one that crosses the cap."""
    chosen: list[str] = []
    used = 0
    for _ms, text in sorted(pieces, key=lambda item: item[0], reverse=True):
        room = limit - used
        if room <= 0:
            break
        piece = text if len(text) <= room else text[-room:]
        if not piece:
            break
        chosen.append(piece)
        used += len(piece) + 1
    return "\n".join(reversed(chosen))


def _chat_pieces(day: date, sessions: SessionManager, zone: ZoneInfo | None) -> list[tuple[int, str]]:
    pieces: list[tuple[int, str]] = []
    for info in sessions.list_sessions():
        key = str(info.get("key") or "")
        if not key or _is_system_session(key):
            continue
        session = sessions.get_or_create(key)
        for message in session.messages:
            msg_day = _message_day(message.get("timestamp"), zone)
            if msg_day != day:
                continue
            text = _message_text(message)
            if not text:
                continue
            stamp = message.get("timestamp")
            ms = 0
            if isinstance(stamp, str):
                try:
                    ms = int(datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp() * 1000)
                except ValueError:
                    ms = 0
            pieces.append((ms, text))
    return pieces


def _kanban_pieces(day: date, zone: ZoneInfo | None) -> list[tuple[int, str]]:
    path = kanban_db_path()
    if not path.is_file():
        return []
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    except sqlite3.Error:
        return []
    pieces: list[tuple[int, str]] = []
    try:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT t.title AS title, r.status AS status, r.summary AS summary,
                   r.error AS error, r.finished_at_ms AS finished_at_ms
            FROM task_runs r
            JOIN tasks t ON t.id = r.task_id
            WHERE r.finished_at_ms IS NOT NULL
            """
        ).fetchall()
    except sqlite3.Error:
        return []
    finally:
        conn.close()
    for row in rows:
        finished = row["finished_at_ms"]
        if not isinstance(finished, int):
            continue
        when = datetime.fromtimestamp(finished / 1000, zone)
        if when.date() != day:
            continue
        title = str(row["title"] or "").strip()
        status = str(row["status"] or "").strip()
        summary = str(row["summary"] or "").strip()
        error = str(row["error"] or "").strip()
        extra = summary or error
        line = f"kanban: {title} — {status}" + (f" — {extra}" if extra else "")
        pieces.append((finished, line))
    return pieces


def collect_day(
    day: date,
    sessions: SessionManager,
    *,
    tz_name: str | None = None,
    limit: int = CHAR_CAP,
) -> str:
    zone = _zone(tz_name)
    pieces = _chat_pieces(day, sessions, zone) + _kanban_pieces(day, zone)
    return _cap(pieces, limit)


def journal_prompt(day: date, material: str) -> str:
    return (
        f"Scrivi il diario del {day.isoformat()} nella lingua delle chat.\n"
        "Markdown con queste sezioni: Di cosa abbiamo parlato, Decisioni, "
        "Da fare / aperto, Lavagna.\n"
        "Sii breve. Non inventare nulla: usa solo il materiale qui sotto.\n\n"
        f"{material}"
    )


def list_days(workspace: Path) -> list[str]:
    folder = workspace / "memory" / "journal"
    if not folder.is_dir():
        return []
    days = [
        path.stem
        for path in folder.glob("*.md")
        if _DATE_RE.fullmatch(path.stem)
    ]
    days.sort(reverse=True)
    return days


def read_day(workspace: Path, day: date) -> str:
    path = day_path(workspace, day)
    if not path.is_file():
        raise JournalError(404, "not_found")
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        raise JournalError(404, "not_found") from None


def write_day(workspace: Path, day: date, text: str) -> bool:
    body = text.strip()
    if not body:
        return False
    path = day_path(workspace, day)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body + "\n", encoding="utf-8")
    return True


async def execute_day(
    workspace: Path,
    sessions: SessionManager,
    day: date,
    turn: _Turn,
    *,
    tz_name: str | None = None,
) -> dict[str, Any]:
    material = collect_day(day, sessions, tz_name=tz_name)
    if not material.strip():
        return {"date": day.isoformat(), "written": False}
    text = await turn(journal_prompt(day, material))
    written = write_day(workspace, day, text)
    return {"date": day.isoformat(), "written": written}


def sync_journal_job(cron: CronService, workspace: Path, tz_name: str | None) -> None:
    settings = load_settings(workspace)
    if not settings["enabled"]:
        cron.remove_system_job("journal")
        return
    hour = int(settings["hour"])
    cron.register_system_job(
        CronJob(
            id="journal",
            name="journal",
            schedule=CronSchedule(kind="cron", expr=f"0 {hour} * * *", tz=tz_name or "UTC"),
            payload=CronPayload(kind="system_event"),
        )
    )


def prune_journal_sessions(sessions: SessionManager, *, keep: int = 10) -> None:
    with sessions.locked_session_files() as sessions_dir:
        files: list[tuple[Path, str]] = []
        for path in sessions_dir.glob("*.jsonl"):
            key = SessionManager.decode_storage_key(path.stem)
            if key is not None and key.startswith("journal:"):
                files.append((path, key))
        files.sort(key=lambda item: item[0].stat().st_mtime)
        for _path, key in files[: max(0, len(files) - keep)]:
            sessions.delete_session(key)


def agent_turn(agent: Any) -> _Turn:
    """One journal turn in an ephemeral session, the way Dream runs its turn. Old journal sessions are pruned after."""

    async def _silent(*_args: Any, **_kwargs: Any) -> None:
        return None

    async def turn(prompt: str) -> str:
        settings = load_settings(Path(agent.context.memory.workspace))
        model_name = settings.get("model")
        runtime: Any | None = None
        if isinstance(model_name, str) and model_name:
            try:
                runtime = agent.runtime_resolver.resolve_preset(model_name)
            except Exception as exc:
                logger.warning(
                    "Journal model preset unavailable, using the chat model: {}",
                    type(exc).__name__,
                )
                runtime = None
        direct_kwargs: dict[str, Any] = {
            "session_key": f"journal:{datetime.now():%Y%m%d-%H%M%S}",
            "ephemeral": True,
            "on_progress": _silent,
        }
        if runtime is not None:
            direct_kwargs["runtime"] = runtime
        try:
            resp = await agent.process_direct(prompt, **direct_kwargs)
        finally:
            prune_journal_sessions(agent.sessions)
        content = getattr(resp, "content", "") if resp is not None else ""
        return content if isinstance(content, str) else ""

    return turn


async def run_journal_job(agent: Any, *, tz_name: str | None = None) -> None:
    """Write today's journal. The server writes the file. Nothing is delivered."""
    workspace = Path(agent.context.memory.workspace)
    # A job left over from before the journal was turned off does nothing.
    if not load_settings(workspace)["enabled"]:
        return
    await execute_day(workspace, agent.sessions, local_today(tz_name), agent_turn(agent), tz_name=tz_name)


def _workspace(router: Any) -> Path:
    return Path(router.skills_workspace_path)


def _authorized(router: Any, request: WsRequest) -> bool:
    tokens = getattr(router, "tokens", None)
    if tokens is not None and hasattr(tokens, "check_api_token"):
        return bool(tokens.check_api_token(request))
    return False


def dispatch_journal_get(router: Any, request: WsRequest, got: str) -> Response | None:
    if got != PREFIX and not got.startswith(PREFIX + "/"):
        return None
    if not _authorized(router, request):
        return http_error(401, "Unauthorized")
    workspace = _workspace(router)
    if got == PREFIX:
        settings = load_settings(workspace)
        return http_json_response(
            {
                "enabled": settings["enabled"],
                "hour": settings["hour"],
                "model": settings["model"],
                "days": list_days(workspace),
            },
            extra_headers=[("Cache-Control", "no-store")],
        )
    if got == PREFIX + "/day":
        query = parse_qs(urlsplit(request.path).query)
        raw = (query.get("date") or [None])[0]
        try:
            day = parse_day(raw)
            text = read_day(workspace, day)
        except JournalError as exc:
            return http_json_response(
                {"error": exc.code},
                status=exc.status,
                extra_headers=[("Cache-Control", "no-store")],
            )
        return http_json_response(
            {"date": day.isoformat(), "text": text},
            extra_headers=[("Cache-Control", "no-store")],
        )
    return http_json_response({"error": "not_found"}, status=404, extra_headers=[("Cache-Control", "no-store")])


def journal_post_handler(
    secret: str,
    tokens: Any,
    fallback: Callable[[web.BaseRequest], Awaitable[web.StreamResponse]],
    *,
    cron: CronService | None = None,
    workspace: Path | None = None,
    sessions: SessionManager | None = None,
    timezone: str | None = None,
) -> Callable[[web.BaseRequest], Awaitable[web.StreamResponse]]:
    async def handler(request: web.BaseRequest) -> web.StreamResponse:
        path = request.path
        if path != PREFIX and not path.startswith(PREFIX + "/"):
            return await fallback(request)
        response = await _handle_post(
            secret, tokens, request, cron=cron, workspace=workspace, sessions=sessions, timezone=timezone
        )
        response.headers["Cache-Control"] = "no-store"
        response.force_close()
        return response

    return handler


async def _read_json(request: web.BaseRequest) -> dict[str, Any]:
    raw = await request.content.read()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        raise JournalError(400, "invalid_json") from None
    if not isinstance(data, dict):
        raise JournalError(400, "invalid_json")
    return cast(dict[str, Any], data)


async def _handle_post(
    secret: str,
    tokens: Any,
    request: web.BaseRequest,
    *,
    cron: CronService | None,
    workspace: Path | None,
    sessions: SessionManager | None,
    timezone: str | None,
) -> web.StreamResponse:
    if request.method != "POST":
        return web.json_response({"error": "method_not_allowed"}, status=405)
    if not admin_authorized(secret, tokens, request):
        return web.json_response({"error": "unauthorized"}, status=401)
    if sessions is None:
        return web.json_response({"error": "unavailable"}, status=503)
    if workspace is None or timezone is None:
        # The websocket channel only holds its own config; the agent's workspace and timezone are in the main one.
        from nanobot.config.loader import load_config

        config = load_config()
        workspace = workspace or config.workspace_path
        timezone = timezone or config.agents.defaults.timezone
    try:
        body = await _read_json(request)
        if request.path == PREFIX + "/settings":
            from nanobot.config.loader import load_config

            preset_names = frozenset(load_config().model_presets.keys())
            saved = save_settings(workspace, body, preset_names=preset_names)
            if cron is not None:
                sync_journal_job(cron, workspace, timezone)
            return web.json_response(saved)
        if request.path == PREFIX + "/run":
            raw_date = body.get("date")
            day = local_today(timezone) if raw_date in (None, "") else parse_day(raw_date if isinstance(raw_date, str) else None)
            if _runner is None:
                return web.json_response({"error": "unavailable"}, status=503)
            result = await execute_day(workspace, sessions, day, _runner, tz_name=timezone)
            return web.json_response(result)
    except JournalError as exc:
        return web.json_response({"error": exc.code}, status=exc.status)
    return web.json_response({"error": "not_found"}, status=404)
