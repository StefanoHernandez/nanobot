# W2-sec report

Branch `agy/W2-sec`, from `origin/main`. Not merged.

## Files changed

- `nanobot/ext/approvals.py` — Raised `MAX_SUMMARY` to 8000 chars; denies commands exceeding 8000 chars without prompting; fails closed on corrupt or unreadable approval file (`enabled: True, allow: {}`) with a logged warning while keeping `enabled: False` default for missing files; gates `ExecSessionTool.execute` (tool name `exec_session`, summary `<session_id>: <input>`) for non-empty input; gates `CliAppsTool.execute` (tool name `run_cli_app`, summary `<name> <args>`).
- `nanobot/security/workspace_policy.py` — Added `safe_workspace_file(root, path) -> Path | None` helper verifying path is not a symlink, resolves within `root`, and is a regular file.
- `nanobot/ext/memory_pages.py` — Updated `_read_page_text` to validate file safety via `safe_workspace_file`.
- `nanobot/ext/search.py` — `_sync_journal` ignores symlinked journal files and folders using `safe_workspace_file`.
- `nanobot/ext/journal.py` — `read_day`, `list_days`, and `load_settings` use `safe_workspace_file` to ignore symlinks; `_chat_pieces` filters sessions by `updated_at` before loading transcripts and replaces `sessions.get_or_create` with `sessions.get_existing`; `execute_day` offloads synchronous `collect_day` to `asyncio.to_thread`.
- `nanobot/ext/skill_proposals.py` — `list_proposals`, `get_proposal`, `activate_proposal`, and `reject_proposal` verify proposal directory and files are not symlinks via `safe_workspace_file`; refuses symlinked proposals with 404.
- `nanobot/webui/settings_runtime.py` — Expanded privileged runtime settings from single remote package install check to `PRIVILEGED_RUNTIME_PATHS` covering 16 dangerous configuration paths (execution, sandbox, SSRF whitelist, gateway bind); requires `local_browser` (full power) when values change.
- `nanobot/webui/settings_api.py` — Default `local_browser: bool = True` in `update_runtime_config_settings` for internal callers.
- `nanobot/agent/tools/kanban_tools.py` — Agent `create` and `update` cannot start cards or set `status="ready"`; cards remain in `todo` with a note that the user must start the card from the Kanban UI; removed unused start helper.
- `nanobot/ext/kanban.py` — Introduced `_connection()` contextmanager using `contextlib.closing` and transaction context to prevent sqlite connection and fd leaks across all queries; `complete_task` only re-queues recurring cards to `ready` if the card has recorded at least one prior run.
- Tests:
  - `tests/ext/test_approvals.py`
  - `tests/ext/test_journal.py`
  - `tests/ext/test_search.py`
  - `tests/ext/test_skill_proposals.py`
  - `tests/ext/test_kanban_tools.py`
  - `tests/ext/test_kanban.py`
  - `tests/webui/test_settings_runtime.py`

No dependencies added. `mobile/**` (except this report) was not touched.

## Brief checklist

| Item | Where |
| --- | --- |
| 1. Approvals gate all exec paths | `nanobot/ext/approvals.py:194`, `nanobot/ext/approvals.py:277` |
| 1. Approvals cap & fail-closed | `nanobot/ext/approvals.py:33`, `nanobot/ext/approvals.py:60`, `nanobot/ext/approvals.py:176` |
| 2. Symlinks in workspace helper | `nanobot/security/workspace_policy.py:22` |
| 2. Symlinks ignored in journal & search | `nanobot/ext/journal.py:84`, `nanobot/ext/search.py:320` |
| 2. Symlinks refused in skill proposals | `nanobot/ext/skill_proposals.py:80`, `nanobot/ext/skill_proposals.py:137`, `nanobot/ext/skill_proposals.py:178` |
| 3. Privileged runtime paths (sandbox/gateway) | `nanobot/webui/settings_runtime.py:23`, `nanobot/webui/settings_runtime.py:108` |
| 4. Agent cannot start unattended runs | `nanobot/agent/tools/kanban_tools.py:202`, `nanobot/agent/tools/kanban_tools.py:237`, `nanobot/ext/kanban.py:1107` |
| 5. KanbanStore closes connections | `nanobot/ext/kanban.py:246` |
| 6. Journal off event loop & skip old sessions | `nanobot/ext/journal.py:200`, `nanobot/ext/journal.py:321` |

## How exec sessions are started and what was gated

- **Session startup**: In nanobot, `ExecSessionTool` only writes inputs (`params["input"]`) into existing sessions. Background interactive sessions are created via `ExecTool._execute_session`, called directly from `ExecTool.execute(..., session=True)`. Because `ExecTool.execute` was already wrapped by `approvals.install()`, session startup was already gated under the `exec` tool approval rule.
- **What was gated**:
  - `ExecSessionTool.execute`: Gated under tool name `exec_session` whenever `input` is a non-empty string. If input is empty (e.g. read/poll), execution proceeds without approval. Summary format: `<session_id>: <input>`.
  - `CliAppsTool.execute`: Gated under tool name `run_cli_app`. Summary format: `<name> <argv>`.
  - `MAX_SUMMARY`: Raised from 500 to 8000 characters. If a command summary exceeds 8000 characters, it is denied immediately with logged warning without prompting the user, avoiding blind-tail attacks.
  - Fail-closed: `_load` returns `{"enabled": True, "allow": {}}` when an existing approvals file is corrupt or unreadable, logging a warning once. A non-existent file retains default `{"enabled": False, "allow": {}}`.

## Tests

- `tests/ext/test_approvals.py`:
  - `test_approvals_gate_exec_session_non_empty_input`: non-empty input is gated, denied returns error and does not call tool.
  - `test_approvals_skip_exec_session_empty_input`: empty input is not gated.
  - `test_approvals_gate_cli_apps`: `run_cli_app` is gated with tool name `run_cli_app`.
  - `test_approvals_deny_summary_exceeding_max_summary`: summary over 8000 characters is denied without asking.
  - `test_approvals_load_corrupt_file_fails_closed`: corrupt JSON fails closed with `enabled: True`.
  - `test_approvals_load_missing_file_defaults`: missing file defaults to `enabled: False`.
- `tests/ext/test_journal.py`:
  - `test_read_day_refuses_symlink`: symlinks in `memory/journal/` are refused.
  - `test_chat_pieces_skips_sessions_updated_before_day`: sessions updated prior to day start are skipped without reading.
  - `test_execute_day_does_not_block_loop`: `execute_day` offloaded via `asyncio.to_thread` does not block concurrent coroutines on the loop.
- `tests/ext/test_search.py`:
  - `test_symlinked_journal_file_not_indexed`: symlinked journal files are omitted from search index.
- `tests/ext/test_skill_proposals.py`:
  - `test_symlinked_proposal_is_not_listed_not_readable_and_activate_refuses_it`: symlinked proposal dir or file is ignored in list and rejected with 404 on get and activate.
- `tests/webui/test_settings_runtime.py`:
  - `test_privileged_runtime_paths_require_full_power`: non-privileged modification of `tools.exec.sandbox` returns 403; same value succeeds; privileged request (`local_browser=True`) saves; unlisted settings are not restricted.
- `tests/ext/test_kanban_tools.py`:
  - `test_agent_cannot_start_unattended_runs`:
    1. Agent `create` with `start=True` creates card with status `todo`.
    2. Agent `update` with `status="ready"` keeps status `todo`.
    3. HTTP path (`store.save_task`) can still start cards (`status="ready"`).
    4. Agent setting recurrence `every` on a user-started card retains `status="ready"` and stores recurrence.
  - `test_unknown_bot_is_rejected`: unknown bot is rejected.
- `tests/ext/test_kanban.py`:
  - `test_save_task_closes_connection`: verifies `KanbanStore` operations close database connections and do not leak file descriptors.
  - `test_recurrence_without_runs_does_not_requeue_ready`: cards with recurrence that have not completed an actual run do not get re-queued to `ready`.

## Results

- `.venv/bin/python -m pytest -p no:cacheprovider tests`: 8145 passed, 58 skipped, 6 failed, none in touched areas.
  - Failures from README / known: `test_channel_setup.py::test_every_runtime_channel_field_has_a_webui_contract`, `test_scheduled_delivery.py` (3 tests, missing optional Matrix dependency), `test_session_storage_benchmark_emits_auditable_windows_safe_result`, `test_remote_pairing.py::test_server_appends_restricted_key_and_revoke_preserves_existing`.
- Touched tests suite: 151 passed in 5.72s.
- `ruff check`: All checks passed.
- `basedpyright --pythonpath ../nanobot/.venv/bin/python`: 0 errors, 0 warnings, 0 notes on all touched files.

## Deviations and notes

- In `nanobot/ext/skill_proposals.py`, `activate_proposal` and `get_proposal` return HTTP 404 (Not Found) when encountering symlinks, treating unsafe symlink references identically to non-existent proposals.
- In `nanobot/agent/tools/kanban_tools.py`, when an agent requests `start=True`, `status="ready"`, or specifies `every` on an unstarted card, the tool returns `note: "The user must start this card from the Kanban screen."` in the payload to clearly notify the caller why the card remains in `todo`.

## User-visible behaviour changes

1. **Card execution must be started by the user**: The agent cannot trigger immediate unattended autonomous runs. Any card created or modified by an agent through chat tools stays in `todo`. The card only transitions to `ready` when explicitly started by a user in the Kanban UI.
2. **Execution approvals cover session input and CLI apps**: When approvals are enabled, typing commands into background `exec_session` shells or invoking CLI apps prompts for user approval under their respective tool categories (`exec_session`, `run_cli_app`).
3. **Overly long command rejection**: Commands longer than 8000 characters are denied immediately without displaying a prompt, preventing truncated review evasion.
4. **Restricted settings modification on mobile / remote devices**: Settings that control execution sandboxing, gateway binding, and SSRF whitelists cannot be changed from remote devices without full power; they must be changed from a local browser or full-power device.
5. **Symlink containment**: Symlinks created inside the workspace pointing to files outside the workspace or to sensitive configuration files will not be read or indexed by journal search, day reads, or skill proposals.
