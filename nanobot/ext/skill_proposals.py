"""Proposed skills: the bot suggests reusable procedures, the user reviews and activates."""

from __future__ import annotations

import asyncio
import json
import re
import shutil
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast
from urllib.parse import unquote

from aiohttp import web
from websockets.http11 import Request as WsRequest
from websockets.http11 import Response

from nanobot.agent.tools.base import Tool, ToolResult
from nanobot.agent.tools.registry import ToolRegistry
from nanobot.cron.service import CronService
from nanobot.cron.types import CronJob, CronPayload, CronSchedule
from nanobot.ext.devices import (
    DeviceError,
    admin_authorized,
    require_privileged,
    router_admin_authorized,
)
from nanobot.ext.devices import (
    read_json as devices_read_json,
)
from nanobot.session.history_visibility import is_hidden_history_message
from nanobot.session.manager import SessionManager
from nanobot.webui.http_utils import http_error, http_json_response

PREFIX = "/api/ext/skills"
PROPOSALS_DIR_NAME = "skills-proposed"
SKILLS_DIR_NAME = "skills"
MAX_NAME_LENGTH = 64
CHAR_CAP = 24_000
MAX_CONTENT_BYTES = 64 * 1024
MAX_SUMMARY_CHARS = 300
MAX_REASON_CHARS = 500
_NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_Turn = Callable[..., Awaitable[Any]]
_runner: _Turn | None = None


class SkillProposalError(Exception):
    def __init__(self, status: int, code: str) -> None:
        self.status = status
        self.code = code
        super().__init__(code)


def bind_skill_proposals_turn(turn: _Turn | None) -> None:
    global _runner
    _runner = turn


def is_valid_proposal_name(name: str) -> bool:
    if not name:
        return False
    if len(name) > MAX_NAME_LENGTH:
        return False
    if "/" in name or "\\" in name or ".." in name:
        return False
    return bool(_NAME_RE.fullmatch(name))


def proposals_dir(workspace: Path) -> Path:
    return workspace / PROPOSALS_DIR_NAME


def proposal_path(workspace: Path, name: str) -> Path:
    if not is_valid_proposal_name(name):
        raise SkillProposalError(400, "invalid_name")
    return proposals_dir(workspace) / name


def active_skills_dir(workspace: Path) -> Path:
    return workspace / SKILLS_DIR_NAME


def cursor_file_path(workspace: Path) -> Path:
    return proposals_dir(workspace) / ".cursor"


def scout_settings_path(workspace: Path) -> Path:
    return proposals_dir(workspace) / "scout.json"


def load_scout_settings(workspace: Path) -> dict[str, Any]:
    path = scout_settings_path(workspace)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            raw = cast(dict[str, Any], data)
            return {"enabled": raw.get("enabled") is True}
    except (OSError, ValueError):
        pass
    return {"enabled": False}


def save_scout_settings(workspace: Path, settings: dict[str, Any]) -> dict[str, Any]:
    enabled = settings.get("enabled") is True
    clean = {"enabled": enabled}
    path = scout_settings_path(workspace)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(clean), encoding="utf-8")
    return clean


def sync_scout_job(cron: CronService, workspace: Path, tz_name: str | None) -> None:
    settings = load_scout_settings(workspace)
    if not settings["enabled"]:
        cron.remove_system_job("skill-scout")
        return
    cron.register_system_job(
        CronJob(
            id="skill-scout",
            name="skill-scout",
            schedule=CronSchedule(
                kind="cron",
                expr="0 3 * * *",
                tz=tz_name,
            ),
            payload=CronPayload(kind="system_event"),
        )
    )


def list_proposals(workspace: Path) -> list[dict[str, Any]]:
    pdir = proposals_dir(workspace)
    if not pdir.is_dir():
        return []
    items: list[dict[str, Any]] = []
    for entry in pdir.iterdir():
        if not entry.is_dir():
            continue
        meta_file = entry / "proposal.json"
        skill_file = entry / "SKILL.md"
        if not meta_file.exists() or not skill_file.exists():
            continue
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(meta, dict):
            items.append(cast(dict[str, Any], meta))
    items.sort(key=lambda x: str(x.get("created_at") or x.get("date") or ""), reverse=True)
    return items


def get_proposal(workspace: Path, name: str) -> dict[str, Any]:
    p_dir = proposal_path(workspace, name)
    skill_file = p_dir / "SKILL.md"
    meta_file = p_dir / "proposal.json"
    if not skill_file.is_file() or not meta_file.is_file():
        raise SkillProposalError(404, "not_found")
    try:
        content = skill_file.read_text(encoding="utf-8")
        meta = json.loads(meta_file.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise SkillProposalError(500, "read_error") from exc
    return {
        **meta,
        "name": name,
        "content": content,
        "text": content,
        "raw_markdown": content,
    }


def write_proposal(
    workspace: Path,
    *,
    name: str,
    summary: str,
    reason: str,
    content: str,
    source: str = "chat",
    session_key: str | None = None,
) -> dict[str, Any]:
    if not is_valid_proposal_name(name):
        raise SkillProposalError(400, "invalid_name")
    if len(summary.strip()) > MAX_SUMMARY_CHARS:
        raise SkillProposalError(400, "summary_too_long")
    if len(reason.strip()) > MAX_REASON_CHARS:
        raise SkillProposalError(400, "reason_too_long")
    if len(content.encode("utf-8")) > MAX_CONTENT_BYTES:
        raise SkillProposalError(400, "content_too_large")
    p_dir = proposal_path(workspace, name)
    p_dir.mkdir(parents=True, exist_ok=True)
    (p_dir / "SKILL.md").write_text(content, encoding="utf-8")

    active_file = active_skills_dir(workspace) / name / "SKILL.md"
    from nanobot.agent.skills import SkillsLoader
    loader = SkillsLoader(workspace)
    builtin_names = {s["name"] for s in loader.list_skills(filter_unavailable=False) if s.get("source") == "builtin"}

    now_iso = datetime.now(timezone.utc).isoformat()
    meta: dict[str, Any] = {
        "name": name,
        "summary": summary.strip(),
        "reason": reason.strip(),
        "source": source,
        "created_at": now_iso,
        "date": now_iso,
    }
    if session_key:
        meta["session_key"] = session_key
    if active_file.exists() or name in builtin_names:
        meta["updates"] = name
    (p_dir / "proposal.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def activate_proposal(workspace: Path, name: str) -> dict[str, Any]:
    p_dir = proposal_path(workspace, name)
    skill_file = p_dir / "SKILL.md"
    if not skill_file.is_file():
        raise SkillProposalError(404, "not_found")
    target_dir = active_skills_dir(workspace) / name
    target_dir.mkdir(parents=True, exist_ok=True)
    target_file = target_dir / "SKILL.md"
    target_bak = target_dir / "SKILL.md.bak"

    if target_file.exists():
        target_file.replace(target_bak)
    shutil.copy2(skill_file, target_file)
    shutil.rmtree(p_dir, ignore_errors=True)
    return {"ok": True, "name": name, "activated": True}


def reject_proposal(workspace: Path, name: str) -> dict[str, Any]:
    p_dir = proposal_path(workspace, name)
    if not p_dir.is_dir():
        raise SkillProposalError(404, "not_found")
    shutil.rmtree(p_dir, ignore_errors=True)
    return {"ok": True, "deleted": True}


class WriteProposalTool(Tool):
    """Tool that writes a proposed skill strictly under skills-proposed/."""

    def __init__(
        self,
        workspace: Path,
        source: str = "chat",
        session_key: str | None = None,
        max_proposals: int = 1,
        on_proposal_written: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self.workspace = workspace
        self.source = source
        self.session_key = session_key
        self.max_proposals = max_proposals
        self.on_proposal_written = on_proposal_written
        self.written: list[dict[str, Any]] = []

    @property
    def name(self) -> str:
        return "write_proposal"

    @property
    def description(self) -> str:
        return "Write a proposed skill to skills-proposed for user review."

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Hyphen-case skill name (lowercase, digits, hyphens, <=64 chars)"},
                "summary": {"type": "string", "description": "1-2 line summary of what the skill does"},
                "reason": {"type": "string", "description": "Why this skill was proposed (context or pattern)"},
                "content": {"type": "string", "description": "Full SKILL.md content with YAML frontmatter"},
            },
            "required": ["name", "summary", "reason", "content"],
        }

    async def execute(self, **kwargs: Any) -> Any:
        if len(self.written) >= self.max_proposals:
            return ToolResult.error(f"Maximum limit of {self.max_proposals} proposals reached.")
        name = str(kwargs.get("name") or "").strip()
        summary = str(kwargs.get("summary") or "").strip()
        reason = str(kwargs.get("reason") or "").strip()
        content = str(kwargs.get("content") or "")
        if not is_valid_proposal_name(name):
            return ToolResult.error(f"Invalid skill name '{name}'. Must be hyphen-case lowercase and <= 64 chars.")
        try:
            meta = await asyncio.to_thread(
                write_proposal,
                self.workspace,
                name=name,
                summary=summary,
                reason=reason,
                content=content,
                source=self.source,
                session_key=self.session_key,
            )
            self.written.append(meta)
            if self.on_proposal_written is not None:
                self.on_proposal_written(meta)
            return ToolResult(f"Proposal '{name}' written successfully.")
        except Exception as exc:
            return ToolResult.error(f"Failed to write proposal: {exc}")


async def prune_proposal_sessions(sessions: SessionManager, *, keep: int = 10) -> None:
    state = sessions.state
    rows = await state.list_sessions()
    keys = [str(row.get("key") or "") for row in rows]
    for key in [k for k in keys if k.startswith("skillprop:")][keep:]:
        await state.delete(key)


def agent_turn(agent: Any) -> _Turn:
    """One skill proposal turn in an ephemeral session."""

    async def _silent(*_args: Any, **_kwargs: Any) -> None:
        return None

    async def turn(prompt: str, tools: ToolRegistry | None = None, session_key: str | None = None) -> Any:
        direct_kwargs: dict[str, Any] = {
            "session_key": session_key or f"skillprop:{datetime.now():%Y%m%d-%H%M%S}",
            "ephemeral": True,
            "on_progress": _silent,
        }
        if tools is not None:
            direct_kwargs["tools"] = tools
        try:
            resp = await agent.process_direct(prompt, **direct_kwargs)
        finally:
            await prune_proposal_sessions(agent.sessions)
        return resp

    return turn


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
            if isinstance(block, dict):
                rec = cast(dict[str, Any], block)
                val = rec.get("text")
                if rec.get("type") == "text" and isinstance(val, str):
                    parts.append(val)
        text = "\n".join(parts).strip()
    else:
        return None
    if not text:
        return None
    who = "user" if role == "user" else "assistant"
    return f"{who}: {text}"


async def propose_from_chat(
    workspace: Path,
    sessions: SessionManager,
    session_key: str,
) -> dict[str, Any]:
    session = await sessions.state.read(session_key)
    if session is None:
        raise SkillProposalError(404, "session_not_found")
    if not session.messages:
        return {"proposal": None, "reason": "No messages in this chat"}

    lines: list[str] = []
    for msg in session.messages:
        t = _message_text(msg)
        if t:
            lines.append(t)
    if not lines:
        return {"proposal": None, "reason": "No visible conversation messages found"}

    full_text = "\n".join(lines)
    if len(full_text) > CHAR_CAP:
        full_text = full_text[-CHAR_CAP:]

    written_proposals: list[dict[str, Any]] = []

    def on_written(p: dict[str, Any]) -> None:
        written_proposals.append(p)

    tool = WriteProposalTool(
        workspace,
        source="chat",
        session_key=session_key,
        max_proposals=1,
        on_proposal_written=on_written,
    )
    registry = ToolRegistry()
    registry.register(tool)

    prompt = (
        "You are evaluating a conversation to propose a reusable skill (SKILL.md) if a useful procedure was performed.\n"
        "Read the following conversation messages:\n"
        "---\n"
        f"{full_text}\n"
        "---\n"
        "If the chat contains a reusable multi-step procedure that is worth saving as an agent skill, "
        "call the write_proposal tool with a valid hyphen-case name, summary, reason, and SKILL.md content (YAML frontmatter + markdown instructions).\n"
        "If there is nothing reusable (e.g. casual conversation, one-off factual answer, simple inquiry), "
        "do NOT call write_proposal; instead explain why."
    )

    runner = _runner
    if runner is not None:
        turn_key = f"skillprop:{datetime.now():%Y%m%d-%H%M%S}"
        result = await runner(prompt, tools=registry, session_key=turn_key)
        meta = cast(dict[str, Any] | None, getattr(result, "metadata", None))
        if isinstance(meta, dict) and meta.get("_stop_reason") == "error":
            raise SkillProposalError(502, "turn_failed")
        reason_text = ""
        if isinstance(result, str):
            reason_text = result
        elif hasattr(result, "content") and isinstance(result.content, str):
            reason_text = result.content
        if written_proposals:
            return {"proposal": written_proposals[0]}
        return {"proposal": None, "reason": reason_text or "No reusable procedure found"}

    return {"proposal": None, "reason": "Proposal turn runner not available"}


def _read_scout_job_data(workspace: Path) -> tuple[bool, int, list[dict[str, Any]], int]:
    if not load_scout_settings(workspace)["enabled"]:
        return False, 0, [], 0

    history_file = workspace / "memory" / "history.jsonl"
    if not history_file.exists():
        return True, 0, [], 0

    cursor_file = cursor_file_path(workspace)
    stored_cursor = 0
    if cursor_file.exists():
        try:
            stored_cursor = int(cursor_file.read_text(encoding="utf-8").strip())
        except (ValueError, OSError):
            stored_cursor = 0

    new_entries: list[dict[str, Any]] = []
    max_seen_cursor = stored_cursor
    try:
        with open(history_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except ValueError:
                    continue
                c = entry.get("cursor")
                if isinstance(c, int):
                    if c > stored_cursor:
                        new_entries.append(entry)
                    if c > max_seen_cursor:
                        max_seen_cursor = c
    except OSError:
        return True, stored_cursor, [], stored_cursor

    return True, stored_cursor, new_entries, max_seen_cursor


def _write_scout_cursor(workspace: Path, cursor: int) -> None:
    c_file = cursor_file_path(workspace)
    c_file.parent.mkdir(parents=True, exist_ok=True)
    c_file.write_text(str(cursor), encoding="utf-8")


async def run_scout_job(agent: Any, *, tz_name: str | None = None) -> None:
    workspace = Path(agent.context.memory.workspace)
    enabled, _stored, new_entries, max_seen_cursor = await asyncio.to_thread(_read_scout_job_data, workspace)
    if not enabled or not new_entries:
        return

    texts = [f"[{e.get('timestamp')}] {e.get('content')}" for e in new_entries if e.get("content")]
    summary_text = "\n".join(texts)
    if len(summary_text) > CHAR_CAP:
        summary_text = summary_text[-CHAR_CAP:]

    tool = WriteProposalTool(
        workspace,
        source="scout",
        max_proposals=2,
    )
    registry = ToolRegistry()
    registry.register(tool)

    prompt = (
        "You are the skill scout inspecting recent agent activity history for repeated or hard-won procedures.\n"
        "Recent activity entries:\n"
        "---\n"
        f"{summary_text}\n"
        "---\n"
        "If you identify valuable procedures that should become reusable skills, call write_proposal (at most 2).\n"
        "Otherwise, do not call the tool."
    )

    runner = _runner or agent_turn(agent)
    turn_key = f"skillprop:scout:{datetime.now():%Y%m%d-%H%M%S}"
    result = await runner(prompt, tools=registry, session_key=turn_key)

    meta = cast(dict[str, Any] | None, getattr(result, "metadata", None))
    if isinstance(meta, dict) and meta.get("_stop_reason") == "error":
        return

    await asyncio.to_thread(_write_scout_cursor, workspace, max_seen_cursor)


def _workspace(router: Any) -> Path:
    if hasattr(router, "skills_workspace_path"):
        return Path(router.skills_workspace_path)
    if hasattr(router, "workspace"):
        return Path(router.workspace)
    from nanobot.config.loader import load_config
    return load_config().workspace_path


def dispatch_skill_proposals_get(router: Any, request: WsRequest, got: str) -> Response | None:
    if got != PREFIX and not got.startswith(PREFIX + "/"):
        return None
    secret = router.config.token_issue_secret.strip() or router.config.token.strip()
    if not router_admin_authorized(secret, router, request):
        return http_error(401, "Unauthorized")
    workspace = _workspace(router)

    if got == PREFIX + "/proposals":
        return http_json_response(
            {"proposals": list_proposals(workspace)},
            extra_headers=[("Cache-Control", "no-store")],
        )

    if got.startswith(PREFIX + "/proposals/"):
        raw_name = got[len(PREFIX + "/proposals/"):].strip()
        name = unquote(raw_name)
        if not is_valid_proposal_name(name):
            return http_json_response({"error": "invalid_name"}, status=400, extra_headers=[("Cache-Control", "no-store")])
        try:
            prop = get_proposal(workspace, name)
            return http_json_response(prop, extra_headers=[("Cache-Control", "no-store")])
        except SkillProposalError as exc:
            return http_json_response({"error": exc.code}, status=exc.status, extra_headers=[("Cache-Control", "no-store")])

    if got == PREFIX + "/scout":
        return http_json_response(load_scout_settings(workspace), extra_headers=[("Cache-Control", "no-store")])

    return http_json_response({"error": "not_found"}, status=404, extra_headers=[("Cache-Control", "no-store")])


def skill_proposals_post_handler(
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
    if workspace is None:
        from nanobot.config.loader import load_config
        workspace = load_config().workspace_path

    path = request.path

    try:
        body = await devices_read_json(request)

        if path == PREFIX + "/scout":
            enabled = body.get("enabled")
            if not isinstance(enabled, bool):
                return web.json_response({"error": "invalid_settings"}, status=400)
            saved = await asyncio.to_thread(save_scout_settings, workspace, {"enabled": enabled})
            if cron is not None:
                if timezone is None:
                    from nanobot.config.loader import load_config
                    timezone = load_config().agents.defaults.timezone
                sync_scout_job(cron, workspace, timezone)
            return web.json_response(saved)

        if path == PREFIX + "/propose":
            session_key = body.get("session_key")
            if not isinstance(session_key, str) or not session_key.strip():
                return web.json_response({"error": "invalid_session_key"}, status=400)
            if sessions is None:
                return web.json_response({"error": "unavailable"}, status=503)
            res = await propose_from_chat(workspace, sessions, session_key.strip())
            return web.json_response(res)

        m = re.match(r"^/api/ext/skills/proposals/([^/]+)/(activate|reject)$", path)
        if m:
            raw_name = m.group(1)
            action = m.group(2)
            name = unquote(raw_name)
            if not is_valid_proposal_name(name):
                return web.json_response({"error": "invalid_name"}, status=400)

            if action == "activate":
                priv_err = require_privileged(request)
                if priv_err is not None:
                    return priv_err
                res = await asyncio.to_thread(activate_proposal, workspace, name)
                return web.json_response(res)

            if action == "reject":
                res = await asyncio.to_thread(reject_proposal, workspace, name)
                return web.json_response(res)

    except SkillProposalError as exc:
        return web.json_response({"error": exc.code}, status=exc.status)
    except DeviceError as exc:
        return web.json_response({"error": exc.code}, status=exc.status)

    return web.json_response({"error": "not_found"}, status=404)
