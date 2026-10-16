"""Prompt cache lifetime for Anthropic-style ``cache_control`` markers.

Config: ``agents.defaults.prompt_cache_ttl`` ("5m" or "1h", default "1h"). A 1h write
costs 2x input instead of 1.25x, and pays off when replies arrive minutes apart.
Keep ``idleCompactAfterMinutes`` near the TTL: an idle compaction rewrites the history
and throws the cached prefix away.

Hooks into upstream code:
* ``AgentLoop.from_config`` calls ``configure(ttl)`` once;
* the Anthropic and OpenAI-compatible providers build their markers with ``marker()``.
"""

from __future__ import annotations

from typing import Literal

PromptCacheTTL = Literal["5m", "1h"]

_ttl: PromptCacheTTL = "1h"


def configure(ttl: PromptCacheTTL) -> None:
    global _ttl
    _ttl = ttl


def marker() -> dict[str, str]:
    """A fresh ``cache_control`` value; "5m" omits ``ttl`` to keep the provider default."""
    if _ttl == "5m":
        return {"type": "ephemeral"}
    return {"type": "ephemeral", "ttl": _ttl}
