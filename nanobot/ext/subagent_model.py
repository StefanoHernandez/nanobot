"""Subagent model preset: let subagents run on a different model than the chat.

Config: ``agents.defaults.subagent_model_preset`` (None = same model as the chat),
editable from the settings UI like Dream's ``dream.model_override``.

Hooks into upstream code:
* ``AgentLoop.from_config`` calls ``attach(loop, preset)`` once;
* ``SubagentTool._create_task`` asks ``runtime_for(manager, chat_runtime)``.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from loguru import logger

_ATTR = "_ext_subagent_runtime"

# Runtime settings the fork exposes for the mobile app only (no WebUI field yet:
# adding one means touching all ten WebUI locale files upstream).
MOBILE_ONLY_RUNTIME_PATHS = frozenset({
    "agents.defaults.dream.model_override",
    "agents.defaults.subagent_model_preset",
})


def attach(loop: Any, preset_name: str | None) -> None:
    """Remember how to resolve the subagent preset on the loop's subagent manager."""
    manager = loop.subagents
    if not preset_name or preset_name == "default":
        if hasattr(manager, _ATTR):
            delattr(manager, _ATTR)
        return
    resolver = loop.runtime_resolver
    resolve: Callable[[], Any] = lambda: resolver.resolve_preset(preset_name)  # noqa: E731
    setattr(manager, _ATTR, resolve)


def runtime_for(manager: Any, chat_runtime: Any) -> Any:
    """Runtime for a new subagent: the configured preset, else the chat's own runtime."""
    resolve = getattr(manager, _ATTR, None)
    if resolve is None:
        return chat_runtime
    try:
        runtime = resolve()
    except Exception as exc:  # a preset removed or misconfigured must never block delegation
        logger.warning("Subagent model preset unavailable, using the chat model: {}", type(exc).__name__)
        return chat_runtime
    return runtime if runtime is not None else chat_runtime
