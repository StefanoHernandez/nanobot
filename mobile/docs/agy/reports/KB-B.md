# KB-B report

Branch `grok/KB-B`, from `origin/main` (`e3bb91855`). Not merged.

## Files

- `nanobot/agent/tools/kanban_tools.py`
- `tests/ext/test_kanban_tools.py`
- `mobile/docs/agy/reports/KB-B.md`

`nanobot/ext/kanban.py` was not changed. `save_task`, `board_snapshot` and `list_bots` are reused. No new dependencies. `look-test/` was left untracked.

## Tool description

206 characters:

```
Kanban board: list cards, create or update a card for a bot (when = local ISO time, every = 30m/1h/1d/1w, start = run when ready); from a task run: complete / request review / verdict / block your own task.
```

## Checks

```
.venv/bin/python -m pytest -p no:cacheprovider tests/ext/
139 passed in 2.13s

.venv/bin/ruff check nanobot/agent/tools/kanban_tools.py nanobot/ext/kanban.py
All checks passed!

.venv/bin/basedpyright nanobot/agent/tools/kanban_tools.py nanobot/ext/kanban.py
0 errors, 0 warnings, 0 notes
```

`tests/ext/test_kanban_tools.py`: 11 passed, including the previous four.

## What the tool does

- Actions are `show`, `list`, `create`, `update`, `complete`, `request_review`, `verdict`, `block`. Still one tool.
- `required` is only `action`. `list` and `create` do not need `task_id`. The other actions still say `task_id is required`.
- `list` returns the board title, `{id, name}` bots, and non-archived cards with id, title, status, priority, assignee, schedule and repeat.
- `create` / `update` accept a bot id or name, a local ISO `when`, `every` as `30m`/`1h`/`1d`/`1w`, and `start`.
- `start: true` sets `ready` and refuses with `needs_bot` when no bot is assigned. An unknown bot returns `unknown_bot` plus the names.
- `when: ""`, `every: ""`, `bot: ""` and `reviewer: ""` clear those fields. Other omitted fields stay as they are.
- A `kanban:*` session, including a wake, cannot `create` or `update` (`not_from_a_run`). `show`, `list` and the run actions are unchanged.

## Deviations

- The schema helper already uses the keyword `description` for the object blurb, so the card's `description` parameter is added to the properties immediately after that object is built. The parameter name is still `description`.
- `update` does not move a card to another board. `save_task` ignores `board_id` on an existing card, and that path was left alone.
