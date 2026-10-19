# EC-A: CLI apps, MCP and plugins that really work from the app, plus search (owner: agy)

Branch `agy/EC-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md` (full pytest: server files change). Two other agents work in parallel: `agy/W2-sec` (server: `nanobot/ext/approvals.py`, `settings_runtime.py`, kanban, journal, search, skill proposals) and `agy/LK-A` (app: `app/_layout.tsx`, `app/NativeIntegrations.tsx`, `src/extras/lock.tsx`, `src/screens/connect/**`). Do not touch their files. i18n: only **add** keys.

These are upstream files (`nanobot/apps/cli/`, `nanobot/webui/mcp_*`): they are real bugs, so fix them in place, keep diffs small, and mark each change with a `# Fork:` comment so the weekly upstream merge sees them.

Reported on the arduino (Debian, gateway as a systemd user service, `PATH=/home/arduino/.local/bin:/usr/local/bin:/usr/bin:/bin`, npm with `prefix=~/.npm-global` in `~/.npmrc`).

## 1. CLI apps: installed but "missing" forever (HIGH)
`npm install -g` succeeds and puts the command in `~/.npm-global/bin`, which is not on the gateway `PATH`. So `_app_payload` (`nanobot/apps/cli/service.py:679`) uses `shutil.which(entry_point)` → `None` → status `missing`; "Update" reinstalls the same version and nothing changes; `run_cli_app` fails with "not available on PATH".
- Resolve the package managers' global bin dirs once per process (cached): `npm prefix -g` + `/bin` (Windows: the prefix itself), and the uv tool bin (`uv tool dir --bin`) when uv is used. Build one search path = those dirs + the current `PATH`.
- Use it everywhere the service looks up or runs an app: `shutil.which(name, path=...)` in `_app_payload` and in the run path (find every `shutil.which` for entry points, incl. line ~247), and the `PATH` of the child env (`~1015`) so the app's own subprocesses work too.
- If a lookup command fails or times out (≤ 5 s), fall back to today's behaviour; never raise.
- Tests (fake `_run_argv`/`subprocess`, `tmp_path` bin dir with an executable file): an app installed in the npm prefix bin is `installed`; run finds it; failing `npm prefix -g` → falls back; Windows branch untouched.

## 2. MCP presets: failures without a reason (HIGH)
Seen: the **Context7** preset is `stdio` `npx -y @upstash/context7-mcp@latest`; the npx cache on the arduino was broken (`ERR_MODULE_NOT_FOUND`), the process died, and the app showed only "failed". A hand-made `streamableHttp` entry (`https://mcp.context7.com/mcp`, header `Authorization: Bearer <key>`) works.
1. **Context7 preset → HTTP.** In `nanobot/webui/mcp_presets.json` switch `context7` to `streamableHttp` with that URL and the key as an **optional** header field (`target: ["header", "Authorization"]`, `value_prefix: "Bearer "`; check how other HTTP presets with optional keys are written and copy that). Check the other 22 `stdio` presets: if a vendor documents an official remote HTTP endpoint, list it in the report (do not switch them without a documented URL).
2. **Preset over an existing entry of another transport.** `_materialize_server` (`mcp_presets_api.py:293`) clones the existing entry and appends the preset's args: on the arduino a `streamableHttp` entry ended up with `args: ["--api-key", "ctx7sk-…"]` and `command: ""`. When `existing.type` differs from `preset.server.type`, start from the preset server (keep only the field values the user typed), so no stale args/command/url survive. Test.
3. **Real error text.** Find where a connection failure becomes the status shown by `/api/settings/mcp-presets` (and `Test`). Store a short reason (≤ 300 chars, no secrets: strip header values, env values and `--api-key`-style arg values): the exception message, and for `stdio` the last lines of the child's stderr when available. Recognise `ERR_MODULE_NOT_FOUND` / `npm ERR` and add a hint: "La cache di npx è corrotta: sul server esegui `npm cache clean --force` e riprova." (i18n on the app side, keyed by a code like `npx_cache_broken`). Tests: failure reason in the payload; secrets stripped; npx hint code.
4. App (`src/screens/ecosystem/apps/McpTab.tsx`, `McpSheet.tsx`, `src/ecosystem/mcp.ts`): show the reason under a failed server and in the sheet after Test. Test.

## 3. Plugins: blocked without saying why (MED)
"Plugins" in the app are the optional channel features (`/api/settings/nanobot-features`). Enabling needs full power (`features-enable` is in `needs_local_browser`, `nanobot/webui/settings_routes.py:~313`) and installing packages needs `tools.webui_allow_remote_package_install` (default `False`). From a normal phone the server answers 403 and the app shows a generic error.
- Server: make sure both refusals carry a stable code in the JSON body (`full_power_required`, `remote_install_disabled`); add the code where it is missing, do not change the status codes.
- Check how a package is installed (`run_install_command` in `nanobot/optional_features.py`) when nanobot itself runs from `uv tool install` (the arduino setup): does it install into the tool's environment? If not, fix it so it targets `sys.executable`'s environment, or return a clear `unsupported_install_env` with the manual command. Say what you found in the report.
- App (`PluginsTab.tsx`, `src/ecosystem/apps.ts`): for these codes show a lock and the reason: "Serve un dispositivo con pieno controllo" / "Installazione da remoto disattivata: attivala dal browser sul server, in Impostazioni" (and the manual command for `unsupported_install_env`). Same treatment in `CliAppsTab.tsx` and `McpTab.tsx` if their actions return those codes. Tests per code.

## 4. Search in CLI apps, MCP and plugins (MED)
Skills have a search field (`SkillsScreen.tsx`); the CLI apps (remote registries, often hundreds of entries), the 134 MCP presets and the plugins list do not.
- Add one search field at the top of `CliAppsTab`, `McpTab`, `PluginsTab`: client-side filter on name, display name, description, category; case- and accent-insensitive; installed items first. Reuse the look of the skills search field (`TextField`); if the three need the same filter code, one small helper in `src/screens/ecosystem/apps/`.
- Empty state "Nessun risultato per «{q}»".
- Tests: filter matches description and is accent-insensitive; empty state.

## Checks
- `PYTHONPATH=. ../nanobot/.venv/bin/python -m pytest -p no:cacheprovider tests` (known failures in the README).
- `ruff check` and `basedpyright --pythonpath ../nanobot/.venv/bin/python` on the touched Python files.
- `cd mobile && npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export-ec`

## Do not
- Touch `mobile/vendor/**`, the files owned by W2-sec or LK-A. Add dependencies. Log or return secrets (API keys, headers, env values). Read or write the real `~/.nanobot` or `~/.npm` in tests.

## Report
`mobile/docs/agy/reports/EC-A.md`: files, tests, how plugin packages are installed under `uv tool`, the stdio presets with an official HTTP endpoint, deviations, what needs the arduino to check (CLI app status after install, Context7 preset, plugin enable with and without full power).

Commit (no `Co-Authored-By` lines, never `mobile/node_modules`), push `agy/EC-A`, and give the last hash. Do not merge.
