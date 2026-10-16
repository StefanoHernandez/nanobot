# KB-B: create and manage Kanban cards from the chat (owner: Grok)

Branch `grok/KB-B`, from `origin/main`. Follow `mobile/docs/agy/README.md`: no rebase, one branch, a report at the end. Ignore `look-test/`, and add files by path only.

## Goal
In a normal chat (app, WebUI, Telegram…), the user writes:
- "metti in lavagna per il researcher, domani alle 9: cerca offerte NAS";
- "cosa c'è in lavagna?";
- "sposta la scheda dei NAS a venerdì e falla ripetere ogni settimana".

nanobot does it with the `kanban` tool that already exists. No app UI work is needed: the app already shows the cards (KB-A).

## Where
- Tool: `nanobot/agent/tools/kanban_tools.py`. It is a fork file; only the actions change.
- Store: `nanobot/ext/kanban.py`. Reuse `save_task`, `board_snapshot` and `list_bots`. **Do not** duplicate validation.
- Tests: `tests/ext/test_kanban_tools.py`. Reuse the existing `store` fixture and `_as`.

## The design (keep it one tool)
The file explains why there is one tool: "every tool schema rides in every prompt". So **add actions to the same tool**, not new tools, and keep the new schema text short.

### New actions
`ACTIONS` becomes `("show", "list", "create", "update", "complete", "request_review", "verdict", "block")`.

1. **`list`**: an overview of a board.
   - Parameter: `board_id`, optional, default `main`.
   - It returns compact JSON:
     - `board`: `{id, title}`;
     - `bots`: `[{id, name}]`;
     - `tasks`: `[{id, title, status, priority, assignee_bot_id, scheduled_at_ms, recurrence_expr}]`.

     Leave out archived cards, descriptions and messages: keep it small.
   - `task_id` is **not** required for `list` and `create`. Make the `required` list `["action"]` and check `task_id` yourself in the actions that need it. Keep the existing error text "task_id is required".
2. **`create`**: a new card. Parameters:
   - `title` (required);
   - `description`;
   - `board_id` (default `main`);
   - `priority`;
   - `bot`: a bot **id or name**, case-insensitive. Resolve it with `list_bots()`. An unknown bot gives `kanban error: unknown_bot` plus the list of valid names;
   - `reviewer`: same as `bot`;
   - `when`: an ISO 8601 date-time;
   - `every`;
   - `start`: boolean.
3. **`update`**: change an existing card (`task_id` is required). It takes the same optional fields as `create`, plus `status`.
   - Only the fields that are passed change.
   - `when: ""` clears the date. `every: ""` clears the repeat.
   - `bot: ""` and `reviewer: ""` clear them.

### Field conversions (one small helper each, with tests)
- **`when` → `scheduled_at_ms`.** Use `datetime.fromisoformat`.
  - With no offset, the time is **local server time**: use `.astimezone()` on the naive value.
  - Bad text gives `kanban error: invalid_when`.
  - The model knows the current date and time from the system prompt. Say in the description that `when` is local time, ISO format.
- **`every` → `recurrence_expr`.** Accept `<N>m`, `<N>h`, `<N>d`, `<N>w` (for example `30m`, `1d`, `1w`) and convert to `every:<seconds>s`. The store validates the 60 s to 30 days range: let its `invalid_recurrence` come through.
- **`start`.**
  - `start: true` sets `status: "ready"`.
  - Without it, a new card is `todo`.
  - `start: true` with no bot gives `kanban error: needs_bot`. Without a bot a card never runs: this is the KB-A rule.
  - The claim query already waits for `when` and for parent cards.

### Who may do what
- **The user's sessions** (every session that is **not** `kanban:*`) may use `list`, `create`, `update` and `show`.
- **Kanban run sessions** (`kanban:<task>:<bot>`, and `kanban:wake:*`) may **not** use `create` or `update`: return `kanban error: not_from_a_run`. A bot must not be able to fill the board, or change other cards, from inside a run. Their existing actions stay as they are.
- There is **no** delete from the chat: deleting is done in the app. Do not add it.
- The existing guards (`_guard`, `not_your_task`, `not_reviewer`) do not change.

### Description and schema
- Keep `description` to one or two sentences. For example: "Kanban board: list cards, create or update a card for a bot (when = local ISO time, every = 30m/1h/1d/1w, start = run when ready); from a task run: complete / request review / verdict / block your own task."
- Each new parameter gets a description of a few words.

## Tests (`tests/ext/test_kanban_tools.py`)
- `create` from `websocket:abc`:
  - with `bot="Coder"` (by name), `when` and `every="1d"`, it saves `assignee_bot_id="coder"`, the right `scheduled_at_ms` and `recurrence_expr="every:86400s"`, with status `todo`;
  - with `start=True`, the status is `ready`.
- `start=True` without a bot gives `needs_bot`. An unknown bot gives `unknown_bot`.
- `update` changes only the fields passed. `when=""` sets `scheduled_at_ms` back to `None`.
- `list` leaves out archived cards and has `bots`.
- `create` and `update` from `kanban:t1:coder` give `not_from_a_run`.
- `list` and `create` work without `task_id`. `complete` without `task_id` still says "task_id is required".
- The existing tests stay green.

## Checks
From the repo root:
- `.venv/bin/python -m pytest -p no:cacheprovider tests/ext/`
- `.venv/bin/ruff check nanobot/agent/tools/kanban_tools.py nanobot/ext/kanban.py`
- `.venv/bin/basedpyright nanobot/agent/tools/kanban_tools.py nanobot/ext/kanban.py`

Never run `ruff format`. Read the results yourself before committing.

## Do not
- Edit upstream files, `mobile/vendor/**`, or the app.
- Add new dependencies.
- Add a second tool.

## Report
`mobile/docs/agy/reports/KB-B.md` with:
- the files you touched;
- the test numbers;
- the final tool description text and its size in characters;
- any deviations.

Commit, push `grok/KB-B`, and give the last hash. Do not merge.
