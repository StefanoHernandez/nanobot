# W1-fixA report

Branch `agy/W1-fixA`, from `origin/claude/wave1-review`. Not merged.

## Files changed

- `nanobot/ext/kanban.py` — `record_failure` closes the open run in every branch; `move_task` closes the open run as `cancelled` (empty summary) when the status changes; new `record_review_failure`; `recover_interrupted` also handles `review` tasks with an open run; `reviewer_is_assignee` check in `save_task` and skip in the claim; `claim_next_ready_task` returns `is_review`; the review context asks for `kanban(action="verdict")`; `create_task` reads `max_retries` from the body.
- `nanobot/ext/kanban_dispatch.py` — `KanbanTurnFailed`, `turn_text_or_raise(response)`, `_REVIEW_FOOTER`, review-turn handling in `dispatch_once` (normal, failed and exception paths); the text-prefix list is gone from `is_failed_turn`.
- `nanobot/cli/gateway_runtime.py` — `_kanban_run_turn` calls `turn_text_or_raise` (`# Fork:` comment).
- `nanobot/ext/devices.py` — `caller_device_id`; `/revoke` needs full power only when the target is not the caller's own device.
- `tests/ext/test_kanban.py`, `tests/ext/test_kanban_dispatch.py`, `tests/ext/test_devices.py`.

No dependencies added. `mobile/**` (except this report) was not touched.

## Brief checklist

| Item | Where |
| --- | --- |
| 1. Open runs leak: `record_failure` | `nanobot/ext/kanban.py:1148` |
| 1. Open runs leak: `move_task` | `nanobot/ext/kanban.py:702` |
| 1. Open runs leak: `recover_interrupted` (review) | `nanobot/ext/kanban.py:1175`, `nanobot/ext/kanban.py:1381` |
| 2. Review footer and context | `nanobot/ext/kanban_dispatch.py:24`, `nanobot/ext/kanban.py` (`_build_context_content`) |
| 2. Review turn that ends without verdict | `nanobot/ext/kanban_dispatch.py:89`, `dispatch_once` |
| 3. Reviewer = assignee | `nanobot/ext/kanban.py:576`, `nanobot/ext/kanban.py:657`, claim query |
| 4. Failed turn detection | `nanobot/ext/kanban_dispatch.py:17`, `nanobot/ext/kanban_dispatch.py:79`, `nanobot/cli/gateway_runtime.py:1015` |
| 5. Revoke own device | `nanobot/ext/devices.py:480`, `nanobot/ext/devices.py:679` |

## Tests

- `tests/ext/test_kanban.py`: claim → failure → claimed again; manual move frees the bot; restart with an open review run frees the reviewer; `reviewer_is_assignee` on create and update; the claim skips a legacy reviewer = assignee task.
- `tests/ext/test_kanban_dispatch.py`: reviewer text reply closes the run, counts a retry and is re-claimed; after max retries the task is blocked; a reviewer verdict inside the turn (approve → `done`, reject → `ready`, no retry counted); `turn_text_or_raise` on `error`, `tool_error`, normal and `None` responses; a reply starting with "Error: " is no longer a failure; `KanbanTurnFailed` fails the task.
- `tests/ext/test_devices.py`: a plain device can revoke itself; a plain device revoking another device gets 403 `full_power_required` and the target stays active.

## Results

- `.venv/bin/python -m pytest -p no:cacheprovider tests`: 8112 passed, 53 skipped, 7 failed, none in the touched areas. `tests/ext tests/cli`: 916 passed, 5 skipped.
- Failures from the README: `test_exec_rejects_home_path_without_home_directory`, `test_remote_pairing`, `test_channel_setup`.
- Failures not in the README: `tests/channels/test_scheduled_delivery.py::test_unavailable_adapter_does_not_report_success[telegram|slack|matrix]` and `tests/test_benchmark_session_storage.py::test_session_storage_benchmark_emits_auditable_windows_safe_result`. They also fail with my changes stashed. The first group fails on the missing optional Matrix dependency.
- `ruff check` and `basedpyright` on the touched files: no errors.

## Deviations and notes

- `create_task` (`save_task` on create) now reads `max_retries` from the body (default 2, bounds 0 to 20, 400 `invalid_retries`). The brief did not list this; the retry tests need it, and before it the column always used its default.
- `move_task` closes the open run as `cancelled` with an empty summary, not with the new task status.
- `move_task` does nothing when the status does not change.
- `is_failed_turn` still handles dict replies; only the text-prefix list was removed.
- `test_plain_device_cannot_revoke_another_device` overlaps case 1 of `test_revoke_route_requires_privileged`. It was added on request and also checks that the target stays active.
- Not verified: the structured `_stop_reason` path against a real provider failure (tested only with fake responses).
