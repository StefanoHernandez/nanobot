# W1-fixB: search, skill proposals and models.dev fixes (owner: agy)

Branch `agy/W1-fixB`, from `origin/claude/wave1-review` (wave 1 already merged there, plus the app review fixes), **in your own worktree**. Follow `mobile/docs/agy/README.md` (full pytest: server files change). Another agy works on `W1-fixA` in parallel: stay in `nanobot/ext/search.py`, `nanobot/agent/tools/search_history.py`, `nanobot/ext/skill_proposals.py`, `nanobot/ext/model_info.py`, the search/skills hooks in `nanobot/webui/ws_http.py`, their tests, and in the app only `src/screens/search/**` and `src/screens/ecosystem/memory/MemoryScreen.tsx` (route params only).

These come from the review of SR-A, SK-A and MI-A.

## 1. Search (SR-A)
1. **Auth off the loop (MED).** `ws_http.py` runs the whole `dispatch_search_get` in `asyncio.to_thread`, so token checks mutate the shared token dict from a worker thread, and every GET (static files too) pays a thread hop. Do path match, auth and parsing on the loop; run only `search(...)` in a thread.
2. **Wrong sessions DB (MED).** `search.py` ~131-151 rebuilds the path with `SessionLocation(workspace)`, which is not read-only (creates dirs, takes a lock, may write `workspace-id`) and ignores `runtime_data_dir`. Use the live manager's `sessions_dir` (`ctx.sessions` in the tool, the router's session manager in HTTP). Drop the env vars and the cwd fallback; tests pass the dir explicitly.
3. **Untrusted content (MED).** `search_history` returns chat/journal/kanban text raw. Prefix the same notice `search_sessions` uses (`_UNTRUSTED_NOTICE`, `agent/tools/sessions.py`) and exclude the current session like it does.
4. `source` column → `UNINDEXED` (searching "kanban" matches every kanban row). Bump an index schema version so an old `ext_search.db` is rebuilt.
5. `refresh()` errors: log and search the existing index; never 500.
6. Read-only URIs: `path.as_uri() + "?mode=ro"`.
7. `limit` capped at 100.
8. **App:** a journal result must open Memoria on the Diario tab at that date. `MemoryScreen` ignores route params today: read `tab` and `date` (only these; another agy edits the tab bar). Test.

## 2. Skill proposals (SK-A)
1. **Test reads the real `~/.nanobot` (MED).** `test_activate_without_privilege_returns_403` builds the handler without `timezone`, so `_handle_post` calls `load_config()`. Pass what is needed; load config only for what is actually missing. Add positive activate tests through the route (local browser, full-power device) **without** monkeypatching `privileged_request`.
2. **Use `require_privileged(request)`** from `devices.py` for activate (one error code `full_power_required`).
3. **GET auth:** use `router_admin_authorized(...)` like the other ext GETs, not `router.tokens.check_api_token`.
4. **Body limit:** use `devices.read_json` (with its 413) instead of the local `_read_json`.
5. **Don't create sessions:** `propose` uses `sessions.state.get(key)`, which creates a missing session. Use `await sessions.state.read(key)`; unknown key → 404.
6. **Failed turns:** `agent_turn` returns an OutboundMessage; when `metadata["_stop_reason"] == "error"`, `propose` answers 502 `turn_failed` (not `proposal: null` with the error text), and the scout does **not** advance its cursor.
7. **Scout file I/O** (`run_scout_job`: history read, cursor write) in `asyncio.to_thread`. Other proposal file ops in async handlers too.
8. `updates` also when the name matches a builtin skill (`SkillsLoader` builtin names).
9. Caps: `content` ≤ 64 KB, `summary` ≤ 300, `reason` ≤ 500 chars in `write_proposal`.
- Tests for each.

## 3. models.dev cache (MI-A)
1. Cache failures in memory for 10 minutes (no cache file, or stale file): no 10 s wait on every request when offline.
2. Atomic cache write (temp file + `os.replace`).
3. Do not cache an empty `{}`.
- Tests.

## Checks
- `.venv/bin/python -m pytest -p no:cacheprovider tests` (known failures in the README).
- `.venv/bin/ruff check` and `.venv/bin/basedpyright` on the touched Python files.
- `cd mobile && npx jest && npx tsc --noEmit`

## Do not
- Touch `nanobot/ext/kanban*.py`, `devices.py` (call it, don't change it), `automations.py`, `journal.py`. Write to `sessions.sqlite3`. Add dependencies. Edit `mobile/vendor/**`.

## Report
`mobile/docs/agy/reports/W1-fixB.md`: files, tests, deviations.

Commit, push `agy/W1-fixB`, and give the last hash. Do not merge.
