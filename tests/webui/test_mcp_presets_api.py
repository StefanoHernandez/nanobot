from __future__ import annotations

import asyncio
import json
from functools import partial
from pathlib import Path

import pytest
from mcp.shared.auth import OAuthToken

from nanobot.agent.plugins import AGENT_PLUGIN_MCP_SCHEMA, AGENT_PLUGIN_SCHEMA
from nanobot.agent.tools.mcp import record_mcp_failure
from nanobot.agent.tools.mcp_oauth import MCPOAuthStorage, mcp_oauth_has_credentials
from nanobot.config.loader import load_config, save_config
from nanobot.config.schema import Config, MCPServerConfig
from nanobot.webui.mcp_presets_api import (
    McpPresetError,
    custom_mcp_action,
    ensure_mcp_oauth_server,
    mcp_presets_action,
    mcp_presets_payload,
    mcp_presets_settings_action,
    mcp_presets_test_action,
    normalize_mcp_preset_mentions,
)


def _use_config(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    config_path = tmp_path / "config.json"
    config_path.write_text(
        json.dumps({"agents": {"defaults": {"workspace": str(tmp_path / "workspace")}}}),
        encoding="utf-8",
    )
    monkeypatch.setattr("nanobot.config.loader._current_config_path", config_path)


def _write_agent_plugin(workspace: Path) -> None:
    root = workspace / "plugins" / "desktop"
    root.mkdir(parents=True)
    for filename, payload in (
        (
            "plugin.json",
            {
                "$schema": AGENT_PLUGIN_SCHEMA,
                "name": "desktop",
                "description": "Control the local desktop.",
                "extensions": {
                    "dev.nanobot": {
                        "displayName": "Desktop Control",
                        "permissions": ["screen-recording"],
                    }
                },
            },
        ),
        (
            "mcp.json",
            {
                "$schema": AGENT_PLUGIN_MCP_SCHEMA,
                "mcpServers": {"desktop": {"type": "stdio", "command": "echo"}},
            },
        ),
    ):
        (root / filename).write_text(json.dumps(payload), encoding="utf-8")


def test_mcp_presets_payload_lists_supported_cards(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_config(tmp_path, monkeypatch)

    payload = mcp_presets_payload()
    names = {preset["name"] for preset in payload["presets"]}

    assert {
        "browserbase",
        "playwright",
        "github",
        "figma",
        "context7",
        "firecrawl",
        "parallel-search",
        "exa",
        "microsoft-learn",
        "aws-docs",
        "brave-search",
        "postman",
        "xmind",
        "notion",
        "linear",
    }.issubset(names)
    browserbase = next(preset for preset in payload["presets"] if preset["name"] == "browserbase")
    assert browserbase["installed"] is False
    assert browserbase["install_supported"] is True
    assert browserbase["required_fields"][0]["configured"] is False
    assert "browserbaseApiKey" not in browserbase["connection_summary"]
    manifest = browserbase["manifest"]
    assert manifest["schema"] == "agent-app.v1"
    assert manifest["id"] == "browserbase"
    assert manifest["source"] == "mcp-preset"
    assert manifest["capabilities"][0]["type"] == "mcp"
    assert manifest["capabilities"][0]["transport"] == "streamableHttp"
    assert manifest["install"]["strategy"] == "config"
    assert manifest["remove"]["verification"] == ["config_absent"]
    assert manifest["trust"]["review_status"] == "builtin_preset"


def test_agent_plugin_reuses_mcp_catalog_and_runtime_action(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)
    _write_agent_plugin(load_config().workspace_path)

    row = next(item for item in mcp_presets_payload()["presets"] if item["source"] == "agent-plugin")
    assert (row["name"], row["display_name"], row["requires"]) == (
        "plugin-desktop", "Desktop Control", "screen-recording"
    )
    assert row["installed"] and row["configured"] and not row["enabled"]

    async def reload() -> dict[str, object]:
        return {"ok": True, "message": "MCP reloaded.", "requires_restart": False}

    plugin_action = partial(
        mcp_presets_settings_action,
        query={"name": ["plugin-desktop"]},
    )
    enabled = asyncio.run(plugin_action("enable", reload_mcp=reload))
    enabled_row = next(item for item in enabled["presets"] if item["name"] == "plugin-desktop")
    assert (enabled_row["enabled"], enabled_row["status"], enabled["requires_restart"]) == (
        True, "enabled", False
    )

    disabled = asyncio.run(plugin_action("disable", reload_mcp=reload))
    disabled_row = next(item for item in disabled["presets"] if item["name"] == "plugin-desktop")
    assert (disabled_row["installed"], disabled_row["enabled"], disabled_row["status"]) == (
        True, False, "disabled"
    )

    with pytest.raises(McpPresetError, match="enable and disable"):
        asyncio.run(plugin_action("remove"))

    (load_config().workspace_path / "plugins" / "desktop" / "mcp.json").unlink()
    assert any(item["name"] == "plugin-desktop" for item in mcp_presets_payload()["presets"])

    config_path = tmp_path / "config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    config["tools"] = {"mcpServers": {"plugin-desktop": {"type": "stdio", "command": "echo"}}}
    config_path.write_text(json.dumps(config), encoding="utf-8")
    rows = [item for item in mcp_presets_payload()["presets"] if item["name"] == "plugin-desktop"]
    assert len(rows) == 1 and rows[0]["source"] == "custom"


@pytest.mark.asyncio
async def test_oauth_preset_is_one_click_configured_after_token_storage(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)

    payload = mcp_presets_action("enable", {"name": ["xmind"]})

    row = next(item for item in payload["presets"] if item["name"] == "xmind")
    assert row["installed"] is True
    assert row["configured"] is False
    assert row["status"] == "authorization_required"
    assert row["transport"] == "streamableHttp"
    assert row["auth"] == "oauth"
    config = load_config()
    cfg = config.tools.mcp_servers["xmind"]
    assert cfg.type == "streamableHttp"
    assert cfg.auth == "oauth"
    assert cfg.url == "https://app.xmind.com/api/mcp"

    await MCPOAuthStorage("xmind", cfg.url).set_tokens(OAuthToken(access_token="secret"))
    connected = mcp_presets_payload()
    row = next(item for item in connected["presets"] if item["name"] == "xmind")
    assert row["configured"] is True
    assert row["status"] == "configured"

    failed = mcp_presets_payload(runtime_status={"xmind": "failed"})
    row = next(item for item in failed["presets"] if item["name"] == "xmind")
    assert row["configured"] is True
    assert row["status"] == "configured"
    assert row["runtime_status"] == "failed"
    assert "secret" not in str(row)

    healthy = mcp_presets_payload(runtime_status={"xmind": "connected"})
    row = next(item for item in healthy["presets"] if item["name"] == "xmind")
    assert row["runtime_status"] == "connected"

    await MCPOAuthStorage("xmind", cfg.url).clear_tokens()
    refresh_failed = mcp_presets_payload(runtime_status={"xmind": "failed"})
    row = next(item for item in refresh_failed["presets"] if item["name"] == "xmind")
    assert row["configured"] is False
    assert row["status"] == "authorization_required"
    assert row["runtime_status"] == "failed"

    stale_connected = mcp_presets_payload(runtime_status={"xmind": "connected"})
    row = next(item for item in stale_connected["presets"] if item["name"] == "xmind")
    assert "runtime_status" not in row

    mcp_presets_action("remove", {"name": ["xmind"]})
    assert await MCPOAuthStorage("xmind", cfg.url).get_tokens() is None


@pytest.mark.asyncio
async def test_settings_list_projects_runtime_snapshot_and_reconnects_custom_server(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)
    custom_mcp_action(
        "custom",
        {
            "name": ["team-docs"],
            "transport": ["streamableHttp"],
            "url": ["https://mcp.example.com/mcp"],
        },
    )
    statuses = {"team-docs": "failed"}
    reload_calls = 0

    async def reload_mcp() -> dict[str, object]:
        nonlocal reload_calls
        reload_calls += 1
        statuses["team-docs"] = "connected"
        return {
            "ok": True,
            "connected": ["team-docs"],
            "failed": [],
            "requires_restart": False,
        }

    listed = await mcp_presets_settings_action(
        None,
        {},
        reload_mcp=reload_mcp,
        mcp_runtime_status=lambda: statuses,
    )
    row = next(item for item in listed["presets"] if item["name"] == "team-docs")
    assert row["configured"] is True
    assert row["runtime_status"] == "failed"
    assert reload_calls == 0

    reconnected = await mcp_presets_settings_action(
        "reconnect",
        {"name": ["team-docs"]},
        reload_mcp=reload_mcp,
        mcp_runtime_status=lambda: statuses,
    )
    row = next(item for item in reconnected["presets"] if item["name"] == "team-docs")
    assert row["runtime_status"] == "connected"
    assert reconnected["requires_restart"] is False
    assert reload_calls == 1


def test_enable_browserbase_writes_scrubbed_config_payload(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)

    payload = mcp_presets_action(
        "enable",
        {
            "name": ["browserbase"],
            "browserbase_api_key": ["bb_live_secret"],
        },
    )

    assert payload["requires_restart"] is True
    assert payload["last_action"]["ok"] is True
    assert payload["last_action"]["installed"] is True
    assert payload["last_action"]["verification"] == ["config_present"]
    preset = next(row for row in payload["presets"] if row["name"] == "browserbase")
    assert preset["installed"] is True
    assert preset["configured"] is True
    assert "bb_live_secret" not in str(payload)
    config = load_config()
    assert "browserbaseApiKey=bb_live_secret" in config.tools.mcp_servers["browserbase"].url


@pytest.mark.parametrize(
    ("name", "field", "header", "expected"),
    [
        ("deepnote", "deepnote_api_key", "Authorization", "Bearer preset-test-secret"),
        ("agentmail", "agentmail_api_key", "x-api-key", "preset-test-secret"),
    ],
)
def test_service_key_survives_reconnect_without_leaking_to_catalog(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
    name: str,
    field: str,
    header: str,
    expected: str,
) -> None:
    _use_config(tmp_path, monkeypatch)
    payload = mcp_presets_action("enable", {"name": [name], field: ["preset-test-secret"]})
    assert load_config().tools.mcp_servers[name].headers[header] == expected
    assert "preset-test-secret" not in json.dumps(payload)

    config = load_config()
    config.tools.mcp_servers[name].enabled_tools = ["search"]
    config.tools.mcp_servers[name].tool_timeout = 90
    save_config(config)

    payload = mcp_presets_action("enable", {"name": [name]})
    saved = load_config().tools.mcp_servers[name]
    assert saved.headers[header] == expected
    assert saved.enabled_tools == ["search"]
    assert saved.tool_timeout == 90
    assert next(row for row in payload["presets"] if row["name"] == name)["configured"]


def test_service_bearer_key_resolves_environment_reference(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from nanobot.config.loader import resolve_config_env_vars

    _use_config(tmp_path, monkeypatch)
    monkeypatch.setenv("DEEPNOTE_API_KEY", "environment-test-secret")
    payload = mcp_presets_action("enable", {"name": ["deepnote"]})

    config = load_config()
    assert config.tools.mcp_servers["deepnote"].headers == {
        "Authorization": "Bearer ${DEEPNOTE_API_KEY}"
    }
    resolved = resolve_config_env_vars(config)
    assert resolved.tools.mcp_servers["deepnote"].headers == {
        "Authorization": "Bearer environment-test-secret"
    }
    assert "environment-test-secret" not in json.dumps(payload)


def test_account_endpoint_and_token_are_saved_together(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)
    payload = mcp_presets_action(
        "enable",
        {
            "name": ["datadog"],
            "mcp_url": ["https://mcp.example.com/datadog"],
            "datadog_access_token": ["datadog-test-secret"],
        },
    )

    saved = load_config().tools.mcp_servers["datadog"]
    assert saved.url == "https://mcp.example.com/datadog"
    assert saved.headers == {"Authorization": "Bearer datadog-test-secret"}
    row = next(item for item in payload["presets"] if item["name"] == "datadog")
    assert row["configured"] is True
    assert row["connection_summary"] == saved.url
    assert "datadog-test-secret" not in json.dumps(payload)


def test_instance_oauth_setup_saves_endpoint_before_authorization(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)
    name, cfg, network = ensure_mcp_oauth_server(
        {"name": ["metabase"], "mcp_url": ["https://analytics.example.com/api/metabase-mcp"]}
    )
    assert name == "metabase"
    assert cfg.auth == "oauth"
    assert network == load_config().network
    assert cfg.url == "https://analytics.example.com/api/metabase-mcp"
    row = next(item for item in mcp_presets_payload()["presets"] if item["name"] == name)
    assert row["installed"] is True
    assert row["status"] == "authorization_required"

    config = load_config()
    config.tools.mcp_servers[name].enabled_tools = ["search"]
    save_config(config)
    _, updated, _network = ensure_mcp_oauth_server(
        {"name": [name], "mcp_url": ["https://other.example.com/api/metabase-mcp"]}
    )
    assert updated.url == "https://other.example.com/api/metabase-mcp"
    assert updated.enabled_tools == ["search"]
    assert load_config().tools.mcp_servers[name].url == updated.url


def test_instance_oauth_setup_requires_endpoint_without_saving_empty_connection(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)
    with pytest.raises(McpPresetError, match="missing MCP server URL"):
        ensure_mcp_oauth_server({"name": ["metabase"]})
    assert load_config().tools.mcp_servers == {}


def test_google_workspace_uses_managed_stdio_and_environment_credentials(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)
    payload = mcp_presets_action(
        "enable",
        {
            "name": ["google-workspace"],
            "google_client_id": ["test.apps.googleusercontent.com"],
            "google_client_secret": ["google-test-secret"],
        },
    )

    saved = load_config().tools.mcp_servers["google-workspace"]
    assert saved.command == "uvx"
    assert saved.args == ["workspace-mcp", "--transport", "stdio", "--tool-tier", "core"]
    assert saved.env == {
        "GOOGLE_OAUTH_CLIENT_ID": "test.apps.googleusercontent.com",
        "GOOGLE_OAUTH_CLIENT_SECRET": "google-test-secret",
    }
    assert Path(saved.cwd) == tmp_path / "mcp" / "google-workspace"
    assert "google-test-secret" not in json.dumps(payload)


@pytest.mark.parametrize("from_environment", [False, True])
def test_redis_url_is_passed_to_cli_and_kept_secret(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
    from_environment: bool,
) -> None:
    from nanobot.config.loader import resolve_config_env_vars

    _use_config(tmp_path, monkeypatch)
    url = "rediss://default:redis-test-secret@cache.example.com:16380/3"
    query = {"name": ["redis"]}
    if from_environment:
        monkeypatch.setenv("REDIS_URL", url)
    else:
        query["redis_url"] = [url]

    payload = mcp_presets_action("enable", query)
    config = load_config()
    saved = config.tools.mcp_servers["redis"]
    assert saved.args == [
        "--from", "redis-mcp-server@latest", "redis-mcp-server", "--url",
        "${REDIS_URL}" if from_environment else url,
    ]
    resolved = resolve_config_env_vars(config)
    assert resolved.tools.mcp_servers["redis"].args[-1] == url
    row = next(item for item in payload["presets"] if item["name"] == "redis")
    assert row["configured"] is True
    assert row["required_fields"][0]["secret"] is True
    assert "redis-test-secret" not in json.dumps(payload)


def test_enable_requires_missing_secret(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_config(tmp_path, monkeypatch)

    with pytest.raises(McpPresetError) as exc:
        mcp_presets_action("enable", {"name": ["browserbase"]})

    assert exc.value.status == 400
    assert "Browserbase API key" in exc.value.message


def test_enable_context7_optional_api_key_appends_arg(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)

    payload = mcp_presets_action(
        "enable",
        {
            "name": ["context7"],
            "context7_api_key": ["ctx7_secret"],
        },
    )

    assert "ctx7_secret" not in str(payload)
    row = next(item for item in payload["presets"] if item["name"] == "context7")
    assert row["configured"] is True
    config = load_config()
    server = config.tools.mcp_servers["context7"]
    assert server.type == "streamableHttp"
    assert server.url == "https://mcp.context7.com/mcp"
    assert server.headers.get("Authorization") == "Bearer ctx7_secret"
    assert server.args == []
    assert server.command == ""


def test_enable_stdio_preset_uses_config_scoped_cwd(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)

    mcp_presets_action("enable", {"name": ["playwright"]})

    config = load_config()
    cwd = config.tools.mcp_servers["playwright"].cwd
    assert cwd == str(tmp_path / "mcp" / "playwright")
    assert (tmp_path / "mcp" / "playwright").is_dir()


def test_enable_no_auth_remote_presets_write_url(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_config(tmp_path, monkeypatch)

    mcp_presets_action("enable", {"name": ["microsoft-learn"]})
    mcp_presets_action("enable", {"name": ["exa"]})
    mcp_presets_action("enable", {"name": ["firecrawl"]})
    mcp_presets_action("enable", {"name": ["parallel-search"]})

    config = load_config()
    assert config.tools.mcp_servers["microsoft-learn"].url == "https://learn.microsoft.com/api/mcp"
    assert config.tools.mcp_servers["exa"].url == "https://mcp.exa.ai/mcp"
    assert config.tools.mcp_servers["firecrawl"].url == "https://mcp.firecrawl.dev/v2/mcp"
    assert config.tools.mcp_servers["parallel-search"].url == "https://search.parallel.ai/mcp"


def test_firecrawl_preset_is_keyless(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_config(tmp_path, monkeypatch)

    payload = mcp_presets_action("enable", {"name": ["firecrawl"]})

    row = next(item for item in payload["presets"] if item["name"] == "firecrawl")
    assert row["transport"] == "streamableHttp"
    assert row["requires"] == "Network access"
    assert row["required_fields"] == []
    assert row["configured"] is True
    assert "Keyless" in row["note"]
    config = load_config()
    assert config.tools.mcp_servers["firecrawl"].type == "streamableHttp"
    assert config.tools.mcp_servers["firecrawl"].url == "https://mcp.firecrawl.dev/v2/mcp"
    assert config.tools.mcp_servers["firecrawl"].env == {}


def test_parallel_search_preset_is_keyless_and_tool_limited(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)

    payload = mcp_presets_action("enable", {"name": ["parallel-search"]})

    row = next(item for item in payload["presets"] if item["name"] == "parallel-search")
    assert row["transport"] == "streamableHttp"
    assert row["requires"] == "Network access"
    assert row["required_fields"] == []
    assert row["configured"] is True
    assert "no API key" in row["note"]
    config = load_config()
    server = config.tools.mcp_servers["parallel-search"]
    assert server.type == "streamableHttp"
    assert server.url == "https://search.parallel.ai/mcp"
    assert server.enabled_tools == ["web_search", "web_fetch"]
    assert server.headers == {}


def test_remove_mcp_preset_updates_config(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_config(tmp_path, monkeypatch)
    mcp_presets_action("enable", {"name": ["playwright"]})
    managed_cwd = tmp_path / "mcp" / "playwright"
    (managed_cwd / "cache.txt").write_text("managed runtime data", encoding="utf-8")

    payload = mcp_presets_action("remove", {"name": ["playwright"]})

    assert payload["requires_restart"] is True
    assert payload["last_action"]["ok"] is True
    assert payload["last_action"]["removed"] is True
    assert payload["last_action"]["managed_paths_removed"] == ["runtime:mcp/playwright"]
    assert not managed_cwd.exists()
    config = load_config()
    assert "playwright" not in config.tools.mcp_servers


def test_remove_custom_mcp_server_preserves_user_cwd(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_config(tmp_path, monkeypatch)
    user_cwd = tmp_path / "user-cwd"
    user_cwd.mkdir()
    custom_mcp_action(
        "custom",
        {
            "name": ["internal-docs"],
            "transport": ["stdio"],
            "command": ["node"],
            "args": ['["server.js"]'],
            "cwd": [str(user_cwd)],
        },
    )

    payload = mcp_presets_action("remove", {"name": ["internal-docs"]})

    assert payload["last_action"]["ok"] is True
    assert user_cwd.exists()
    config = load_config()
    assert "internal-docs" not in config.tools.mcp_servers


def test_test_mcp_preset_reports_missing_dependency(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)
    mcp_presets_action("enable", {"name": ["playwright"]})
    monkeypatch.setattr("nanobot.webui.mcp_presets_api.shutil.which", lambda _command: None)

    payload = asyncio.run(mcp_presets_test_action({"name": ["playwright"]}))

    assert payload["last_action"]["ok"] is False
    assert "npx" in payload["last_action"]["message"]


def test_test_mcp_preset_connects_and_reports_tools(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)
    mcp_presets_action("enable", {"name": ["playwright"]})

    class FakeStack:
        async def aclose(self) -> None:
            return None

    async def fake_connect(servers, registry, *, network):
        assert list(servers) == ["playwright"]

        class FakeTool:
            name = "mcp_playwright_browser_navigate"

            def to_schema(self):
                return {"name": self.name, "description": "", "parameters": {}}

        registry.register(FakeTool())
        return {"playwright": FakeStack()}

    monkeypatch.setattr("nanobot.agent.tools.mcp.connect_mcp_servers", fake_connect)

    payload = asyncio.run(mcp_presets_test_action({"name": ["playwright"]}))

    assert payload["last_action"]["ok"] is True
    assert payload["last_action"]["tool_count"] == 1
    assert payload["last_action"]["tool_names"] == ["mcp_playwright_browser_navigate"]


def test_test_mcp_preset_inspects_tools_outside_the_enabled_allowlist(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)
    mcp_presets_action("enable", {"name": ["playwright"]})
    config = load_config()
    config.tools.mcp_servers["playwright"].enabled_tools = [
        "mcp_playwright_browser_navigate",
    ]
    save_config(config)

    class FakeStack:
        async def aclose(self) -> None:
            return None

    async def fake_connect(servers, registry, *, network):
        assert servers["playwright"].enabled_tools == ["*"]

        class FakeTool:
            def __init__(self, name: str) -> None:
                self.name = name

            def to_schema(self):
                return {"name": self.name, "description": "", "parameters": {}}

        for index in range(20):
            registry.register(FakeTool(f"mcp_playwright_tool_{index:02d}"))
        return {"playwright": FakeStack()}

    monkeypatch.setattr("nanobot.agent.tools.mcp.connect_mcp_servers", fake_connect)

    payload = asyncio.run(mcp_presets_test_action({"name": ["playwright"]}))

    assert payload["last_action"]["tool_count"] == 20
    assert len(payload["last_action"]["tool_names"]) == 20
    row = next(item for item in payload["presets"] if item["name"] == "playwright")
    assert row["enabled_tools"] == ["mcp_playwright_browser_navigate"]


def test_test_mcp_preset_scrubs_connection_errors(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)
    mcp_presets_action(
        "enable",
        {
            "name": ["browserbase"],
            "browserbase_api_key": ["bb_live_secret"],
        },
    )

    async def fake_connect(_servers, _registry, *, network):
        raise RuntimeError("failed https://mcp.browserbase.com/mcp?browserbaseApiKey=bb_live_secret")

    monkeypatch.setattr("nanobot.agent.tools.mcp.connect_mcp_servers", fake_connect)

    payload = asyncio.run(mcp_presets_test_action({"name": ["browserbase"]}))

    assert payload["last_action"]["ok"] is False
    assert "bb_live_secret" not in str(payload)
    assert "<redacted>" in payload["last_action"]["error"]


def test_unknown_oauth_placeholder_is_not_enabled(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_config(tmp_path, monkeypatch)

    with pytest.raises(McpPresetError) as exc:
        mcp_presets_action("enable", {"name": ["asana"]})

    assert exc.value.status == 404


def test_normalize_mcp_preset_mentions_keeps_known_presets_only() -> None:
    payload = normalize_mcp_preset_mentions([
        {
            "name": "browserbase",
            "display_name": "Browserbase",
            "transport": "streamableHttp",
            "configured": True,
            "logo_url": "https://example.invalid/logo.svg",
        },
        {"name": "totally-unknown"},
        "bad",
    ])

    assert payload == [{
        "name": "browserbase",
        "display_name": "Browserbase",
        "transport": "streamableHttp",
        "configured": True,
        "logo_url": "https://example.invalid/logo.svg",
    }]


def test_custom_mcp_server_writes_config_and_catalog_row(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)

    payload = custom_mcp_action(
        "custom",
        {
            "name": ["internal-docs"],
            "transport": ["stdio"],
            "command": ["node"],
            "args": ['["server.js"]'],
            "env": ['{"DOCS_TOKEN":"docs-secret-value"}'],
            "tool_timeout": ["45"],
        },
    )

    assert payload["requires_restart"] is True
    row = next(item for item in payload["presets"] if item["name"] == "internal-docs")
    assert row["source"] == "custom"
    assert row["transport"] == "stdio"
    assert row["connection_summary"] == "node server.js"
    assert row["manifest"]["schema"] == "agent-app.v1"
    assert row["manifest"]["source"] == "mcp-custom"
    assert row["manifest"]["capabilities"][0]["command"] == "node"
    assert "server.js" not in str(row["manifest"])
    assert "docs-secret-value" not in str(payload)
    config = load_config()
    assert config.tools.mcp_servers["internal-docs"].args == ["server.js"]
    assert config.tools.mcp_servers["internal-docs"].env["DOCS_TOKEN"] == "docs-secret-value"


def test_import_mcp_config_and_tool_allowlist(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)

    payload = custom_mcp_action(
        "import",
        {
            "config": [
                (
                    '{"mcpServers":{'
                    '"docs":{"command":"npx","args":["-y","docs-mcp"],"env":{"API_KEY":"config-secret-value"}},'
                    '"remote-docs":{"transport":"sse","url":"https://example.com/sse"}'
                    '}}'
                )
            ],
        },
    )

    assert payload["last_action"]["message"] == "Imported 2 MCP server(s)."
    config = load_config()
    assert config.tools.mcp_servers["docs"].command == "npx"
    assert config.tools.mcp_servers["docs"].args == ["-y", "docs-mcp"]
    assert config.tools.mcp_servers["remote-docs"].type == "sse"
    assert config.tools.mcp_servers["remote-docs"].url == "https://example.com/sse"
    assert config.tools.mcp_servers["docs"].env["API_KEY"] == "config-secret-value"
    assert "config-secret-value" not in str(payload)

    payload = custom_mcp_action(
        "tools",
        {
            "name": ["docs"],
            "enabled_tools": ['["mcp_docs_search"]'],
        },
    )

    row = next(item for item in payload["presets"] if item["name"] == "docs")
    assert row["enabled_tools"] == ["mcp_docs_search"]
    assert load_config().tools.mcp_servers["docs"].enabled_tools == ["mcp_docs_search"]

    payload = custom_mcp_action(
        "tools",
        {
            "name": ["docs"],
            "enabled_tools": ["[]"],
        },
    )

    row = next(item for item in payload["presets"] if item["name"] == "docs")
    assert row["enabled_tools"] == []
    assert load_config().tools.mcp_servers["docs"].enabled_tools == []


def test_import_recognizes_known_and_explicit_oauth_servers(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)

    payload = custom_mcp_action(
        "import",
        {
            "config": [
                (
                    '{"mcpServers":{'
                    '"notion-work":{"url":"https://mcp.notion.com/mcp"},'
                    '"company-mcp":{"url":"https://mcp.example.com/mcp","auth":"oauth"},'
                    '"notion-pat":{"url":"https://mcp.notion.com/mcp",'
                    '"headers":{"Authorization":"Bearer secret"}}'
                    '}}'
                )
            ],
        },
    )

    config = load_config()
    assert config.tools.mcp_servers["notion-work"].auth == "oauth"
    assert config.tools.mcp_servers["company-mcp"].auth == "oauth"
    assert config.tools.mcp_servers["notion-pat"].auth is None
    rows = {row["name"]: row for row in payload["presets"]}
    assert rows["notion-work"]["status"] == "authorization_required"
    assert rows["company-mcp"]["status"] == "authorization_required"
    assert rows["notion-pat"]["status"] == "configured"
    assert "Bearer secret" not in str(payload)


@pytest.mark.asyncio
async def test_replacing_oauth_config_removes_its_stored_credentials(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)
    server_url = "https://mcp.example.com/mcp"
    custom_mcp_action(
        "custom",
        {
            "name": ["company-mcp"],
            "transport": ["streamableHttp"],
            "url": [server_url],
            "auth": ["oauth"],
        },
    )
    await MCPOAuthStorage("company-mcp", server_url).set_tokens(
        OAuthToken(access_token="secret")
    )
    assert mcp_oauth_has_credentials("company-mcp", server_url)

    custom_mcp_action(
        "custom",
        {
            "name": ["company-mcp"],
            "transport": ["streamableHttp"],
            "url": [server_url],
        },
    )

    assert not mcp_oauth_has_credentials("company-mcp", server_url)


def test_normalize_mcp_preset_mentions_accepts_configured_custom_server(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)
    custom_mcp_action(
        "custom",
        {
            "name": ["docs"],
            "transport": ["streamableHttp"],
            "url": ["https://example.com/mcp"],
        },
    )

    payload = normalize_mcp_preset_mentions([
        {"name": "docs", "display_name": "Docs", "transport": "streamableHttp"},
    ])

    assert payload == [{"name": "docs", "display_name": "Docs", "transport": "streamableHttp"}]


def test_normalize_mcp_mentions_uses_explicit_gateway_config(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    default_path = tmp_path / "default.json"
    config_path = tmp_path / "gateway.json"
    save_config(Config(), default_path)
    monkeypatch.setattr("nanobot.config.loader._current_config_path", default_path)
    custom_mcp_action(
        "custom",
        {
            "name": ["gateway-docs"],
            "transport": ["streamableHttp"],
            "url": ["https://example.com/mcp"],
        },
        config_path=config_path,
    )

    payload = normalize_mcp_preset_mentions(
        [{"name": "gateway-docs", "display_name": "Gateway docs"}],
        config_path=config_path,
    )

    assert payload == [{"name": "gateway-docs", "display_name": "Gateway docs"}]


# Fork: test switching transports cleans up incompatible fields
def test_materialize_server_cleans_incompatible_transport_fields(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)

    # 1. Start with a stdio server configuration for context7
    cfg = load_config()
    cfg.tools.mcp_servers["context7"] = MCPServerConfig(
        type="stdio",
        command="npx",
        args=["-y", "@upstash/context7-mcp@latest"],
        cwd="/tmp/context7",
        tool_timeout=45,
    )
    save_config(cfg)

    # Enable context7 preset (which is now streamableHttp)
    mcp_presets_action(
        "enable",
        {
            "name": ["context7"],
            "context7_api_key": ["ctx7_secret"],
        },
    )

    updated = load_config()
    server = updated.tools.mcp_servers["context7"]
    assert server.type == "streamableHttp"
    assert server.url == "https://mcp.context7.com/mcp"
    assert server.headers.get("Authorization") == "Bearer ctx7_secret"
    assert server.command == ""
    assert server.args == []
    assert server.cwd == ""


# Fork: test failure_reason in test action scrubs secrets
@pytest.mark.asyncio
async def test_mcp_test_action_failure_reason_scrubs_secrets(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)

    # Enable context7
    mcp_presets_action(
        "enable",
        {
            "name": ["context7"],
            "context7_api_key": ["ctx7_secret"],
        },
    )

    async def fake_connect(servers, registry, **_kwargs):
        raise RuntimeError(
            "Failed to connect https://user:supersecretpass@api.test.com/mcp?token=secret123 with Bearer mysecrettoken"
        )

    monkeypatch.setattr("nanobot.agent.tools.mcp.connect_mcp_servers", fake_connect)

    payload = await mcp_presets_test_action({"name": ["context7"]})
    last_action = payload["last_action"]
    assert last_action["ok"] is False
    reason = last_action["failure_reason"]
    assert "supersecretpass" not in reason
    assert "secret123" not in reason
    assert "mysecrettoken" not in reason
    assert "<redacted>" in reason
    assert len(reason) <= 300

    row = next(item for item in payload["presets"] if item["name"] == "context7")
    assert row.get("failure_reason") == reason


# Fork: test npx_cache_broken error hint code
@pytest.mark.asyncio
async def test_mcp_test_action_npx_cache_broken_hint(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_config(tmp_path, monkeypatch)

    # Enable playwright (stdio)
    mcp_presets_action("enable", {"name": ["playwright"]})

    # Simulate stdio process failure with ERR_MODULE_NOT_FOUND
    async def fake_connect(servers, registry, **_kwargs):
        record_mcp_failure(
            "playwright",
            "Error: Cannot find module '@playwright/mcp'",
            error_hint="npx_cache_broken",
            hint_message="Cache npx corrotta o modulo mancante. Prova a svuotare ~/.npm o reinstallare il pacchetto.",
        )
        return {}

    monkeypatch.setattr("nanobot.agent.tools.mcp.connect_mcp_servers", fake_connect)

    payload = await mcp_presets_test_action({"name": ["playwright"]})
    last_action = payload["last_action"]
    assert last_action["ok"] is False
    assert last_action["error_hint"] == "npx_cache_broken"
    assert "Cache npx corrotta" in (last_action.get("hint_message") or "")

    row = next(item for item in payload["presets"] if item["name"] == "playwright")
    assert row.get("error_hint") == "npx_cache_broken"



# Fork: the arduino case: an HTTP entry with leftover stdio args, re-enabled from the preset
def test_preset_over_http_entry_drops_stray_args_and_keeps_the_key(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_config(tmp_path, monkeypatch)
    cfg = load_config()
    cfg.tools.mcp_servers["context7"] = MCPServerConfig(
        type="streamableHttp",
        url="https://mcp.context7.com/mcp",
        headers={"Authorization": "Bearer ctx7_saved"},
        args=["--api-key", "ctx7_saved"],
    )
    save_config(cfg)
    mcp_presets_action("enable", {"name": ["context7"]})
    server = load_config().tools.mcp_servers["context7"]
    assert server.args == [] and server.command == ""
    assert server.headers.get("Authorization") == "Bearer ctx7_saved"


def test_scrub_covers_spaced_json_basic_and_known_values() -> None:
    from nanobot.agent.tools.mcp import mcp_secret_values, scrub_mcp_error

    cfg = MCPServerConfig(headers={"X-Key": "hdr-secret"}, env={"T": "env-secret"}, args=["--token=arg-secret"])
    text = 'X-API-Key: abc123 "api_key": "q1w2" Authorization: Basic Zm9v hdr-secret env-secret arg-secret'
    out = scrub_mcp_error(text, None, mcp_secret_values(cfg))
    for leaked in ("abc123", "q1w2", "Zm9v", "hdr-secret", "env-secret", "arg-secret"):
        assert leaked not in out


@pytest.mark.parametrize("installed", [False, True], ids=["first-authorization", "existing-preset"])
def test_oauth_setup_persists_proxy_choice_without_credential_fields(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
    installed: bool,
) -> None:
    _use_config(tmp_path, monkeypatch)
    config = load_config()
    config.network.proxy = "http://shared.example:8080"
    save_config(config)
    if installed:
        mcp_presets_action("enable", {"name": ["xmind"]})

    name, cfg, network = ensure_mcp_oauth_server({
        "name": ["xmind"], "use_proxy": ["true"],
    })

    assert name == "xmind"
    assert cfg.use_proxy is True
    assert cfg.auth == "oauth"
    assert network.proxy == "http://shared.example:8080"
    assert load_config().tools.mcp_servers[name].use_proxy is True
    payload = mcp_presets_payload()
    row = next(item for item in payload["presets"] if item["name"] == name)
    assert row["use_proxy"] is True
    assert row["status"] == "authorization_required"
    assert payload["proxy_configured"] is True
    assert "shared.example" not in json.dumps(payload)

    _, updated, _ = ensure_mcp_oauth_server({"name": [name], "use_proxy": ["false"]})
    assert updated.use_proxy is False
    assert load_config().tools.mcp_servers[name].use_proxy is False


@pytest.mark.parametrize("name", ["xmind", "custom-docs"])
def test_proxy_action_preserves_existing_server_and_materializes_presets(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
    name: str,
) -> None:
    _use_config(tmp_path, monkeypatch)
    config = load_config()
    config.network.proxy = "http://shared.example:8080"
    save_config(config)
    if name == "custom-docs":
        custom_mcp_action("custom", {
            "name": [name], "url": ["https://docs.example.com/mcp"],
            "headers": ['{"Authorization": "Bearer preserved-secret"}'],
            "enabled_tools": ['["search"]'], "tool_timeout": ["90"],
        })

    payload = mcp_presets_action("proxy", {"name": [name], "use_proxy": ["true"]})
    before = load_config().tools.mcp_servers[name]
    assert before.use_proxy is True
    assert payload["requires_restart"] is True
    assert next(row for row in payload["presets"] if row["name"] == name)["use_proxy"] is True

    mcp_presets_action("proxy", {"name": [name], "use_proxy": ["false"]})
    after = load_config().tools.mcp_servers[name]
    assert after.use_proxy is False
    assert after.model_dump(exclude={"use_proxy"}) == before.model_dump(exclude={"use_proxy"})
    if name == "custom-docs":
        assert after.headers == {"Authorization": "Bearer preserved-secret"}
        assert after.enabled_tools == ["search"]
        assert after.tool_timeout == 90


@pytest.mark.parametrize("transport", ["sse", "streamableHttp"])
def test_custom_server_saves_explicit_proxy_flag(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
    transport: str,
) -> None:
    _use_config(tmp_path, monkeypatch)
    config = load_config()
    config.network.proxy = "http://shared.example:8080"
    save_config(config)
    payload = custom_mcp_action("custom", {
        "name": ["company-docs"], "transport": [transport],
        "url": ["https://docs.example.com/mcp"], "use_proxy": ["true"],
    })
    assert load_config().tools.mcp_servers["company-docs"].use_proxy is True
    assert next(row for row in payload["presets"] if row["name"] == "company-docs")["use_proxy"] is True


@pytest.mark.parametrize("use_proxy", [False, True])
def test_import_preserves_boolean_proxy_flag(tmp_path, monkeypatch, use_proxy: bool) -> None:
    _use_config(tmp_path, monkeypatch)
    config = load_config()
    config.network.proxy = "http://shared.example:8080"
    save_config(config)
    custom_mcp_action("import", {"config": [json.dumps({"mcpServers": {
        "company-docs": {"url": "https://docs.example.com/mcp", "useProxy": use_proxy},
    }})]})
    assert load_config().tools.mcp_servers["company-docs"].use_proxy is use_proxy


@pytest.mark.parametrize("invalid", ["true", "false", 1, None])
def test_import_rejects_nonboolean_proxy_flag_without_saving(tmp_path, monkeypatch, invalid) -> None:
    _use_config(tmp_path, monkeypatch)
    with pytest.raises(McpPresetError, match="useProxy must be a boolean"):
        custom_mcp_action("import", {"config": [json.dumps({"mcpServers": {
            "valid-first": {"url": "https://docs.example.com/mcp"},
            "bad-flag": {"url": "https://docs.example.com/mcp", "useProxy": invalid},
        }})]})
    assert load_config().tools.mcp_servers == {}


@pytest.mark.parametrize("action", ["enable", "proxy", "oauth", "custom", "import"])
def test_explicit_proxy_requires_shared_address_before_saving(tmp_path, monkeypatch, action) -> None:
    _use_config(tmp_path, monkeypatch)
    with pytest.raises(McpPresetError, match="Configure the shared proxy"):
        if action == "oauth":
            ensure_mcp_oauth_server({"name": ["xmind"], "use_proxy": ["true"]})
        elif action == "custom":
            custom_mcp_action("custom", {
                "name": ["company-docs"], "url": ["https://docs.example.com/mcp"],
                "use_proxy": ["true"],
            })
        elif action == "import":
            custom_mcp_action("import", {"config": [json.dumps({
                "company-docs": {"url": "https://docs.example.com/mcp", "useProxy": True},
            })]})
        else:
            mcp_presets_action(action, {"name": ["xmind"], "use_proxy": ["true"]})
    assert load_config().tools.mcp_servers == {}
    assert mcp_presets_payload()["proxy_configured"] is False


def test_enable_preset_preserves_proxy_choice_on_later_enable(tmp_path, monkeypatch) -> None:
    _use_config(tmp_path, monkeypatch)
    config = load_config()
    config.network.proxy = "http://shared.example:8080"
    save_config(config)

    mcp_presets_action("enable", {"name": ["xmind"], "use_proxy": ["true"]})
    assert load_config().tools.mcp_servers["xmind"].use_proxy is True
    mcp_presets_action("enable", {"name": ["xmind"]})
    assert load_config().tools.mcp_servers["xmind"].use_proxy is True
    mcp_presets_action("enable", {"name": ["xmind"], "use_proxy": ["false"]})
    assert load_config().tools.mcp_servers["xmind"].use_proxy is False
