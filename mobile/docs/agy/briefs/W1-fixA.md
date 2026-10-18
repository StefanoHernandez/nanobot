# W1-fixA: kanban run lifecycle, failed turns, body reads (owner: agy)

Branch `agy/W1-fixA`, from `origin/claude/wave1-review` (wave 1 already merged there, plus the app review fixes), **in your own worktree**. Follow `mobile/docs/agy/README.md` (full pytest: server files change). Another agy works on `W1-fixB` in parallel: stay in `nanobot/ext/kanban*.py`, `nanobot/agent/tools/kanban_tools.py`, `nanobot/ext/devices.py`, `nanobot/ext/automations.py`, `nanobot/ext/journal.py`, the kanban adapter in `nanobot/cli/gateway_runtime.py` and their tests.

These come from the review of FX-A. Items 1 and 2 were reproduced: after them a bot stops taking tasks forever.

## 1. Open runs leak (HIGH)
Bot capacity now counts open `task_runs` (`finished_at_ms IS NULL`, `kanban.py` ~916). Some paths move a task without closing its run, so a bot with `max_concurrent=1` is "full" forever:
- `record_failure` (~1148): the retry branch puts the task back to `ready` and leaves the run open. Close it (`_finish_open_run(..., status="failed", error=...)`) in **every** branch.
- `move_task`: close any open run when the status changes by hand.
- `recover_interrupted` (~1316): also handle `review` tasks with an open run.
- Tests: claim → failure → the task is claimed again; manual move frees the bot; restart with an open review run frees it.

## 2. Reviewer turn that never ends (HIGH)
After a review claim the task stays `review`. If the reviewer answers in text without `kanban(action="verdict")`, or the turn fails, nothing closes the run (`kanban_dispatch.py` ~103, ~145: only `running` is handled).
- Send a **review footer** for review turns that asks for `kanban(action="verdict", approved, feedback)` (today `_TASK_FOOTER` only offers complete / request_review / block), and say it in `_build_context_content`.
- After a review turn (normal, failed or exception): if the task is still `review` with an open run for that reviewer, close the run as failed and count a retry; after `max_retries` block the task with a clear reason.
- Tests: reviewer replies in text → run closed, retry counted, re-claimed; after max retries → blocked; verdict path unchanged.

## 3. Reviewer = assignee (MED)
A task with `reviewer_bot_id == assignee_bot_id` is claimed for review but `_guard` in `kanban_tools.py` rejects its `verdict` (`not_reviewer`). Reject that combination in `save_task` (400 `reviewer_is_assignee`) and skip it in the claim. Test.

## 4. Failed turn detection (MED)
`is_failed_turn` guesses from text prefixes: it misses the real provider messages and custom `error_message`, and fails real results that start with "Error: ". The structured signal exists: `OutboundMessage.metadata["_stop_reason"]` is `"error"` (set in `agent/loop.py` ~2395, read in `turn_delivery.py` ~328). In `_kanban_run_turn` (`gateway_runtime.py` ~1006) raise a small `KanbanTurnFailed` (defined in `kanban_dispatch.py`) when `_stop_reason` is `"error"` or `"tool_error"`; drop the prefix list. The existing `except` path fails the task. Keep the upstream-file change to those few lines with a `# Fork:` comment. Test with a fake response carrying the metadata.

## 5. Revoke own device (behaviour)
FX-A gated `/api/ext/devices/revoke` with full power. A phone must still be able to revoke **itself** (unpair). Allow the call without full power when the target id is the caller's own device; any other id still needs full power. Tests both ways.

## Checks
- `.venv/bin/python -m pytest -p no:cacheprovider tests` (known failures in the README).
- `.venv/bin/ruff check` and `.venv/bin/basedpyright` on the touched files.

## Do not
- Touch `mobile/**`, `nanobot/ext/search.py`, `skill_proposals.py`, `model_info.py`. Add dependencies.

## Report
`mobile/docs/agy/reports/W1-fixA.md`: files, tests, deviations.

Commit, push `agy/W1-fixA`, and give the last hash. Do not merge.
