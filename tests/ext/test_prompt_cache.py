from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest

from nanobot.config.schema import Config
from nanobot.ext import prompt_cache
from nanobot.providers.anthropic_provider import AnthropicProvider
from nanobot.providers.openai_compat_provider import OpenAICompatProvider
from nanobot.webui.settings_contracts import WebUISettingsError
from nanobot.webui.settings_runtime import update_runtime_config


@pytest.fixture(autouse=True)
def _reset_ttl() -> Iterator[None]:
    yield
    prompt_cache.configure("1h")


def _markers(value: Any) -> list[dict[str, Any]]:
    """Every cache_control value anywhere in a request payload."""
    found: list[dict[str, Any]] = []
    if isinstance(value, dict):
        if "cache_control" in value:
            found.append(value["cache_control"])
        for child in value.values():
            found += _markers(child)
    elif isinstance(value, list):
        for child in value:
            found += _markers(child)
    return found


def _anthropic_tools(*names: str) -> list[dict[str, Any]]:
    return [{"name": n, "description": n, "input_schema": {"type": "object"}} for n in names]


def _openai_tools(*names: str) -> list[dict[str, Any]]:
    return [{"type": "function", "function": {"name": n, "parameters": {"type": "object"}}} for n in names]


def test_anthropic_marks_the_newest_message_with_one_hour_ttl() -> None:
    messages = [
        {"role": "user", "content": "u1"},
        {"role": "assistant", "content": "a1"},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t", "content": "big"}]},
    ]
    system, marked, tools = AnthropicProvider._apply_cache_control(
        "system", messages, _anthropic_tools("read_file", "mcp_x")
    )
    assert "cache_control" in marked[-1]["content"][-1]
    assert _markers(marked[:-1]) == []
    all_markers = _markers([system, marked, tools])
    assert len(all_markers) <= 4
    assert all(m == {"type": "ephemeral", "ttl": "1h"} for m in all_markers)


def test_openai_compat_marks_the_newest_message() -> None:
    messages = [
        {"role": "system", "content": "system"},
        {"role": "user", "content": "u1"},
        {"role": "assistant", "content": "a1"},
        {"role": "tool", "tool_call_id": "t", "content": "big"},
    ]
    marked, tools = OpenAICompatProvider._apply_cache_control(messages, _openai_tools("read_file"))
    assert marked[-1]["content"][-1]["cache_control"] == {"type": "ephemeral", "ttl": "1h"}
    assert _markers(marked[1:-1]) == []
    assert len(_markers([marked, tools])) == 3


def test_five_minute_ttl_keeps_the_provider_default_marker() -> None:
    prompt_cache.configure("5m")
    _, marked, _ = AnthropicProvider._apply_cache_control(
        "system", [{"role": "user", "content": "hi"}], None
    )
    assert marked[-1]["content"][-1]["cache_control"] == {"type": "ephemeral"}


def test_runtime_settings_accept_ttl_and_idle_compaction() -> None:
    config = Config()
    assert config.agents.defaults.prompt_cache_ttl == "1h"
    update_runtime_config(
        config,
        {"agents.defaults.prompt_cache_ttl": "5m", "agents.defaults.session_ttl_minutes": 55},
        local_browser=False,
    )
    assert config.agents.defaults.prompt_cache_ttl == "5m"
    assert config.agents.defaults.session_ttl_minutes == 55
    with pytest.raises(WebUISettingsError):
        update_runtime_config(config, {"agents.defaults.prompt_cache_ttl": "24h"}, local_browser=False)
