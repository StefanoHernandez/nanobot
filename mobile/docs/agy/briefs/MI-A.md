# MI-A: real context window and effort levels for OpenCode models, from models.dev (owner: agy)

Branch `agy/MI-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires (full pytest: server files change). Server logic goes in a **fork file** (`nanobot/ext/model_info.py`); the upstream file gets only a minimal, commented hook.

## The bug the user sees
- In the model editor, every OpenCode Go model gets a context window of **200000**. That is the editor's default (`mobile/src/screens/settings/ModelsSection.tsx:294`), never replaced.
- The effort pill shows low/medium/high for every model. MD-B made it use the catalog's `reasoning_efforts`, but this catalog has none, so it falls back to the preset's generic list.

**Root cause:** `provider_models_payload` (`nanobot/webui/settings_models.py:515`) fills OpenAI-compatible providers from `GET {api_base}/models`. OpenCode answers with ids only: `{"id":"glm-5.3","object":"model","owned_by":"opencode"}`. There is no context window and no effort list.

## The data source: models.dev
- `https://models.dev/api.json` is the public model catalog that OpenCode itself uses. `registry.py:290` already names it.
- It has a provider `opencode-go` with 32 models and a provider `opencode` with 127 models. Each model has:
  - `limit.context`, `limit.output`;
  - `reasoning` (bool);
  - `reasoning_options`: a list of entries.
    - `{"type":"effort","values":["low","medium","high","xhigh"]}` gives the effort levels.
    - `{"type":"toggle"}` and `{"type":"budget_tokens",…}` are not effort levels: ignore them.
- It is public. The request carries no key and nothing about the user.

## 1. Server: `nanobot/ext/model_info.py`
- `models_dev_catalog(http_get) -> dict`:
  - fetch `https://models.dev/api.json` (timeout 10 s);
  - cache it in memory and in `get_data_dir() / "cache" / "models-dev.json"` for **24 h**;
  - on a network error, use the stale file if there is one, otherwise `{}`;
  - never raise.
- `enrich_rows(provider_name: str, rows: list[dict], catalog: dict) -> list[dict]`:
  - map the provider spec name to the models.dev id with a small dict. Start with:
    `{"opencode_go": "opencode-go", "opencode": "opencode", "opencode_zen": "opencode", "openai": "openai", "anthropic": "anthropic", "gemini": "google", "deepseek": "deepseek", "openrouter": "openrouter", "mistral": "mistral", "xai": "xai", "groq": "groq", "moonshot": "moonshotai", "zhipu": "zhipuai", "dashscope": "alibaba", "minimax": "minimax"}`.
    Before keeping each pair, check that a few real model ids match between the provider and models.dev. Drop the pairs that do not match, and list them in the report.
  - match model ids exactly first. For OpenRouter-style ids (`vendor/model`), match the full id; do not strip the prefix;
  - for each row whose `id` is in that provider's models:
    - set `context_window` from `limit.context` **when the row has none**;
    - set `max_output_tokens` from `limit.output` (informational);
    - set `reasoning_efforts` from the `effort` option's `values`, **when the row has none**;
  - rows without a match are left as they are.
- **Anthropic has no list today.** `model_catalog_kind` returns `"unsupported"` for it (not `openai_compat`), so the user has to type the id by hand. In the `unsupported` branch of `provider_models_payload`, when the provider is in the map, return the models.dev models for it as an `available` list, with `source: "models.dev"`: id, label (`name`), `context_window`, `reasoning_efforts`. Use the same one-line commented hook. Also make the app's `catalogued` check accept that list: the app reads `row.model_catalog`, so check what the settings payload says for Anthropic and change only what is needed. Say in the report what you changed.
- **Hook:** in `provider_models_payload`, at the OpenAI-compatible path (after `_extract_model_rows`), call the enrichment. The call is one line plus a `# Fork (nanobot/ext/model_info.py): …` comment, with the import inside the function, as in `nanobot/channels/websocket/runtime.py:702-727`. Reuse the `http_get` the function already receives.
- **Tests** (`tests/ext/test_model_info.py`), with fake `http_get` and `tmp_path`:
  - context and efforts are filled for a matching id;
  - a row that already has a context window keeps it;
  - toggle-only models get no efforts;
  - an unknown provider is unchanged;
  - the cache is used within 24 h and refreshed after;
  - a network error with a stale cache uses the cache, and without a cache returns the rows unchanged.

  **Never touch the real `~/.nanobot`:** monkeypatch the cache path.
- Update the provider-models test in `tests/` for the new hook, if one covers that path.

## 2. App
- `ModelsSection.tsx` `PresetEditor`: when the catalog gives a `context_window`, MD-B's `applyModelDefaults` already fills it. Check that this works for OpenCode once the catalog is enriched (jest with a mocked catalog).
- **The 200000 default for a new preset:**
  - if the picked model has a catalog context, use it;
  - if not, keep 200000, but show the helper "Valore predefinito: controlla il contesto del modello" under the field. Show it only while the value is still the untouched default.
- Effort pill: no change needed. Add one jest case in `test/extras/effort.test.ts` with an OpenCode-like catalog row carrying `reasoning_efforts`.

## Checks
- `.venv/bin/python -m pytest -p no:cacheprovider tests` (3 known failures, see README).
- `.venv/bin/ruff check` and `.venv/bin/basedpyright` on the touched Python files.
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`

## Do not
- Add dependencies. Edit `mobile/vendor/**`. Import `@react-navigation/*`.
- Send any key or header other than `Accept` to models.dev.

## Report
`mobile/docs/agy/reports/MI-A.md`: files, tests, provider ids mapped, deviations.

Commit, push `agy/MI-A`, and give the last hash. Do not merge.
