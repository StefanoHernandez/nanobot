# NT-A report

Branch `grok/NT-A`, from `origin/main` (`ba4d19a06`). Not merged.

## Files

- `nanobot/ext/kanban.py` — `events_since` (`1110`), `_parse_since_ms` (`1318`), `GET /api/ext/kanban/events` (`1351`)
- `tests/ext/test_kanban.py` — 8 event tests (`367`–`483`)
- `mobile/src/ecosystem/kanban.ts` — `fetchKanbanEvents` (`355`)
- `mobile/src/extras/kanbanNotify.ts` — poller, cursor, dedupe
- `mobile/src/extras/notifications.ts` — `notificationTapPath` (`36`), `pathOfResponse` (`55`)
- `mobile/app/NativeIntegrations.tsx` — tap uses `pathOfResponse` (`14`)
- `mobile/app/(main)/_layout.tsx` — `useKanbanNotifications()` (`16`). Root `app/_layout.tsx` was not touched.
- `mobile/src/screens/ecosystem/kanban/KanbanScreen.tsx` — deep link opens `TaskEditorSheet` (`56`–`108`)
- `mobile/src/settings/prefs.ts` — `kanbanNotifications`, on unless `"0"`
- `mobile/src/screens/settings/AppearanceSection.tsx` — switch next to notification sound (`94`)
- `mobile/src/i18n/it.json`, `mobile/src/i18n/en.json`
- `mobile/test/extras/kanbanNotify.test.tsx`
- `mobile/test/screens/kanban-board.test.tsx` — params open the card (`502`)
- `mobile/test/screens/settings.test.tsx` — prefs mock
- `mobile/docs/agy/reports/NT-A.md`

No new dependencies. `mobile/vendor/**` was not edited. No upstream file outside `nanobot/ext/kanban.py`. `look-test/` was left untracked.

## Event path

`request_review` and `block_task` only update the task. They do not finish the open run.

- `done` and `failed` come from `task_runs` (`finished_at_ms > since`, key `run:<id>`). A repeating card emits one `done` per cycle because the task goes back to `ready`.
- `review` and `blocked` come from `tasks` (`updated_at_ms > since`, key `<kind>:<task id>:<updated_at_ms>`). One event, not also a run.
- `record_failure` at max retries finishes the run as `failed` and sets the task `blocked`. Both events are emitted. That is the only double signal, and it is two different kinds.

Oldest 50, then the route returns them. A missing or bad `since` is HTTP 400 `invalid_since`. `since=0` is valid.

## Checks

```
.venv/bin/python -m pytest -p no:cacheprovider tests/ext/test_kanban.py
23 passed in 0.54s

.venv/bin/ruff check nanobot/ext/kanban.py
All checks passed!

.venv/bin/basedpyright nanobot/ext/kanban.py
0 errors, 0 warnings, 0 notes

cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest
Test Suites: 109 passed, 109 total
Tests:       903 passed, 903 total

cd mobile && npx tsc --noEmit
(no output, exit 0)
```

Jest still prints `A worker process has failed to exit gracefully` at the end. Same line was already there before this task. Not chased.

## Deviations

- The poller subscribes to the board-notification pref. The main layout does not re-render when that switch changes, so without the subscription turning it back on would not start polling until the next session change.
- On web the hook is mounted (rules of hooks) but `enabled` is false, so it does not poll and does not schedule a notification. `NativeIntegrations.web.tsx` was not changed.
- Not verified on a phone or emulator.
