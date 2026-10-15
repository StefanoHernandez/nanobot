"""Kanban agent tool (store-only; no dispatcher).

One tool with an ``action`` instead of five: every tool schema rides in every prompt.
"""

# pyright: reportIncompatibleMethodOverride=false

from __future__ import annotations

import json
from typing import Any, cast

from nanobot.agent.tools.base import Tool, ToolResult, tool_parameters
from nanobot.agent.tools.context import ToolContext, current_request_session_key
from nanobot.agent.tools.schema import BooleanSchema, StringSchema, tool_parameters_schema
from nanobot.ext.kanban import KanbanError, KanbanStore

# Main agent only: kanban turns run as main-agent sessions; subagents never touch the board.
_SCOPES = {"core"}

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


ACTIONS = ("show", "complete", "request_review", "verdict", "block")


@tool_parameters(
    tool_parameters_schema(
        action=StringSchema(
            "show: task detail. complete / request_review: finish your run (summary, artifacts). "
            "verdict: approve or reject a task you review (approved, feedback). block: stop with a reason.",
            enum=ACTIONS,
        ),
        task_id=StringSchema("Kanban task id"),
        summary=StringSchema("complete / request_review: outcome summary"),
        artifacts=StringSchema("complete / request_review: JSON array of artifact paths or URLs"),
        approved=BooleanSchema(description="verdict: whether the review is approved"),
        feedback=StringSchema("verdict: feedback when not approved"),
        reason=StringSchema("block: why the task is blocked"),
        required=["action", "task_id"],
    )
)
class KanbanTool(Tool):
    """Read and move kanban tasks from a kanban run."""

    _scopes = _SCOPES

    @property
    def name(self) -> str:
        return "kanban"

    @property
    def description(self) -> str:
        return "Kanban board: show a task, or complete / request review / give a verdict / block your own task run."

    @classmethod
    def create(cls, ctx: ToolContext) -> Tool:
        return cls()

    async def execute(self, **kwargs: Any) -> Any:
        action = kwargs.get("action")
        task_id = kwargs.get("task_id")
        if action not in ACTIONS:
            return ToolResult.error(f"action must be one of: {', '.join(ACTIONS)}")
        if not isinstance(task_id, str) or not task_id.strip():
            return ToolResult.error("task_id is required")
        task_id = task_id.strip()
        store = _store()
        try:
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
