"""Subagent model preset (fork): config field, settings surface, preset rename/delete, runtime pick."""

from types import SimpleNamespace

import pytest

from nanobot.config.schema import Config
from nanobot.ext import subagent_model
from nanobot.webui.settings_contracts import WebUISettingsError
from nanobot.webui.settings_runtime import (
    RUNTIME_CONFIG_PATHS,
    runtime_config_payload,
    update_runtime_config,
)


def _validate(data: dict) -> Config:
    # Config() resolves the lazy tool-config refs first; bare model_validate depends on import order.
    Config()
    return Config.model_validate(data)


def _config(**presets: str) -> Config:
    return _validate(
        {
            "model_presets": {
                name: {"model": model, "provider": "openai"} for name, model in presets.items()
            }
        }
    )


def test_fields_are_exposed_to_settings():
    assert "agents.defaults.subagent_model_preset" in RUNTIME_CONFIG_PATHS
    assert "agents.defaults.dream.model_override" in RUNTIME_CONFIG_PATHS
    payload = runtime_config_payload(_config(fast="gpt-x"))
    assert payload["agents.defaults.subagent_model_preset"] is None
    assert payload["agents.defaults.dream.model_override"] is None


def test_update_accepts_known_preset_and_reset():
    config = _config(fast="gpt-x")
    update_runtime_config(config, {"agents.defaults.subagent_model_preset": "fast"}, local_browser=False)
    update_runtime_config(config, {"agents.defaults.dream.model_override": "fast"}, local_browser=False)
    assert config.agents.defaults.subagent_model_preset == "fast"
    assert config.agents.defaults.dream.model_override == "fast"
    update_runtime_config(config, {"agents.defaults.subagent_model_preset": None}, local_browser=False)
    assert config.agents.defaults.subagent_model_preset is None


def test_update_rejects_unknown_preset():
    config = _config(fast="gpt-x")
    with pytest.raises(WebUISettingsError):
        update_runtime_config(config, {"agents.defaults.subagent_model_preset": "nope"}, local_browser=False)
    assert config.agents.defaults.subagent_model_preset is None


def test_unknown_preset_in_config_file_is_rejected():
    with pytest.raises(ValueError):
        _validate({"agents": {"defaults": {"subagent_model_preset": "ghost"}}})


def test_preset_rename_and_delete_follow_the_choice():
    from nanobot.webui import settings_models

    config = _config(fast="gpt-x", deep="gpt-y")
    config.agents.defaults.subagent_model_preset = "fast"
    config.agents.defaults.dream.model_override = "fast"
    assert settings_models._rename_model_configuration(config, "fast", "quick")  # pyright: ignore[reportPrivateUsage]
    assert config.agents.defaults.subagent_model_preset == "quick"
    assert config.agents.defaults.dream.model_override == "quick"

    config = _config(fast="gpt-x", deep="gpt-y")
    config.agents.defaults.subagent_model_preset = "fast"
    config.agents.defaults.dream.model_override = "fast"
    settings_models.delete_model_configuration(config, {"name": ["fast"]})
    assert config.agents.defaults.subagent_model_preset is None
    assert config.agents.defaults.dream.model_override is None
    _validate(config.model_dump(by_alias=True))  # still a valid config after delete


def test_runtime_pick():
    default = object()
    manager = SimpleNamespace()
    assert subagent_model.runtime_for(manager, default) is default

    chosen = object()
    loop = SimpleNamespace(
        subagents=manager,
        runtime_resolver=SimpleNamespace(resolve_preset=lambda name: chosen if name == "fast" else None),
    )
    subagent_model.attach(loop, "fast")
    assert subagent_model.runtime_for(manager, default) is chosen

    subagent_model.attach(loop, None)
    assert subagent_model.runtime_for(manager, default) is default


def test_runtime_pick_falls_back_when_preset_breaks():
    default = object()

    def broken(_name):
        raise KeyError("preset removed")

    loop = SimpleNamespace(subagents=SimpleNamespace(), runtime_resolver=SimpleNamespace(resolve_preset=broken))
    subagent_model.attach(loop, "gone")
    assert subagent_model.runtime_for(loop.subagents, default) is default
