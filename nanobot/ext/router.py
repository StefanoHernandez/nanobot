"""Central registry for fork /api/ext HTTP routes."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from importlib import import_module
from typing import Any, Literal

from aiohttp import web

_GetMode = Literal["thread", "await", "sync"]

# POST chain order (innermost first). Prefixes are disjoint; order only affects speed.
_POST_CHAIN: tuple[tuple[str, str], ...] = (
    ("nanobot.ext.projects", "projects_post_handler"),
    ("nanobot.ext.devices", "devices_post_handler"),
    ("nanobot.ext.kanban", "kanban_post_handler"),
    ("nanobot.ext.approvals", "approvals_post_handler"),
    ("nanobot.ext.costs", "costs_post_handler"),
    ("nanobot.ext.prompts", "prompts_post_handler"),
    ("nanobot.ext.backup", "backup_post_handler"),
    ("nanobot.ext.journal", "journal_post_handler"),
    ("nanobot.ext.automations", "automations_post_handler"),
    ("nanobot.ext.skill_proposals", "skill_proposals_post_handler"),
)

# GET dispatch order. Prefixes are disjoint; order only affects speed.
_GET_DISPATCH: tuple[tuple[str, str, _GetMode], ...] = (
    ("nanobot.ext.projects", "dispatch_projects_get", "thread"),
    ("nanobot.ext.memory_pages", "dispatch_memory_get", "sync"),
    ("nanobot.ext.journal", "dispatch_journal_get", "sync"),
    ("nanobot.ext.devices", "dispatch_devices_get", "sync"),
    ("nanobot.ext.kanban", "dispatch_kanban_get", "sync"),
    ("nanobot.ext.approvals", "dispatch_approvals_get", "sync"),
    ("nanobot.ext.system", "dispatch_system_get", "sync"),
    ("nanobot.ext.costs", "dispatch_costs_get", "sync"),
    ("nanobot.ext.prompts", "dispatch_prompts_get", "sync"),
    ("nanobot.ext.backup", "dispatch_backup_get", "sync"),
    ("nanobot.ext.search", "dispatch_search_get", "await"),
    ("nanobot.ext.skill_proposals", "dispatch_skill_proposals_get", "sync"),
)

_CRON_POST_MODULES = frozenset(
    {
        "nanobot.ext.journal",
        "nanobot.ext.automations",
        "nanobot.ext.skill_proposals",
    }
)


def ext_post_handler(
    channel: Any,
    fallback: Callable[[web.BaseRequest], Awaitable[web.StreamResponse]],
) -> Callable[[web.BaseRequest], Awaitable[web.StreamResponse]]:
    """Build the POST handler chain for every ``/api/ext/*`` route (same as websocket ``start()``)."""
    from nanobot.ext.devices import install_connection_tracking

    install_connection_tracking()
    secret = (channel.config.token_issue_secret or "").strip() or (channel.config.token or "").strip()
    tokens = channel.gateway.tokens
    workspaces = channel.gateway.workspaces
    cron = channel.gateway.cron_service
    sessions = channel.gateway.session_manager

    chain: Callable[[web.BaseRequest], Awaitable[web.StreamResponse]] = fallback
    for mod_name, factory_name in _POST_CHAIN:
        factory = getattr(import_module(mod_name), factory_name)
        if mod_name == "nanobot.ext.projects":
            chain = factory(tokens, workspaces, chain)
        elif mod_name in _CRON_POST_MODULES:
            chain = factory(secret, tokens, chain, cron=cron, sessions=sessions)
        else:
            chain = factory(secret, tokens, chain)
    return chain


async def dispatch_ext_get(server: Any, request: Any, got: str) -> Any:
    """Run GET dispatchers for ``/api/ext/*`` in today's order; ``None`` if no module matched."""
    for mod_name, factory_name, mode in _GET_DISPATCH:
        dispatch = getattr(import_module(mod_name), factory_name)
        if mode == "thread":
            response = await asyncio.to_thread(dispatch, server, request, got)
        elif mode == "await":
            response = await dispatch(server, request, got)
        else:
            response = dispatch(server, request, got)
        if response is not None:
            return response
    return None
