# KB-A: Kanban, the app matches the server (owner: Grok)

Branch `grok/KB-A`, from `origin/main`. Follow `mobile/docs/agy/README.md` (read "agy" as you): no rebase, one branch, a report at the end.

## Goal
The user wants the phone to do **everything the server Kanban can do**.

Today the screen `src/screens/ecosystem/kanban/KanbanScreen.tsx` falls short:
- it creates a card with a title only;
- it can change the status and approve a review;
- it can edit bots (name, icon, prompt).

Everything else the server API offers is missing. You can't pick a bot or a reviewer, or set a date or a repeat. So a card made on the phone **never runs**: the dispatcher only takes cards in `ready` **with** `assignee_bot_id`.

Server code: `nanobot/ext/kanban.py`. Read `save_task`, `_update_task`, `get_task_detail`, `board_snapshot` and the routes at the bottom of the file.

## Part 1: server (Python, `nanobot/ext/kanban.py` only)
These are fork files. You may edit them. Do not touch upstream files.

1. **A recurring card never runs again (bug).**
   - What happens: `complete_task` puts a recurring card back in `todo` with `scheduled_at_ms`. Nothing ever moves `todo` → `ready`, so the card stops after one run.
   - Fix: requeue it to **`ready`**. `claim_ready_tasks` already skips cards whose `scheduled_at_ms` is in the future.
   - Update `tests/ext/test_kanban.py::test_recurrence_every_requeues_todo`: rename it to `..._requeues_ready` and assert `ready`.
   - Add one test: a recurring card that was requeued is **not** claimed before `scheduled_at_ms` and **is** claimed after.
2. **`scheduled_at_ms` can be set from `tasks/save`** (create and update).
   - Accepted values:
     - `null` or missing: start as soon as possible;
     - otherwise an int, not a bool, with `0 <= v <= now + 366 days`.
   - Anything else returns `400 invalid_scheduled_at`.
   - Put the check in one helper next to `_recurrence`.
   - For the INSERT, add the column to the column list.
   - For the update, follow the `recurrence_expr` pattern: only when the key is present.
   - Tests: create and update with a date; a bad type and a date too far away each give 400.
3. Run, from the repo root:
   - `.venv/bin/python -m pytest -p no:cacheprovider tests/ext/test_kanban.py`
   - `.venv/bin/ruff check nanobot/ext/kanban.py`
   - `.venv/bin/basedpyright nanobot/ext/kanban.py`

   Never run `ruff format`.

## Part 2: client (`src/ecosystem/kanban.ts`)
- **`KanbanTask`:** add the fields below and parse them in `normalizeKanban` with safe defaults, as the existing fields do:
  - `reviewer_bot_id: string|null`;
  - `workspace_mode: "scratch"|"worktree"|"dir"`, default `scratch`;
  - `recurrence_expr: string`;
  - `scheduled_at_ms: number|null`;
  - `max_retries: number`;
  - `retries: number`;
  - `summary: string`;
  - `review_feedback: string`;
  - `blocked_reason: string`;
  - `artifacts: string[]`.
- **`links`:** parse `{parent_id, child_id}` instead of returning `[]`.
- **`boards`:** normalize them to `{id, title}`.
- **`SaveKanbanTaskInput`:** add `id?`, `status?`, `reviewer_bot_id?`, `workspace_mode?`, `recurrence_expr?` (`""` = no repeat), `scheduled_at_ms?: number|null`, `max_retries?` and `parent_ids?: string[]`.
- **New functions:**
  - `deleteKanbanTask(session, id)`, using `tasks/delete`;
  - `createKanbanBoard(session, {title, description?, max_concurrent?})`, using `boards/create`;
  - `fetchKanbanTask(session, id)`, using `GET /api/ext/kanban/task?id=`. It returns `{task, parents, children, runs, messages}`, normalized: runs as `{id, bot_id, status, summary, error, started_at_ms, finished_at_ms}`, messages as `KanbanMessage`;
  - `postKanbanMessage`: add an optional `taskId` and send it as `task_id`.
- **`postKanban`:** when `!res.ok`, read `{"error"}` and throw an Error with `.status` and `.code`. The screen uses it for the toasts.
- **Repeat helpers**, to keep the UI simple:
  - `recurrenceToExpr(n, unit)` takes `unit` = `minutes|hours|days`. It returns `every:<seconds>s`, clamped to the server limits of 60 to 2,592,000 seconds;
  - `exprToRecurrence(expr)` does the opposite and returns `null` when `expr` is empty.

  Test both, including the bounds.

## Part 3: UI (`KanbanScreen.tsx`)
Split the screen if it grows past ~800 lines. For example, move the task editor to `kanban/TaskEditorSheet.tsx`. Use `Sheet`, not `Dialog`: the form is long. Use `th.surface` / `th.bezel` and the existing components (`TextField`, `Chips`, `Button`, `Dialog` for confirmations).

### 3a. Card editor, the same one for "new" and "edit"
The `+` button opens it empty. Tapping a card opens it filled in.
- **Fields:**
  - Title.
  - Description, multiline.
  - Priority: Chips low/medium/high/urgent.
  - **Bot:** Chips with "Nessuno" plus one chip per bot (`icon name`).
  - **Reviewer:** Chips with "Nessuno" plus the bots. When set, a finished card goes to `review` first.
  - **When:** Chips "Appena possibile" / "Data e ora".
    - With "Data e ora", use `@react-native-community/datetimepicker`, as `src/screens/ecosystem/automations/AutomationJobSheet.tsx` does (date, then time on Android).
    - On web, use `<input type="datetime-local">` the way that sheet handles web, or follow the same pattern.
    - It saves `scheduled_at_ms`, or `null`.
  - **Repeat:** Chips "Mai" / "Ogni…".
    - With "Ogni…", show a number field and Chips minuti/ore/giorni.
    - Use `recurrenceToExpr`.
  - **Workspace:** Chips scratch/worktree/dir, labels `kanban.workspace.*`. Default scratch.
  - **Depends on:** a multi-select list of the other cards on the board (`parent_ids`). It is prefilled from `links` on edit.
  - Max retries: numeric, 0 to 20.
  - Status: the existing Chips. Keep them only on edit. On create, the status follows the button below.
- **Buttons:**
  - **"Avvia"** saves with `status: "ready"`. It is enabled only when a bot is chosen. With no bot, show the hint `kanban.needsBot`: "Scegli un bot per avviarla".
  - **"Salva in Da fare"** saves with `status: "todo"`, only for a new card. On edit it is a plain "Salva".
  - **"Elimina"**, destructive, on edit only. It asks for confirmation (`kanban.deleteTaskConfirm`).
- **Errors:** map `.code` to toasts. Cover at least `invalid_recurrence`, `invalid_scheduled_at`, `task_limit`, `dependency_cycle`, and any other code `_add_dependency_locked` raises (read it). Everything else gets `common.error`.
  - **Do not** set `phase="error"` on a failed save: that hides the whole board. Use a toast and keep the sheet open. Fix the existing handlers that do this too (move, review, bots, chat).

### 3b. Card detail, inside the editor when editing
Load it with `fetchKanbanTask` when the sheet opens. It shows:
- `summary` and `artifacts`, when present;
- `blocked_reason` when blocked;
- `review_feedback`;
- runs: status, bot, start time, error, the latest last;
- the card's messages, with a field to write one (`postKanbanMessage` with `taskId`);
- approve / request changes, when `status === "review"`. This already exists: move it here.

### 3c. Board chips on the card
Next to the priority, show:
- the bot icon;
- 🕒 plus a short date when `scheduled_at_ms` is in the future;
- 🔁 when `recurrence_expr` is set;
- ⛔ when blocked.

Keep it on one or two lines.

### 3d. Several boards
- Above the columns, show Chips with the boards from the snapshot, plus a "+" that opens a Dialog: title, description, max concurrent tasks 1–20, using `createKanbanBoard`.
- Switching board means `setBoardId`, which reloads.

### 3e. Bots
In the bot dialog, add:
- `model_preset`: free text, empty = default;
- `max_concurrent`: 1–20.

They are already in `SaveKanbanBotInput`.

## i18n
Add every new key in `it` and `en`. Short Italian copy. Example: "Avvia" / "Start", "Appena possibile" / "As soon as possible", "Ripeti" / "Repeat", "Dipende da" / "Depends on".

## Tests (jest, `mobile/test/...`)
- `kanban.ts`: normalizing the new fields, links and boards; `recurrenceToExpr`/`exprToRecurrence`; `postKanban` throws `.code`.
- Screen:
  - "Avvia" sends `status:"ready"` with `assignee_bot_id`;
  - "Avvia" is disabled with no bot;
  - editing sends `id` and `parent_ids`;
  - deleting asks for confirmation and then calls `tasks/delete`;
  - a failed save shows a toast and the board stays visible.

  Mock `fetch` / the session the way the existing kanban tests do.
- Run: `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`. **Both must pass.** Check the jest output before you commit.

## Do not
- Edit `mobile/vendor/**`.
- Add new dependencies.
- Touch upstream server files (outside `nanobot/ext/` and `tests/ext/`).
- Add creating cards from the chat. That is the next brief (KB-B).

## Report
`mobile/docs/agy/reports/KB-A.md` with:
- the files you touched;
- the test results (numbers);
- what you skipped and why.
