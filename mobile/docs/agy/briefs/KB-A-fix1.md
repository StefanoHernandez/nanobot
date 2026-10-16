# KB-A-fix1: review fixes (owner: Grok)

Apply these on the same branch, `grok/KB-A`. Do not create a new branch and do not rebase. Every check from KB-A must pass again.

## 1. A card with unfinished dependencies starts early (high)
- **What goes wrong:** "Avvia" saves a card as `ready` even when it depends on cards that are not `done` yet. `_claim_one_ready_task_locked` in `nanobot/ext/kanban.py`, the `SELECT ... status = 'ready'` query, never looks at `task_links`, so the bot starts it at once, before its parents finish.
- **Fix it at the root, in the claim query.** Add this condition:
  ```sql
  AND NOT EXISTS (
      SELECT 1 FROM task_links l JOIN tasks p ON p.id = l.parent_id
      WHERE l.child_id = tasks.id AND p.status != 'done'
  )
  ```
  - A `ready` card with open parents then waits.
  - It starts once every parent is `done`.
  - `_promote_ready_children` stays as it is.
- **Test** in `tests/ext/test_kanban.py`:
  - child `ready` + assigned, parent `todo`: `claim_ready_tasks` does not take the child;
  - after the parent is `done`: it does.

## 2. "Avvia" on a card that is already working (medium)
- **What goes wrong:** in `TaskEditorSheet.tsx`, "Avvia" on a card in `running` or `review` puts it back in `ready` mid-run.
- **Fix:** show "Avvia" only:
  - for a new card;
  - or when the status is `triage`, `todo`, `blocked` or `done`.

  In the other states, keep "Salva" only.
- **Test:** a `running` card has no "Avvia".

## 3. An invalid repeat value is silently turned into 1 minute (low)
- **What goes wrong:** with "Ogni…", the values `0`, `""`, `1.5` and `abc` become `every:60s` without telling the user (`Number(repeatAmount) || 0`, then the clamp).
- **Fix:**
  - accept only an integer of 1 or more;
  - otherwise disable "Avvia"/"Salva" and show the hint `kanban.repeatInvalid`, "Inserisci un numero intero" / "Enter a whole number";
  - when the value goes over the server limit of 30 days, show the same hint, instead of clamping it quietly.
- Keep `recurrenceToExpr` as it is for the bounds: the UI now checks first.

## 4. Jest: "A worker process has failed to exit gracefully"
- Find the handle left open:
  ```
  LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest test/screens/kanban-board.test.tsx --detectOpenHandles
  ```
  It is probably a timer, or an un-awaited `fetchKanbanTask`/`load` after unmount.
- Close it in the code, not with `forceExit`. If it does not come from KB-A (check with `git stash`), say so in the report and leave it.

## Report
Add a "fix1" section to `mobile/docs/agy/reports/KB-A.md` with:
- what changed;
- the new test numbers.

Then commit and push the branch. Do not merge.
