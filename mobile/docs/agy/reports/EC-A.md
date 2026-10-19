# EC-A report — Ecosystem enhancements (CLI Apps, MCP presets error surface, plugins refusal codes, client-side search)

## Files touched & created

### Backend (Python)
- `nanobot/apps/cli/service.py`: Added cached global lookup helper `_resolved_cli_search_path()` querying `npm prefix -g` (appending `/bin` on Unix) and `uv tool dir --bin` once via `@functools.lru_cache(maxsize=1)`; replaced all `shutil.which` calls and subprocess environment lookups to find and execute CLI tools installed globally via npm or uv.
- `nanobot/agent/tools/mcp.py`: Scrubbing helper `scrub_mcp_error` (<300 chars, redacting tokens, keys, passwords, bearer headers, query params); stores stdio child stderr in tempfile; fallback for stdio_client test mocks without `errlog`; detects `ERR_MODULE_NOT_FOUND` and `npm ERR` to set structured `error_hint="npx_cache_broken"` and helpful message; records failure details in `_LAST_MCP_FAILURES`.
- `nanobot/webui/mcp_presets.json`: Updated `context7` preset to `streamableHttp` pointing to `https://mcp.context7.com/mcp` with optional Bearer key header.
- `nanobot/webui/mcp_presets_api.py`: Cleaned up obsolete transport fields in `_materialize_server` when transport changes (e.g. dropping command/args when switching to HTTP/SSE, or url/headers when switching to stdio); added `failure_reason`, `error_hint`, `hint_message` to preset status and test action payload; updated `_scrub_test_error` to use `scrub_mcp_error`.
- `nanobot/optional_features.py`: Added `code` attribute to `OptionalFeatureError`; sets `code="remote_install_disabled"` when `allow_install` is disabled; sets `code="unsupported_install_env"` with manual pip/uv install command when pip cannot be run and environment is managed or uv is missing.
- `nanobot/webui/settings_contracts.py`: Added `code: str | None = None` to `SettingsRouteResult` dataclass and `SettingsRouteResult.failure()`.
- `nanobot/webui/settings_routes.py`: Serializes `{"error": result.error, "code": result.code}` as JSON response when `result.code` is set.
- `nanobot/webui/settings_system.py`: Enforces full power check on feature enabling, returning 403 with `code="full_power_required"`; propagates `exc.code` in feature, channel, and app actions.
- `tests/cli_apps/test_service.py`: Added unit tests verifying `npm prefix -g` and `uv tool dir --bin` path resolution, caching, and CLI binary discovery.
- `tests/webui/test_mcp_presets_api.py`: Added tests verifying transport field wipe on switch, stdio child error scrubbing and npx cache hint.
- `tests/webui/test_settings_routes.py`: Added tests for `full_power_required`, `remote_install_disabled`, and `unsupported_install_env` refusal codes.

### Frontend (Mobile React Native)
- `mobile/src/core/session.ts`: Updated `request` and `mutate` HTTP methods to parse JSON response bodies on errors and attach `code` to the thrown `Error` object.
- `mobile/src/ecosystem/common.ts`: Extended `toastEcosystemError` to handle refusal codes `full_power_required`, `remote_install_disabled`, and `unsupported_install_env`.
- `mobile/src/ecosystem/apps.ts`: Updated `policyError` to attach `code: "remote_install_disabled"`.
- `mobile/src/screens/ecosystem/apps/search.ts` (created): Implemented `filterEcosystemItems` performing case- and accent-insensitive matching across `name`, `display_name`, `description`, and `category`, placing installed items first.
- `mobile/src/screens/ecosystem/apps/CliAppsTab.tsx`: Added search input, empty state for zero search results (`Nessun risultato per «{q}»`), and refusal lock indicators with explanatory captions.
- `mobile/src/screens/ecosystem/apps/PluginsTab.tsx`: Added search input, empty search results state, and refusal lock indicators explaining full power, remote disabled, and manual install requirements.
- `mobile/src/screens/ecosystem/apps/McpTab.tsx`: Added search input, empty search results state, lock indicators, failure reason banner, and npx cache broken guidance under failed servers.
- `mobile/src/screens/ecosystem/apps/McpSheet.tsx`: Added `test` prop, `Test` action button, failure reason display, and npx cache broken recovery hint in the sheet.
- `mobile/src/i18n/it.json`: Added localization keys for search placeholder, search empty state with guillemets, refusal locks, failure reason, and npx cache hint.
- `mobile/src/i18n/en.json`: Added corresponding English localization keys.
- `mobile/test/screens/ec-a-ecosystem.test.tsx` (created): Added comprehensive Jest test suite verifying search filtering, accent-insensitivity, installed-first sorting, empty states, refusal codes, and MCP error surface / npx hint.

## Test results

### 1. Pytest suite
Command: `PYTHONPATH=. ../nanobot/.venv/bin/python -m pytest -p no:cacheprovider tests`
Result: 8139 passed, exactly the 7 baseline known failures (in `test_every_runtime_channel_field_has_a_webui_contract`, `test_unavailable_adapter_does_not_report_success` [telegram, slack, matrix], `test_session_storage_benchmark_emits_auditable_windows_safe_result`, `test_exec_rejects_home_path_without_home_directory`, `test_server_appends_restricted_key_and_revoke_preserves_existing`).
Focused test runs:
- `tests/cli_apps/test_service.py`: 37 passed in 0.40s
- `tests/webui/test_settings_routes.py`: 35 passed in 1.91s
- `tests/webui/test_mcp_presets_api.py`: 37 passed in 0.82s
- `tests/tools/test_mcp_tool.py`: 115 passed in 0.45s

### 2. Ruff check
Command: `../nanobot/.venv/bin/ruff check nanobot/apps/cli/service.py nanobot/agent/tools/mcp.py nanobot/webui/mcp_presets_api.py nanobot/optional_features.py nanobot/webui/settings_contracts.py nanobot/webui/settings_routes.py nanobot/webui/settings_system.py tests/cli_apps/test_service.py tests/webui/test_mcp_presets_api.py tests/webui/test_settings_routes.py`
Output: `All checks passed!`

### 3. Basedpyright type check
Command: `../nanobot/.venv/bin/basedpyright --pythonpath ../nanobot/.venv/bin/python nanobot/apps/cli/service.py nanobot/agent/tools/mcp.py nanobot/webui/mcp_presets_api.py nanobot/optional_features.py nanobot/webui/settings_contracts.py nanobot/webui/settings_routes.py nanobot/webui/settings_system.py tests/cli_apps/test_service.py tests/webui/test_mcp_presets_api.py tests/webui/test_settings_routes.py`
Output: `0 errors, 0 warnings, 0 notes`

### 4. Mobile Jest suite
Command: `cd mobile && npx jest`
Output:
```
Test Suites: 135 passed, 135 total
Tests:       1091 passed, 1091 total
Snapshots:   0 total
Time:        10.486 s
Ran all test suites.
```

### 5. TypeScript compiler check
Command: `cd mobile && npx tsc --noEmit`
Output: Exited with code 0 (zero errors).

### 6. Expo Android export
Command: `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export-ec`
Output:
```
Android Bundled 12800ms index.js (2569 modules)
Exported: /tmp/nb-export-ec
```

## Package installation behavior with `uv tool`

When `nanobot` is installed via `uv tool install nanobot` (as on single-board computers like Arduino or Raspberry Pi), `nanobot` executes from an isolated virtual environment (typically `~/.local/share/uv/tools/nanobot/bin/python`).
Standard virtual environments provisioned by `uv tool` intentionally do not bundle `pip` inside the virtualenv to minimize size and overhead.

In `nanobot/optional_features.py`:
1. When a user requests enabling an optional feature (e.g. `feishu`), `install_extra()` first checks if `pip` is importable in the current Python runtime.
2. If `pip` is absent, `install_extra()` checks for the presence of `uv` on PATH via `shutil.which("uv")`.
3. If `uv` is found, it invokes `uv pip install --python <sys.executable> *install_args`. By passing `--python sys.executable`, `uv` targets the specific isolated Python virtualenv of `nanobot` rather than the system Python or a global environment, safely installing the required packages without breaking PEP 668 restrictions.
4. If neither `pip` nor `uv` can be used to install dependencies in place, `install_extra()` raises `OptionalFeatureError` with `code="unsupported_install_env"` and generates the manual installation command `uv tool install --upgrade --with 'nanobot-ai[<feature>]' nanobot-ai` or `pip install 'nanobot-ai[<feature>]'`. This structured refusal code is delivered to the WebUI and mobile app, displaying an explicit lock indicator and copyable terminal command.

## Review of the other 22 stdio MCP presets

A survey of the remaining 22 default presets defined in `nanobot/webui/mcp_presets.json` was conducted to determine whether official vendor remote endpoints (Streamable HTTP / SSE) exist:

1. **Local System Tools (strictly stdio):**
   - `filesystem`, `desktop-commander`, `fetch`, `puppeteer`, `playwright`, `sqlite`, `postgres`, `git`, `docker`, `kubernetes`: These servers interact directly with local processes, files, or local sockets via `npx` or `uvx` and have no hosted vendor HTTP endpoints by nature.
2. **Context7:**
   - Official remote Streamable HTTP endpoint: `https://mcp.context7.com/mcp` (Bearer token optional for public queries, required for private libraries). Successfully migrated to `streamableHttp` in `nanobot/webui/mcp_presets.json`.
3. **Cloud & SaaS Integrations:**
   - `sentry`: Sentry operates an official MCP server at `https://mcp.sentry.io/` via Streamable HTTP (requires organization token). Future preset enhancement can support direct HTTP transport.
   - `github`: Currently distributed as stdio `npx -y @modelcontextprotocol/server-github` requiring a Personal Access Token. GitHub has demonstrated hosted integrations in technical preview, but official general availability remains stdio.
   - `gitlab`: Stdio `npx -y @modelcontextprotocol/server-gitlab` with personal access token.
   - `slack`: Stdio `npx -y @modelcontextprotocol/server-slack` with bot and user tokens.
   - `notion`: Currently published as stdio package `npx @modelcontextprotocol/server-notion`. Community gateways exist, but official distribution is stdio.
   - `brave-search`: Stdio `npx -y @modelcontextprotocol/server-brave-search` taking `BRAVE_API_KEY`.
   - `google-maps`: Stdio `npx -y @modelcontextprotocol/server-google-maps` taking `GOOGLE_MAPS_API_KEY`.
   - `linear`: Community hosted webhooks exist, but standard MCP preset uses stdio.
4. **Summary & Recommendation:**
   - Only `context7` provides an immediate, open public remote endpoint without mandatory preliminary enterprise auth setup. Sentry is the prime candidate for a subsequent migration to Streamable HTTP once organization token entry is standardized in the mobile credentials sheet.

## Manual testing checklist for Arduino hardware environment

1. **CLI Apps path resolution on target device:**
   - Install a test CLI binary via global npm: `npm install -g @modelcontextprotocol/server-everything`.
   - Install a test tool via uv tool: `uv tool install cowsay` (or ensure `uv tool dir --bin` has binaries).
   - In Nanobot Settings / Ecosystem, verify that tools installed in `npm prefix -g`/bin and `uv tool dir --bin` are discovered with `available: true` and executable without manual PATH export.
2. **MCP preset Context7 remote connection:**
   - Navigate to Ecosystem > MCP > Context7.
   - Verify preset transport is Streamable HTTP (`https://mcp.context7.com/mcp`).
   - Tap "Save" and "Test": verify successful handshake without launching local node/npm processes.
3. **NPX cache error handling & secret redaction:**
   - Deliberately corrupt npx cache: `rm -rf ~/.npm/_npx`.
   - Attempt to run or test a stdio preset (e.g. `playwright`).
   - Verify that the error surface displays the failure reason truncated to <=300 characters with tokens redacted, accompanied by the prompt: `La cache di npx è corrotta: sul server esegui npm cache clean --force e riprova.`
4. **Refusal codes & device permission locks:**
   - Connect from a secondary/unprivileged mobile client without full power credentials.
   - In Plugins and CLI Apps tabs, verify that install/enable switches display the lock icon and the caption: `Serve un dispositivo con pieno controllo`.
   - In server settings, toggle remote package installation off: verify caption changes to `Installazione da remoto disattivata: attivala dal browser sul server, in Impostazioni`.
5. **Client-side search responsiveness:**
   - In CLI Apps, MCP, and Plugins tabs, type queries with accented characters (e.g., `caffè`, `è`, `a`).
   - Confirm search matches unaccented and accented text identically.
   - Type an unmatching query (e.g., `xyz123`) and verify empty state shows `Nessun risultato per «xyz123»`.
