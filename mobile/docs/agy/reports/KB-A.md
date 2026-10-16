# KB-A report

Branch `grok/KB-A`, from `origin/main` (`1e2a92e66`). Not merged.

## Files

- `nanobot/ext/kanban.py`
- `tests/ext/test_kanban.py`
- `mobile/src/ecosystem/kanban.ts`
- `mobile/src/screens/ecosystem/kanban/KanbanScreen.tsx`
- `mobile/src/screens/ecosystem/kanban/TaskEditorSheet.tsx` (new)
- `mobile/src/i18n/it.json`
- `mobile/src/i18n/en.json`
- `mobile/test/ecosystem/kanban.test.ts` (new)
- `mobile/test/screens/kanban-board.test.tsx`
- `mobile/docs/agy/reports/KB-A.md`

No new dependencies. `mobile/vendor/**` was not edited. `look-test/` was left untracked.

## Checks

Server, from the repo root:

```
.venv/bin/python -m pytest -p no:cacheprovider tests/ext/test_kanban.py
14 passed in 0.52s

.venv/bin/ruff check nanobot/ext/kanban.py
All checks passed!

.venv/bin/basedpyright nanobot/ext/kanban.py
0 errors, 0 warnings, 0 notes
```

App, from `mobile/` with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`:

```
npx jest --no-coverage
Test Suites: 108 passed, 108 total
Tests:       889 passed, 889 total
Snapshots:   0 total
Time:        9.557 s
Ran all test suites.
```

Jest also printed, without failing a test: `A worker process has failed to exit gracefully and has been force exited.` The kanban screen test clears the snackbar timer in `afterEach`. The suite exit code was 0.

```
npx tsc --noEmit --pretty false
```

tsc printed nothing and exited 0.

TDD: the four new server tests failed first (`todo` instead of `ready`, `scheduled_at_ms` ignored, a bool and a far date accepted). They passed after the store change.

## Brief items

| Item | Where |
|---|---|
| Repeating card is set back to `ready`, not `todo` | `nanobot/ext/kanban.py:977` |
| Claim still skips a future `scheduled_at_ms` | `nanobot/ext/kanban.py:864` (unchanged). Test: `tests/ext/test_kanban.py:183` |
| Renamed recurrence test asserts `ready` | `tests/ext/test_kanban.py:166` |
| `_scheduled_at`: null, not a bool, `0 .. now+366 days`, else 400 `invalid_scheduled_at` | `nanobot/ext/kanban.py:108` |
| Create writes `scheduled_at_ms` | `nanobot/ext/kanban.py:582` |
| Update writes it only when the key is present | `nanobot/ext/kanban.py:648` |
| Create/update/bool/too-far tests | `tests/ext/test_kanban.py:199` and `:212` |
| Task fields with safe defaults | `mobile/src/ecosystem/kanban.ts:169` |
| Links `{parent_id, child_id}` | `mobile/src/ecosystem/kanban.ts:260` |
| Boards `{id, title}` | `mobile/src/ecosystem/kanban.ts:250` |
| `SaveKanbanTaskInput` extra fields | `mobile/src/ecosystem/kanban.ts:350` |
| `deleteKanbanTask` | `mobile/src/ecosystem/kanban.ts:385` |
| `createKanbanBoard` | `mobile/src/ecosystem/kanban.ts:389` |
| `fetchKanbanTask` | `mobile/src/ecosystem/kanban.ts:310` |
| `postKanbanMessage` optional `task_id` | `mobile/src/ecosystem/kanban.ts:412` |
| POST error has `.status` and `.code` | `mobile/src/ecosystem/kanban.ts:333`. Test: `mobile/test/ecosystem/kanban.test.ts:113` |
| `recurrenceToExpr` / `exprToRecurrence`, clamped 60..2592000 | `mobile/src/ecosystem/kanban.ts:133` and `:139`. Test: `mobile/test/ecosystem/kanban.test.ts:102` |
| One editor for new and existing cards, Sheet not Dialog | `mobile/src/screens/ecosystem/kanban/TaskEditorSheet.tsx:87` |
| Title, description, priority, bot, reviewer, when, repeat, workspace, depends on, retries | `TaskEditorSheet.tsx:294`–`404` |
| Date then time on Android; `datetime-local` on web | `TaskEditorSheet.tsx:57` and `:319` |
| Avvia sends `ready`, disabled without a bot, hint | `TaskEditorSheet.tsx:433`. Tests: `kanban-board.test.tsx:276` and `:309` |
| Salva in Da fare only for a new card; edit is Salva | `TaskEditorSheet.tsx:438` |
| Elimina confirms, then `tasks/delete` | `TaskEditorSheet.tsx:444`. Test: `kanban-board.test.tsx:369` |
| Edit sends `id` and `parent_ids` | `TaskEditorSheet.tsx:185`. Test: `kanban-board.test.tsx:331` |
| Failed save toasts and leaves the board up | `TaskEditorSheet.tsx:198`, `KanbanScreen.tsx:135`. Test: `kanban-board.test.tsx:399` |
| Error codes, including `cycle` as the dependency toast | `mobile/src/ecosystem/kanban.ts:427` |
| Detail: summary, artifacts, blocked reason, review note, runs, messages | `TaskEditorSheet.tsx:384` |
| Approve / request changes stay on a review card | `TaskEditorSheet.tsx:418` |
| Card chips: bot icon, future clock, repeat, blocked | `KanbanScreen.tsx:346` |
| Board chips and new-board dialog | `KanbanScreen.tsx:298` and `:562` |
| Bot model and max concurrent | `KanbanScreen.tsx:189` and `:611` |
| Columns and cards use `th.bezel` / `th.surface` | `KanbanScreen.tsx:325` and `:355` |
| Italian and English strings | `mobile/src/i18n/it.json:713`, `mobile/src/i18n/en.json:713` |

## Deviations

- The server keeps the error code `cycle`. The phone maps both `cycle` and `dependency_cycle` to `kanban.error.dependency_cycle`. The code was not renamed, because existing tests expect `cycle`.
- The far-date test uses 367 days, not 366 days plus 1 ms. The limit is measured from the clock inside `save_task`, which is a few milliseconds after the test reads the clock, so 366 days plus 1 ms can still be inside the window.
- A failed task-detail load leaves the editor open and does not toast. The form still saves. A toast there looked like a save failure and hid nothing useful.
- Archived cards are left out of "Depends on". They are already hidden on the board.
- `AutomationJobSheet` has no web date input. The web branch is a `datetime-local` input, as the brief allows.
- Status chips still move the card immediately, which is what the existing screen test expects. Avvia and Salva send the status on save.

## Not verified

Not run on a phone or an emulator. The web date input was not opened in a browser. No new APK.
