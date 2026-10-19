"""Kanban agent tool (store-only; no dispatcher).

One tool with an ``action`` instead of five: every tool schema rides in every prompt.
"""

# pyright: reportIncompatibleMethodOverride=false

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, cast

from nanobot.agent.tools.base import Tool, ToolResult, tool_parameters
from nanobot.agent.tools.context import ToolContext, current_request_session_key
from nanobot.agent.tools.schema import BooleanSchema, StringSchema, tool_parameters_schema
from nanobot.ext.kanban import KanbanError, KanbanStore

_EVERY_RE = re.compile(r"^(\d+)([mhdw])$")
_EVERY_SECONDS = {"m": 60, "h": 3600, "d": 86400, "w": 7 * 86400}
_LIST_TASK_FIELDS = (
    "id",
    "title",
    "status",
    "priority",
    "assignee_bot_id",
    "scheduled_at_ms",
    "recurrence_expr",
)

# Main agent only: kanban turns run as main-agent sessions; subagents never touch the board.
_SCOPES = {"core"}

def _is_run_session() -> bool:
    """A kanban task run or wake. Those sessions must not create or edit cards."""
    return (current_request_session_key() or "").startswith("kanban:")


def _when_to_ms(raw: str) -> int:
    """Local ISO time, or ISO with an offset, as epoch milliseconds."""
    try:
        parsed = datetime.fromisoformat(raw.strip())
    except ValueError as exc:
        raise ValueError("invalid_when") from exc
    if parsed.tzinfo is None:
        parsed = parsed.astimezone()
    return int(parsed.timestamp() * 1000)


def _every_to_expr(raw: str) -> str:
    """``30m``, ``1h``, ``1d``, ``1w`` become ``every:<seconds>s``. Anything else is left for the store."""
    text = raw.strip()
    match = _EVERY_RE.fullmatch(text)
    if not match:
        return text
    seconds = int(match.group(1)) * _EVERY_SECONDS[match.group(2)]
    return f"every:{seconds}s"


def _resolve_bot(store: KanbanStore, raw: str) -> str | None | ToolResult:
    text = raw.strip()
    if not text:
        return None
    bots = store.list_bots()
    key = text.casefold()
    for bot in bots:
        if str(bot.get("id", "")).casefold() == key or str(bot.get("name", "")).casefold() == key:
            return str(bot["id"])
    names = ", ".join(str(bot.get("name") or bot.get("id")) for bot in bots)
    return ToolResult.error(f"kanban error: unknown_bot: {names}")


def _session_task_bot() -> tuple[str, str] | None:
    """(task_id, bot_id) of a task run session ``kanban:<task>:<bot>``; None for wakes or other sessions."""
    parts = (current_request_session_key() or "").split(":")
    if len(parts) == 3 and parts[0] == "kanban" and parts[1] != "wake":
        return parts[1], parts[2]
    return None


def _guard(task_id: str, *, verdict: bool = False) -> ToolResult | None:
    """A bot may change only the task its run belongs to; only the task's reviewer (not its assignee) rules on review."""
    owner = _session_task_bot()
    if owner is None or owner[0] != task_id:
        return ToolResult.error("kanban error: not_your_task")
    if verdict:
        try:
            task = _store().get_task_detail(task_id)
        except KanbanError as exc:
            return _kanban_error(exc)
        t = cast(dict[str, Any], task.get("task", task))
        if owner[1] != t.get("reviewer_bot_id") or owner[1] == t.get("assignee_bot_id"):
            return ToolResult.error("kanban error: not_reviewer")
    return None


def _store() -> KanbanStore:
    return KanbanStore()


def _json_payload(data: Any) -> str:
    return json.dumps(data, separators=(",", ":"), default=str)


def _kanban_error(exc: KanbanError) -> ToolResult:
    return ToolResult.error(f"kanban error: {exc.code}")


def _artifacts(raw: Any) -> list[str] | None | ToolResult:
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            return ToolResult.error("artifacts must be a JSON array")
    if not isinstance(raw, list):
        return ToolResult.error("artifacts must be a JSON array")
    return [str(a) for a in cast(list[Any], raw)]


ACTIONS = ("show", "list", "create", "update", "complete", "request_review", "verdict", "block")
_NEEDS_TASK = frozenset({"show", "update", "complete", "request_review", "verdict", "block"})


def _not_a_run() -> ToolResult | None:
    if _is_run_session():
        return ToolResult.error("kanban error: not_from_a_run")
    return None


def _put_when(body: dict[str, Any], raw: Any) -> ToolResult | None:
    if raw is None or raw == "":
        body["scheduled_at_ms"] = None
        return None
    if not isinstance(raw, str):
        return ToolResult.error("kanban error: invalid_when")
    try:
        body["scheduled_at_ms"] = _when_to_ms(raw)
    except ValueError:
        return ToolResult.error("kanban error: invalid_when")
    return None


def _put_every(body: dict[str, Any], raw: Any) -> None:
    if raw is None or raw == "":
        body["recurrence_expr"] = ""
        return
    body["recurrence_expr"] = _every_to_expr(raw) if isinstance(raw, str) else raw




def _list_board(store: KanbanStore, board_id: Any) -> str:
    chosen = board_id.strip() if isinstance(board_id, str) and board_id.strip() else "main"
    snap = store.board_snapshot(chosen)
    board = cast(dict[str, Any], snap["active_board"])
    tasks: list[dict[str, Any]] = []
    for row in cast(list[dict[str, Any]], snap["tasks"]):
        if row.get("status") == "archived":
            continue
        tasks.append({key: row.get(key) for key in _LIST_TASK_FIELDS})
    return _json_payload({
        "board": {"id": board.get("id"), "title": board.get("title")},
        "bots": [{"id": bot.get("id"), "name": bot.get("name")} for bot in store.list_bots()],
        "tasks": tasks,
    })


def _fill_card(store: KanbanStore, body: dict[str, Any], kwargs: dict[str, Any], task_id: str) -> ToolResult | None:
    if "bot" in kwargs:
        assignee = _resolve_bot(store, str(kwargs.get("bot") or ""))
        if isinstance(assignee, ToolResult):
            return assignee
        body["assignee_bot_id"] = assignee
    if "reviewer" in kwargs:
        reviewer = _resolve_bot(store, str(kwargs.get("reviewer") or ""))
        if isinstance(reviewer, ToolResult):
            return reviewer
        body["reviewer_bot_id"] = reviewer
    if "when" in kwargs and (failed := _put_when(body, kwargs.get("when"))) is not None:
        return failed
    if "every" in kwargs:
        _put_every(body, kwargs.get("every"))
    return None


def _create_task(store: KanbanStore, kwargs: dict[str, Any]) -> str | ToolResult:
    board_id = kwargs.get("board_id")
    body: dict[str, Any] = {
        "board_id": board_id.strip() if isinstance(board_id, str) and board_id.strip() else "main",
        "title": kwargs.get("title"),
        "status": "todo",
    }
    if "description" in kwargs:
        body["description"] = kwargs.get("description")
    if "priority" in kwargs:
        body["priority"] = kwargs.get("priority")
    if (failed := _fill_card(store, body, kwargs, "")) is not None:
        return failed
    body["status"] = "todo"
    task = store.save_task(body)
    note = (
        "The user must start this card from the Kanban screen."
        if kwargs.get("start") is True or kwargs.get("status") == "ready" or "every" in kwargs
        else None
    )
    payload: dict[str, Any] = {"task_id": task["id"], "status": task["status"]}
    if note:
        payload["note"] = note
    return _json_payload(payload)


def _update_task(store: KanbanStore, task_id: str, kwargs: dict[str, Any]) -> str | ToolResult:
    # Raises not_found for an unknown id; save_task would treat it as a new card and say invalid_board_id.
    current = cast(dict[str, Any], store.get_task_detail(task_id)["task"])
    current_status = current.get("status")
    if kwargs.get("start") is True and current_status in ("running", "review"):
        return ToolResult.error("kanban error: already_working")
    body: dict[str, Any] = {"id": task_id}
    for key in ("title", "description", "priority"):
        if key in kwargs:
            body[key] = kwargs.get(key)

    user_start_needed = False
    if "status" in kwargs:
        status_val = str(kwargs.get("status"))
        if status_val == "ready":
            user_start_needed = True
            if current_status != "ready":
                body["status"] = "todo"
            else:
                body["status"] = "ready"
        else:
            body["status"] = status_val
    elif kwargs.get("start") is True:
        user_start_needed = True
        if current_status != "ready":
            body["status"] = "todo"
        else:
            body["status"] = "ready"

    if (failed := _fill_card(store, body, kwargs, task_id)) is not None:
        return failed

    if "every" in kwargs:
        if current_status != "ready" and body.get("status") != "ready":
            user_start_needed = True
            body["status"] = "todo"

    task = store.save_task(body)
    payload: dict[str, Any] = {"task_id": task["id"], "status": task["status"]}
    if user_start_needed:
        payload["note"] = "The user must start this card from the Kanban screen."
    return _json_payload(payload)


_PARAMETERS = tool_parameters_schema(
        action=StringSchema(
            "list, show, create, update, complete, request_review, verdict, or block.",
            enum=ACTIONS,
        ),
        task_id=StringSchema("Task id, except for list and create"),
        board_id=StringSchema("Board id, default main"),
        title=StringSchema("Card title"),
        priority=StringSchema("low, medium, high, or urgent"),
        status=StringSchema("update: new status"),
        bot=StringSchema("Bot id or name; empty clears"),
        reviewer=StringSchema("Reviewer id or name; empty clears"),
        when=StringSchema("Local ISO time; empty clears"),
        every=StringSchema("Repeat as 30m, 1h, 1d, or 1w; empty clears"),
        start=BooleanSchema(description="Request card start (saved as todo; user must start from the Kanban screen)"),
        summary=StringSchema("complete / request_review: outcome summary"),
        artifacts=StringSchema("complete / request_review: JSON array of artifact paths or URLs"),
        approved=BooleanSchema(description="verdict: whether the review is approved"),
        feedback=StringSchema("verdict: feedback when not approved"),
        reason=StringSchema("block: why the task is blocked"),
        required=["action"],
    )
_PARAMETERS["properties"]["description"] = StringSchema("Card description").to_json_schema()


@tool_parameters(_PARAMETERS)
class KanbanTool(Tool):
    """List, create, and update cards, or finish the card a run is working on."""

    _scopes = _SCOPES

    @property
    def name(self) -> str:
        return "kanban"

    @property
    def description(self) -> str:
        return (
            "Kanban board: list cards, create or update a card for a bot "
            "(when = local ISO time, every = 30m/1h/1d/1w; new cards stay todo until started from the Kanban screen); "
            "from a task run: complete / request review / verdict / block your own task."
        )

    @classmethod
    def create(cls, ctx: ToolContext) -> Tool:
        return cls()

    async def execute(self, **kwargs: Any) -> Any:
        action = kwargs.get("action")
        if action not in ACTIONS:
            return ToolResult.error(f"action must be one of: {', '.join(ACTIONS)}")
        task_id = kwargs.get("task_id")
        if action in _NEEDS_TASK:
            if not isinstance(task_id, str) or not task_id.strip():
                return ToolResult.error("task_id is required")
            task_id = task_id.strip()
        else:
            task_id = ""
        if action in ("create", "update") and (denied := _not_a_run()) is not None:
            return denied
        store = _store()
        try:
            if action == "list":
                return _list_board(store, kwargs.get("board_id"))
            if action == "create":
                return _create_task(store, kwargs)
            if action == "update":
                return _update_task(store, task_id, kwargs)
            if action == "show":
                return _json_payload(store.get_task_detail(task_id))
            if action in ("complete", "request_review"):
                summary = kwargs.get("summary")
                if not isinstance(summary, str):
                    return ToolResult.error("summary is required")
                artifacts = _artifacts(kwargs.get("artifacts"))
                if isinstance(artifacts, ToolResult):
                    return artifacts
                if (denied := _guard(task_id)) is not None:
                    return denied
                move = store.complete_task if action == "complete" else store.request_review
                task = move(task_id, summary, artifacts)
            elif action == "verdict":
                approved = kwargs.get("approved")
                if not isinstance(approved, bool):
                    return ToolResult.error("approved is required")
                if (denied := _guard(task_id, verdict=True)) is not None:
                    return denied
                task = store.review_verdict(task_id, approved, str(kwargs.get("feedback") or ""))
            else:
                reason = kwargs.get("reason")
                if not isinstance(reason, str):
                    return ToolResult.error("reason is required")
                if (denied := _guard(task_id)) is not None:
                    return denied
                task = store.block_task(task_id, reason)
        except KanbanError as exc:
            return _kanban_error(exc)
        return _json_payload({"task_id": task["id"], "status": task["status"]})
