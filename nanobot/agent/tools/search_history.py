"""Search conversation history, journal, and kanban using full-text indexing."""

# pyright: reportIncompatibleMethodOverride=false

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any
from urllib.parse import quote

from nanobot.agent.tools.base import Tool, ToolResult, tool_parameters
from nanobot.agent.tools.context import ToolContext, current_request_session_key
from nanobot.agent.tools.schema import StringSchema, tool_parameters_schema
from nanobot.agent.tools.sessions import _UNTRUSTED_NOTICE  # pyright: ignore[reportPrivateUsage]
from nanobot.ext import search

_DEFAULT_LIMIT = 20


def _session_ref(session_key: str) -> str:
    return f"#session/{quote(session_key, safe='')}"


@tool_parameters(
    tool_parameters_schema(
        query=StringSchema(
            "Text or phrase to search across historical chats, journal entries, or kanban tasks.",
            min_length=1,
            max_length=500,
        ),
        sources=StringSchema(
            "Optional comma-separated list of sources to search: chats, journal, kanban. Defaults to all.",
        ),
        required=["query"],
    )
)
class SearchHistoryTool(Tool):
    """Full-text search across past chats, daily journal entries, and kanban cards."""

    def __init__(self, ctx: ToolContext | None = None) -> None:
        self._ctx = ctx

    @classmethod
    def create(cls, ctx: ToolContext) -> Tool:
        return cls(ctx)

    @property
    def name(self) -> str:
        return "search_history"

    @property
    def description(self) -> str:
        return (
            "Full-text search across past chats, daily journal entries, and kanban tasks. "
            "Prefer this over search_sessions when searching for older chats, exact phrases, "
            "journal entries, or kanban cards. Results include title, date, excerpt, and session_ref."
        )

    @property
    def read_only(self) -> bool:
        return True

    async def execute(
        self,
        query: str,
        sources: str | None = None,
        **kwargs: Any,
    ) -> str:
        query = query.strip()
        if not query:
            return ToolResult.error("Error: search query must not be empty")

        source_list = [s.strip() for s in sources.split(",") if s.strip()] if sources else None
        workspace = Path(self._ctx.workspace) if self._ctx and self._ctx.workspace else None
        sessions_dir = getattr(self._ctx.sessions, "sessions_dir", None) if self._ctx and self._ctx.sessions else None

        results = await asyncio.to_thread(
            search.search,
            query,
            sources=source_list,
            limit=_DEFAULT_LIMIT,
            workspace=workspace,
            sessions_dir=sessions_dir,
        )

        curr_session = current_request_session_key()
        lines: list[str] = []
        for r in results:
            if curr_session and r.get("source") == "chats" and r.get("session_key") == curr_session:
                continue
            title = r.get("title") or "Untitled"
            date_val = r.get("date") or r.get("ts") or ""
            snippet = r.get("snippet") or r.get("excerpt") or ""
            source = r.get("source")

            if source == "chats" and r.get("session_key"):
                s_ref = _session_ref(str(r["session_key"]))
                lines.append(f"- [{title}]({s_ref}) ({date_val}): {snippet}")
            else:
                ref = r.get("ref") or ""
                lines.append(f"- {title} [{ref}] ({date_val}): {snippet}")

        if not lines:
            return "No results found."

        return f"{_UNTRUSTED_NOTICE}\n\n" + "\n".join(lines)
