"""Which web client the gateway serves."""

from __future__ import annotations

import pytest
from typer.testing import CliRunner

from nanobot.channels import manager
from nanobot.cli.commands import app
from nanobot.ext import webui_mode as wm


@pytest.fixture(autouse=True)
def mode_file(tmp_path, monkeypatch):
    monkeypatch.setenv("NANOBOT_WEBUI_MODE_FILE", str(tmp_path / "ext_webui.json"))
    monkeypatch.delenv("NANOBOT_APP_DIST", raising=False)


@pytest.fixture
def bundled(tmp_path, monkeypatch):
    dist = tmp_path / "app"
    (dist / "_expo").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html>")
    monkeypatch.setattr(wm, "bundled_app_dist", lambda: dist)
    return dist


def test_app_is_the_default_and_legacy_is_one_command_away(bundled):
    assert manager._default_webui_dist() == bundled
    result = CliRunner().invoke(app, ["ui", "legacy"])
    assert result.exit_code == 0 and "Restart the gateway" in result.output
    assert manager._default_webui_dist() != bundled
    assert CliRunner().invoke(app, ["ui"]).output.strip() == "web client: legacy"
    CliRunner().invoke(app, ["ui", "app"])
    assert manager._default_webui_dist() == bundled


def test_unknown_mode_is_refused_and_missing_bundle_falls_back(monkeypatch):
    assert CliRunner().invoke(app, ["ui", "react"]).exit_code != 0
    monkeypatch.setattr(wm, "bundled_app_dist", lambda: None)
    served = manager._default_webui_dist()
    assert served is None or not wm.is_app_dist(served)  # legacy (or nothing in a bare checkout)


def test_env_override_wins(tmp_path, monkeypatch, bundled):
    other = tmp_path / "custom"
    other.mkdir()
    (other / "index.html").write_text("x")
    monkeypatch.setenv("NANOBOT_APP_DIST", str(other))
    assert manager._default_webui_dist() == other.resolve()
