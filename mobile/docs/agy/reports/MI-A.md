# MI-A report: real context window and effort levels for OpenCode models, from models.dev

Branch `agy/MI-A`, branched from `origin/main` (`531aafa77`). Not merged.

## Files changed and created

### Created
- `nanobot/ext/model_info.py`: fork extension handling `models.dev` catalog fetching with 24h disk/memory caching, row enrichment, and catalog fallback for unsupported providers.
- `tests/ext/test_model_info.py`: comprehensive tests with mocked `http_get`, tmp_path isolated cache, cache expiration, error handling, toggle model exclusions, and enrichment.
- `mobile/docs/agy/reports/MI-A.md`: this report.

### Modified
- `nanobot/webui/settings_models.py`: added minimal, commented inline hooks in `provider_models_payload` for unsupported provider fallback and OpenAI-compatible enrichment.
- `tests/webui/test_settings_api.py`: updated `fake_get` to handle `https://models.dev/api.json` and added integration tests for OpenCode Go enrichment and Anthropic fallback.
- `mobile/src/i18n/it.json`: added `defaultContextHint` ("Valore predefinito: controlla il contesto del modello").
- `mobile/src/i18n/en.json`: added `defaultContextHint` ("Default value: check the model context").
- `mobile/src/screens/settings/ModelsSection.tsx`: updated `catalogued` condition to include Anthropic; added `ctxTouched` state and helper display for untouched 200000 default context window; updated `applyModelDefaults`.
- `mobile/test/screens/models-settings.test.tsx`: added tests verifying untouched default context hint, OpenCode catalog context window fill, clearing hint on manual input, and Anthropic catalogued check.
- `mobile/test/extras/effort.test.ts`: added test verifying effort level extraction for OpenCode-like catalog rows.

---

## Brief Items & Implementation Mapping

1. **Server catalog fetch and 24h cache (`models_dev_catalog`):**
   - Implemented in `nanobot/ext/model_info.py:50-108`.
   - Fetches `https://models.dev/api.json` with 10s timeout and `Accept: application/json`.
   - Caches in memory and in `get_data_dir() / "cache" / "models-dev.json"` for 24h.
   - On network error, reads stale cache file if present, otherwise returns `{}`; never raises.

2. **Row enrichment (`enrich_rows`):**
   - Implemented in `nanobot/ext/model_info.py:126-189`.
   - Matches model IDs exactly (including full `vendor/model` prefix for OpenRouter).
   - Sets `context_window` from `limit.context` when the row has none.
   - Sets `max_output_tokens` from `limit.output` (informational).
   - Sets `reasoning_efforts` from `effort` option's `values` when the row has none; ignores `toggle` and `budget_tokens`.
   - Unmatched rows and unknown providers are left unchanged.

3. **Anthropic unsupported provider fallback:**
   - Implemented in `nanobot/ext/model_info.py:200-249` (`unsupported_provider_models_payload`).
   - Hook in `nanobot/webui/settings_models.py:567-571`.
   - App's `catalogued` check updated in `mobile/src/screens/settings/ModelsSection.tsx:311` so `row.name === "anthropic"` with `row.configured` allows browsing and selecting catalog models.

4. **Hook in `provider_models_payload`:**
   - Hook in `nanobot/webui/settings_models.py:666-668` after `_extract_model_rows`, reusing existing `http_get`.

5. **App preset editor & default context window:**
   - Implemented in `mobile/src/screens/settings/ModelsSection.tsx:308, 311, 321-337, 441-456`.
   - When new preset has untouched default 200000, shows helper "Valore predefinito: controlla il contesto del modello".
   - When model with catalog context is picked/typed, fills `context_window` and changes helper to "Impostato dal modello".
   - When user manually edits context, helper is cleared.

6. **Effort pill test:**
   - Implemented in `mobile/test/extras/effort.test.ts:49-60`.

---

## Provider ID Mapping Analysis

Candidate map evaluated against real provider model IDs:
- `opencode_go -> opencode-go`: **Kept** (verified against real models `glm-5.3`, `mimo-v2.6-pro`, `grok-4.7`, `kimi-k3`).
- `opencode -> opencode`: **Kept** (verified against real models `claude-sonnet-4-5`, `gpt-5.4`, `deepseek-v4-pro`).
- `opencode_zen -> opencode`: **Kept** (alias of opencode).
- `openai -> openai`: **Kept** (verified against real models `gpt-4o`, `gpt-4o-mini`, `gpt-3.5-turbo`).
- `anthropic -> anthropic`: **Kept** (verified against real models `claude-sonnet-4-5`, `claude-opus-4-5`).
- `gemini -> google`: **Kept** (verified against real models `gemini-2.5-flash`, `gemini-2.5-pro`).
- `deepseek -> deepseek`: **Kept** (verified against real models `deepseek-flash`, `deepseek-v4-flash`, `deepseek-v4-pro`).
- `openrouter -> openrouter`: **Kept** (verified against real models `anthropic/claude-sonnet-4-5`, `sao10k/l3-lunaris-8b`).
- `mistral -> mistral`: **Kept** (verified against real models `mistral-large-latest`, `codestral-latest`).
- `groq -> groq`: **Kept** (verified against real models `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`).
- `moonshot -> moonshotai`: **Kept** (verified against real models `kimi-k2.6`, `kimi-k2.7-code`, `kimi-k3`).
- `zhipu -> zhipuai`: **Kept** (verified against real models `glm-4.5`, `glm-5.2`, `glm-5.3`).
- `dashscope -> alibaba`: **Kept** (verified against real models `qwen-max`, `qwen-plus`, `qwen-turbo`).
- `minimax -> minimax`: **Kept** (verified against real models `MiniMax-M2`, `MiniMax-M2.7-highspeed`, `MiniMax-M3`).
- `xai -> xai`: **Dropped**. Nanobot does not register any provider with name `xai` (the provider is `xai_grok`, an OAuth hybrid with `xai-grok/*` IDs).

---

## Verification & Test Raw Output

### 1. Python ruff & basedpyright
```
$ .venv/bin/ruff check nanobot/ext/model_info.py nanobot/webui/settings_models.py tests/ext/test_model_info.py tests/webui/test_settings_api.py
All checks passed!

$ .venv/bin/basedpyright nanobot/ext/model_info.py nanobot/webui/settings_models.py tests/ext/test_model_info.py tests/webui/test_settings_api.py
0 errors, 0 warnings, 0 notes
```

### 2. Python pytest
```
$ .venv/bin/python -m pytest -p no:cacheprovider tests/ext/test_model_info.py tests/webui/test_settings_api.py -k "models_dev or model_catalog"
============================== 11 passed in 0.32s ==============================

$ .venv/bin/python -m pytest -p no:cacheprovider tests
FAILED tests/channels/test_channel_setup.py::test_every_runtime_channel_field_has_a_webui_contract
FAILED tests/channels/test_scheduled_delivery.py::test_unavailable_adapter_does_not_report_success[telegram]
FAILED tests/channels/test_scheduled_delivery.py::test_unavailable_adapter_does_not_report_success[slack]
FAILED tests/channels/test_scheduled_delivery.py::test_unavailable_adapter_does_not_report_success[matrix]
FAILED tests/test_benchmark_session_storage.py::test_session_storage_benchmark_emits_auditable_windows_safe_result
FAILED tests/tools/test_tool_validation.py::test_exec_rejects_home_path_without_home_directory
FAILED tests/webui/test_remote_pairing.py::test_server_appends_restricted_key_and_revoke_preserves_existing
====== 7 failed, 8065 passed, 58 skipped, 2 warnings in 270.18s (0:04:30) ======
(The 7 failures are known environment-specific baseline failures documented in mobile/docs/agy/README.md; 9 new tests pass).
```

### 3. Mobile Jest & TypeScript
```
$ cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest
Test Suites: 129 passed, 129 total
Tests:       1038 passed, 1038 total
Snapshots:   0 total
Time:        12.077 s

$ cd mobile && npx tsc --noEmit
(exit 0, no errors)
```

### 4. Expo Android Export
```
$ cd mobile && rm -rf /tmp/nb-export && npx expo export --platform android --output-dir /tmp/nb-export
[expo-share-intent] IOS module disabled
Starting Metro Bundler
Android Bundled 11843ms index.js (2544 modules)
› Assets (70)
› android bundles (1)
› Files (1)
Exported: /tmp/nb-export
(exit 0, no errors)
```

---

## Deviations & Unverified Items
- **Dependencies:** Zero dependencies added.
- **`mobile/vendor/**`:** Not edited.
- **Deviations:** None. All brief requirements and contracts were implemented as requested.
- **What could not be verified:** End-to-end interaction on a physical Android device connecting to a live nanobot server instance on Arduino over Tailscale (verified via Jest, Expo release bundling, and Python server integration suites).
