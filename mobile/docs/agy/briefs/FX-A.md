# FX-A: server fixes from the external audit (owner: agy)

Branch `agy/FX-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires (full pytest: server files change). Fork files only (`nanobot/ext/*`); do not edit upstream files. Six agy sessions run in parallel this round: stay inside the files listed here.

## 1. Privileged mutations (security)
**Today:** `admin_authorized` (`nanobot/ext/devices.py:82`, and its copies) accepts the API token of **any** paired device. A phone without "full power" can therefore turn off the shell approval gate, revoke other devices, or restore a backup over the server.

**Change:** these routes also require `privileged_request(...)` (`devices.py:449`: a browser on the server itself, or a device granted full power). Build the `connection` argument the way `devices.py:623-624` already does for aiohttp requests (`SimpleNamespace(remote_address=(request.remote, 0))`). Answer `403 {"error":"full_power_required"}` otherwise.
- `POST /api/ext/approvals/settings` and `/forget` (`approvals.py:224-230`). **Not** `/decide`: approving from the phone is the point of the feature.
- `POST /api/ext/devices/revoke` (`devices.py:644`). `/full-power` is already local-browser only; leave it.
- `POST /api/ext/backup/settings`, `/delete`, `/restore` (`backup.py:323-331`). `/create` stays open to any authorized device.

Put the check in one helper (e.g. `require_privileged(request) -> web.Response | None` in `devices.py`) used by the three modules. Tests: each route returns 403 for a plain device token, succeeds for a full-power device and for a local browser.

## 2. Kanban
In `nanobot/ext/kanban.py` and `nanobot/ext/kanban_dispatch.py`:
1. **An LLM error is stored as "done".** `dispatch_once` (`kanban_dispatch.py:63-74`) completes a task that is still `running` with whatever the turn returned. When the provider fails, the turn returns error text instead of raising. Detect the failed turn (look at what `run_turn` / `submit_local_trigger_turn` returns on a provider error: an error flag, a finish reason, or a known prefix) and call `_fail_running_task` instead. Test with a fake `run_turn` that returns that failure shape.
2. **Review never starts.** `request_review` (`kanban.py:1010`) and `block_task` (`:1063`) leave the run row open: call `_finish_open_run` (`:943`). `_claim_one_ready_task_locked` (`:842`) only claims `status='ready'`, so a task in `review` with a `reviewer_bot_id` is never handed to the reviewer and `kanban(action="verdict")` is unreachable. Make the claim also pick `review` tasks that have a reviewer and no open run, and run them with the reviewer's bot and session key `kanban:<task>:<reviewer>`. Read how `kanban_tools.py:82-95` expects the reviewer session before you change it. Tests: request_review closes the run; a review task is claimed for the reviewer; a verdict moves it to done / back to ready.
3. **Manual move to done** (`move_task`, `:684`) does not call `_promote_ready_children` (`:788`): children stay in `todo`. Call it. Test.

## 3. Request body limit
`automations.py:126` and `journal.py:501` read the body with no limit. Use the same pattern as `devices.py:512-514` (`MAX_JSON_BODY_BYTES`, 413 when larger). Test one oversized body per route.

## Checks
- `.venv/bin/python -m pytest -p no:cacheprovider tests` (known failures in the README).
- `.venv/bin/ruff check` and `.venv/bin/basedpyright` on the touched files.

## Do not
- Edit upstream files, `mobile/**` (no app change is needed), or `mobile/vendor/**`. Add dependencies.

## Report
`mobile/docs/agy/reports/FX-A.md`: files, tests, the failure shape you found for item 2.1, deviations. Say whether a phone needs full power for anything it could do before (the app may show a new 403).

Commit, push `agy/FX-A`, and give the last hash. Do not merge.
