# W2-sec-fix1: review fixes (owner: agy)

Same branch `agy/W2-sec`, same worktree. Follow `mobile/docs/agy/README.md` (full pytest). Do not merge `main`, do not rebase.

## 1. Long commands denied with approvals OFF (MED, regression)
`ApprovalGate.request` checks `len(summary) > MAX_SUMMARY` before the `enabled`/allow-list shortcut: with approvals off (the default) every exec/exec_session/run_cli_app over 8000 chars is denied with "denied on your phone". Move the length check after the shortcut (only when the user would actually be asked). Test: approvals off + 9000-char command → allowed; on → denied without asking.

## 2. Writes still follow symlinks (HIGH)
The fix covers reads only. `journal.write_day` (and the journal settings write), `skill_proposals.write_proposal`, `activate_proposal` (target dir, `SKILL.md`, `.bak`) still write through agent-made symlinks: `memory/journal/2026-10-19.md -> ~/.nanobot/config.json` + "scrivi oggi" overwrites the config.
- Add one helper next to `safe_workspace_file` for writes: refuse when the target or any parent below the root is a symlink or resolves outside the root; write to a temp file in the same dir and `os.replace` it (replace swaps a link instead of following it). Use it for every ext write under the workspace listed above (grep `write_text`, `copy2`, `open(` in `nanobot/ext/journal.py`, `skill_proposals.py`).
- Tests: symlinked journal file + write_day → target outside untouched, error/False returned; symlinked proposal dir or active skill dir → activate refuses; symlinked `memory/journal` directory → nothing read or written.

## 3. Read race (MED)
`safe_workspace_file` checks then the caller reads: a swap in between is possible. Add `read_workspace_text(root, path) -> str | None` that opens with `os.O_NOFOLLOW` (where available; on Windows keep today's check), verifies with `fstat` that it is a regular file, and reads from the fd. Use it in the callers that read text (search, journal, memory_pages, skill_proposals).

## 4. Agent edits of a card the user started (MED)
On a card in `ready` (or `running`/`review`), the agent can still change `description`, `bot`, `when`, `every`: injected instructions then run unattended. From the agent tool, any such edit on a `ready` card moves it back to `todo` (and says so in the result); on `running`/`review` refuse it (`already_working`). Title/priority edits stay allowed. Tests.

## 5. Approvals file (LOW)
- `_load`: only a **missing** path (`not path.exists() and not path.is_symlink()`) gives the default; a directory, a dangling symlink or a permission error → `enabled: True`.
- Remove the `tempfile.gettempdir()` fallback in `approvals_file_path` (a world-writable dir); if `Path.home()` fails, raise.
- `run_cli_app` summary: add `(cwd: …)` like exec.

## 6. `settings_api.py` default (LOW)
Put the `local_browser` default back to `False`; pass `True` where a caller/test needs it.

## 7. Tests (LOW)
- Approval tests assert the summary contains the full input.
- Settings: one case for `gateway.port` and one list-valued path.
- Journal: assert `list_sessions()` unchanged after `collect_day`; avoid the private `_store` if a public way exists.
- Kanban connection test: count `_connect()` calls vs closes through a patch, as the first brief said.
- Report: say that `memory_pages` now rejects symlinks inside the workspace (behaviour change).

## Checks, Do not, Report
As in `W2-sec.md`. Append a "fix1" section to `mobile/docs/agy/reports/W2-sec.md`. Commit (no `Co-Authored-By`), push `agy/W2-sec`, give the last hash.
