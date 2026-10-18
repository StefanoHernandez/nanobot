# FX-A report

Branch `agy/FX-A`, from `origin/main`. Not merged.

## Files changed

- `nanobot/ext/devices.py` — added `require_privileged(request) -> web.Response | None` helper; enforced on `POST /api/ext/devices/revoke`.
- `nanobot/ext/approvals.py` — enforced `require_privileged(request)` on `POST /api/ext/approvals/settings` and `/forget`.
- `nanobot/ext/backup.py` — enforced `require_privileged(request)` on `POST /api/ext/backup/settings`, `/delete`, and `/restore`.
- `nanobot/ext/kanban_dispatch.py` — added `is_failed_turn` to detect provider errors and mark tasks/wakes as failed instead of done.
- `nanobot/ext/kanban.py` — closed task runs on `request_review`, `block_task`, and `review_verdict(approved=False)`; allowed reviewer claiming of tasks in review; promoted ready children in `move_task(..., "done")`.
- `nanobot/ext/automations.py` — enforced `MAX_JSON_BODY_BYTES = 1024 * 1024` on `_read_json`, returning 413 `body_too_large`.
- `nanobot/ext/journal.py` — enforced `MAX_JSON_BODY_BYTES = 1024 * 1024` on `_read_json`, returning 413 `body_too_large`.
- `tests/ext/test_devices.py` — tests for `require_privileged` on `/revoke`.
- `tests/ext/test_approvals.py` — tests for `require_privileged` on `/settings` and `/forget`.
- `tests/ext/test_backup.py` — tests for `require_privileged` on `/settings`, `/delete`, and `/restore`.
- `tests/ext/test_kanban_dispatch.py` — tests for LLM error failures in dispatch loop.
- `tests/ext/test_kanban.py` — tests for `move_task` promoting children and task run closure on review/block/reject.
- `tests/ext/test_automations.py` — test for oversized request body on `POST /api/ext/automations/create`.
- `tests/ext/test_journal.py` — tests for oversized request bodies on `POST /api/ext/journal/settings` and `/run`.

No new dependencies added. Upstream files, `mobile/**` (except this report), and `mobile/vendor/**` were not edited.

## Brief checklist

| Item | Where | Description |
| --- | --- | --- |
| 1. Privileged mutations | `nanobot/ext/devices.py:84`, `nanobot/ext/approvals.py:228`, `nanobot/ext/backup.py:333` | Enforce `require_privileged` returning 403 `{"error": "full_power_required"}` for non-full-power devices on `/devices/revoke`, `/approvals/settings`, `/approvals/forget`, `/backup/settings`, `/backup/delete`, `/backup/restore`. |
| 2.1 LLM error stored as failed | `nanobot/ext/kanban_dispatch.py:51`, `nanobot/ext/kanban_dispatch.py:94` | `is_failed_turn` checks reply attributes/content and calls `_fail_running_task` / `_fail_wake`. |
| 2.2 Review runs and claiming | `nanobot/ext/kanban.py:850`, `nanobot/ext/kanban.py:1051`, `nanobot/ext/kanban.py:1070`, `nanobot/ext/kanban.py:1104` | Task runs closed on `request_review` (status `review`), `block_task` (status `blocked`), `review_verdict` reject (status `rejected`). Tasks in review claimed for reviewer with session `kanban:<task>:<reviewer>`. |
| 2.3 Manual move to done promotes children | `nanobot/ext/kanban.py:694` | `move_task(task_id, "done")` calls `_promote_ready_children(conn, task_id)`. |
| 3. Request body limits | `nanobot/ext/automations.py:127`, `nanobot/ext/journal.py:503` | Enforce `MAX_JSON_BODY_BYTES = 1024 * 1024` on body read, returning 413 `body_too_large`. |

## Item 2.1 Failure Shape

When an LLM provider fails during `run_turn` / `submit_local_trigger_turn`, the agent runner catches provider exceptions and returns a text error string rather than raising an uncaught exception. Specifically:
- Error strings returned start with `"Error calling LLM:"`, `"Error calling <Provider>:"`, `"Error: "`, `"Sorry, I encountered an error calling the AI model."`, `"Account in arrears"`, or `"turn failed"`.
- Response objects or dictionaries can also carry finish/stop reasons `"error"` (or an `error` truthy attribute/key).
`is_failed_turn` in `nanobot/ext/kanban_dispatch.py` checks both object attributes (`finish_reason`, `stop_reason`, `error`), dictionary keys, and known error string prefixes. When matched, `dispatch_once` calls `_fail_running_task` (or `_fail_wake`), which increments retries and moves the task to `blocked` once max retries are exceeded.

## Phone impact (Full Power)

A paired phone without full power will now receive HTTP 403 `{"error": "full_power_required"}` if it attempts:
1. To change approval mode/settings or forget approved patterns (`POST /api/ext/approvals/settings`, `POST /api/ext/approvals/forget`). Note: deciding pending requests (`POST /api/ext/approvals/decide`) remains open to all authorized devices.
2. To revoke paired devices (`POST /api/ext/devices/revoke`).
3. To configure the backup storage folder, delete an existing backup, or restore a backup over the server (`POST /api/ext/backup/settings`, `POST /api/ext/backup/delete`, `POST /api/ext/backup/restore`). Note: creating backups (`POST /api/ext/backup/create`) remains open to all authorized devices.

## Verification Checks

### pytest tests/ext/ (190 passed)
```
.venv/bin/python -m pytest tests/ext/
190 passed in 2.87s
```

### ruff check on touched files
```
.venv/bin/ruff check nanobot/ext/approvals.py nanobot/ext/automations.py nanobot/ext/backup.py nanobot/ext/devices.py nanobot/ext/journal.py nanobot/ext/kanban.py nanobot/ext/kanban_dispatch.py tests/ext/test_approvals.py tests/ext/test_automations.py tests/ext/test_backup.py tests/ext/test_devices.py tests/ext/test_journal.py tests/ext/test_kanban.py tests/ext/test_kanban_dispatch.py
All checks passed!
```

### basedpyright on touched files
```
.venv/bin/basedpyright nanobot/ext/approvals.py nanobot/ext/automations.py nanobot/ext/backup.py nanobot/ext/devices.py nanobot/ext/journal.py nanobot/ext/kanban.py nanobot/ext/kanban_dispatch.py tests/ext/test_approvals.py tests/ext/test_automations.py tests/ext/test_backup.py tests/ext/test_devices.py tests/ext/test_journal.py tests/ext/test_kanban.py tests/ext/test_kanban_dispatch.py
0 errors, 0 warnings, 0 notes
```

### full pytest suite
```
.venv/bin/python -m pytest -p no:cacheprovider tests
8069 passed, 58 skipped, 7 failed in 232.36s
```
The 7 failures are known environment/optional-dependency issues outside touched files:
- `test_every_runtime_channel_field_has_a_webui_contract` (documented in README: optional Matrix dependency)
- `test_server_appends_restricted_key_and_revoke_preserves_existing` (documented in README: host umask 002)
- `test_exec_rejects_home_path_without_home_directory` (documented in README: flaky in full run when HOME unset)
- `test_scheduled_delivery.py` (3 tests: missing optional channel packages telegram, slack, matrix in python 3.14 env)
- `test_benchmark_session_storage.py` (missing uv.lock sha check in worktree)

## Deviations

None.
