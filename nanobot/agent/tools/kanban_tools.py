"""Kanban agent tools (store-only; no dispatcher)."""

# pyright: reportIncompatibleMethodOverride=false

from __future__ import annotations

import json
from typing import Any

from nanobot.agent.tools.base import Tool, ToolResult, tool_parameters
from nanobot.agent.tools.context import ToolContext
from nanobot.agent.tools.schema import BooleanSchema, StringSchema, tool_parameters_schema
from nanobot.ext.kanban import KanbanError, KanbanStore

_SCOPES = {"core", "subagent"}


def _store() -> KanbanStore:
    return KanbanStore()


def _json_payload(data: Any) -> str:
    return json.dumps(data, separators=(",", ":"), default=str)


def _kanban_error(exc: KanbanError) -> ToolResult:
    return ToolResult.error(f"kanban error: {exc.code}")


@tool_parameters(
    tool_parameters_schema(
        task_id=StringSchema("Kanban task id"),
        required=["task_id"],
    )
)
class KanbanShowTool(Tool):
    """Show kanban task detail including parents, runs, and messages."""

    _scopes = _SCOPES

    @property
    def name(self) -> str:
        return "kanban_show"

    @property
    def description(self) -> str:
        return "Return full kanban task detail (parents, runs, messages)."

    @property
    def read_only(self) -> bool:
        return True

    @classmethod
    def create(cls, ctx: ToolContext) -> Tool:
        return cls()

    async def execute(self, **kwargs: Any) -> Any:
        task_id = kwargs.get("task_id")
        if not isinstance(task_id, str) or not task_id.strip():
            return ToolResult.error("task_id is required")
        try:
            detail = _store().get_task_detail(task_id.strip())
        except KanbanError as exc:
            return _kanban_error(exc)
        return _json_payload(detail)


@tool_parameters(
    tool_parameters_schema(
        task_id=StringSchema("Kanban task id"),
        summary=StringSchema("Completion summary"),
        artifacts=StringSchema("JSON array of artifact strings"),
        required=["task_id", "summary"],
    )
)
class KanbanCompleteTool(Tool):
    _scopes = _SCOPES

    @property
    def name(self) -> str:
        return "kanban_complete"

    @property
    def description(self) -> str:
        return "Mark the active kanban task run complete."

    @classmethod
    def create(cls, ctx: ToolContext) -> Tool:
        return cls()

    async def execute(self, **kwargs: Any) -> Any:
        task_id = kwargs.get("task_id")
        summary = kwargs.get("summary")
        if not isinstance(task_id, str) or not isinstance(summary, str):
            return ToolResult.error("task_id and summary are required")
        artifacts_raw = kwargs.get("artifacts")
        artifacts: list[str] | None = None
        if artifacts_raw is not None:
            if isinstance(artifacts_raw, str):
                try:
                    parsed = json.loads(artifacts_raw)
                except ValueError:
                    return ToolResult.error("artifacts must be a JSON array")
                artifacts = parsed if isinstance(parsed, list) else None
            elif isinstance(artifacts_raw, list):
                artifacts = artifacts_raw
            if artifacts is None:
                return ToolResult.error("artifacts must be a JSON array")
        try:
            task = _store().complete_task(task_id.strip(), summary, artifacts)
        except KanbanError as exc:
            return _kanban_error(exc)
        return _json_payload({"task_id": task["id"], "status": task["status"]})


@tool_parameters(
    tool_parameters_schema(
        task_id=StringSchema("Kanban task id"),
        summary=StringSchema("Summary for review"),
        artifacts=StringSchema("JSON array of artifact strings"),
        required=["task_id", "summary"],
    )
)
class KanbanRequestReviewTool(Tool):
    _scopes = _SCOPES

    @property
    def name(self) -> str:
        return "kanban_request_review"

    @property
    def description(self) -> str:
        return "Move a kanban task to review with summary and artifacts."

    @classmethod
    def create(cls, ctx: ToolContext) -> Tool:
        return cls()

    async def execute(self, **kwargs: Any) -> Any:
        task_id = kwargs.get("task_id")
        summary = kwargs.get("summary")
        if not isinstance(task_id, str) or not isinstance(summary, str):
            return ToolResult.error("task_id and summary are required")
        artifacts: list[str] | None = None
        artifacts_raw = kwargs.get("artifacts")
        if isinstance(artifacts_raw, str):
            try:
                parsed = json.loads(artifacts_raw)
                if isinstance(parsed, list):
                    artifacts = parsed
            except ValueError:
                return ToolResult.error("artifacts must be a JSON array")
        elif isinstance(artifacts_raw, list):
            artifacts = artifacts_raw
        try:
            task = _store().request_review(task_id.strip(), summary, artifacts)
        except KanbanError as exc:
            return _kanban_error(exc)
        return _json_payload({"task_id": task["id"], "status": task["status"]})


@tool_parameters(
    tool_parameters_schema(
        task_id=StringSchema("Kanban task id"),
        approved=BooleanSchema(description="Whether the review is approved"),
        feedback=StringSchema("Optional review feedback when not approved"),
        required=["task_id", "approved"],
    )
)
class KanbanReviewVerdictTool(Tool):
    _scopes = _SCOPES

    @property
    def name(self) -> str:
        return "kanban_review_verdict"

    @property
    def description(self) -> str:
        return "Approve or reject a kanban task in review."

    @classmethod
    def create(cls, ctx: ToolContext) -> Tool:
        return cls()

    async def execute(self, **kwargs: Any) -> Any:
        task_id = kwargs.get("task_id")
        approved = kwargs.get("approved")
        if not isinstance(task_id, str) or not isinstance(approved, bool):
            return ToolResult.error("task_id and approved are required")
        feedback = str(kwargs.get("feedback") or "")
        try:
            task = _store().review_verdict(task_id.strip(), approved, feedback)
        except KanbanError as exc:
            return _kanban_error(exc)
        return _json_payload({"task_id": task["id"], "status": task["status"]})


@tool_parameters(
    tool_parameters_schema(
        task_id=StringSchema("Kanban task id"),
        reason=StringSchema("Block reason"),
        required=["task_id", "reason"],
    )
)
class KanbanBlockTool(Tool):
    _scopes = _SCOPES

    @property
    def name(self) -> str:
        return "kanban_block"

    @property
    def description(self) -> str:
        return "Block a kanban task with a reason."

    @classmethod
    def create(cls, ctx: ToolContext) -> Tool:
        return cls()

    async def execute(self, **kwargs: Any) -> Any:
        task_id = kwargs.get("task_id")
        reason = kwargs.get("reason")
        if not isinstance(task_id, str) or not isinstance(reason, str):
            return ToolResult.error("task_id and reason are required")
        try:
            task = _store().block_task(task_id.strip(), reason)
        except KanbanError as exc:
            return _kanban_error(exc)
        return _json_payload({"task_id": task["id"], "status": task["status"]})
