# NT-A: phone notifications from the Kanban (owner: Grok)

Branch `grok/NT-A`, from `origin/main`. Follow `mobile/docs/agy/README.md`: no rebase, one branch, a report at the end. Ignore `look-test/`, and add files by path only.

## Goal
The phone notifies the user when a card:
- **finishes**, including each cycle of a repeating card;
- **fails**;
- **waits for their review**;
- **gets blocked**.

Tapping the notification opens that card in the Lavagna.

## How notifications work today (read these first)
There is no push service: the app **polls** the server and shows **local** notifications.
- `mobile/src/extras/approvals.ts` polls with `usePolling({ background: true })` from `app/(main)/_layout.tsx`. It shows a notification only when the app is not active, and dedupes with a `Set`. Copy that pattern.
- `mobile/src/extras/notifications.ts` holds the channel `CHANNEL` and `keyOfResponse`.
- `app/NativeIntegrations.tsx` handles the tap. Today it only opens chats (`data.key`).
- `mobile/src/extras/costs.ts` shows one notification per key, with a `kv` marker.

## Part 1: server (`nanobot/ext/kanban.py`, fork file)
New route `GET /api/ext/kanban/events?since=<ms>`.
- Use the same auth as `GET /api/ext/kanban`, added in `dispatch_kanban_get`.
- It returns `{"now": <server ms>, "events": [...]}`, oldest first, at most 50.
- Each event is `{key, kind, task_id, board_id, title}`, with `kind` one of `done`, `failed`, `review`, `blocked`.
- Where the events come from:
  - `task_runs` rows with `finished_at_ms > since` and status `done` or `failed`. The key is `run:<run id>`. This also catches repeating cards, whose task status goes back to `ready`;
  - `tasks` in `review` or `blocked` with `updated_at_ms > since`. The key is `<kind>:<task id>:<updated_at_ms>`.

  Read `request_review` and `block_task`. If they already close the run with their own status, take those from `task_runs` instead and do not count them twice. Say in the report which path you used.
- A missing or bad `since` gives `400 invalid_since`.
- A store method `events_since(since_ms)` does the SQL. The route only parses and serializes.
- **Tests** in `tests/ext/test_kanban.py`:
  - a completed run gives `done`;
  - a repeating card gives `done` each cycle;
  - a review gives `review` once;
  - a blocked card gives `blocked`;
  - `since` filters;
  - the 50 limit;
  - a bad `since` gives 400.

## Part 2: app
- **`src/ecosystem/kanban.ts`:** add `fetchKanbanEvents(session, since)` and normalize the response, dropping bad rows.
- **New `src/extras/kanbanNotify.ts`.**
  - It exports `useKanbanNotifications()` and is mounted in `app/(main)/_layout.tsx` next to `useApprovalsPolling()`.
  - It polls every 60 s with `usePolling({ background: true })` while the session is open.
  - **Cursor:**
    - keep `since` in `kv`, one per profile: `kanban.since.<profileId>`;
    - on the first run with no cursor, **only** store `now`. Do not notify old events;
    - after each poll, store the returned `now`. Use the server clock, never the phone clock;
    - dedupe on `key` with a bounded `Set` of the last 200 keys, for the current process.
  - **Showing it:**
    - when the app is **not** active, use `Notifications.scheduleNotificationAsync` on `CHANNEL`;
    - title: `kanban.notify.<kind>`, for example "Scheda completata", "Scheda fallita", "Da revisionare", "Scheda bloccata";
    - body: the card title;
    - `data: { kanbanTask: task_id, board: board_id }`.

    When the app **is** active, show a `toast` instead, only if the Kanban screen is not in front. Use the same "screen is in front" check that `costs.ts` uses, or the simplest equivalent.
  - **Preference:** "Notifiche lavagna", on by default, in `src/settings/prefs.ts`. Put the switch next to the existing notification settings. When it is off, nothing polls.
- **Tap:** in `app/NativeIntegrations.tsx`, when `data.kanbanTask` is set, open `/ecosystem/kanban?task=<id>&board=<board>`.
  - `KanbanScreen` reads these params with `useLocalSearchParams`, switches to that board, and opens the card editor (`TaskEditorSheet`) on that task after it loads.
  - An unknown id gives a quiet toast `common.error`.
  - The chat path (`data.key`) must keep working. Keep the two tap kinds in one small helper with a test.
- **Web:** `NativeIntegrations.web.tsx` and the web build have no local notifications. Do not mount the poller on web.

## Tests (jest)
- `kanbanNotify`:
  - the first poll stores the cursor and notifies nothing;
  - the next poll notifies only new keys;
  - the same key twice notifies once;
  - nothing polls when the pref is off;
  - foreground gives a toast, not a notification;
  - the cursor is per profile.
- Tap helper: `{key}` gives the chat path; `{kanbanTask, board}` gives the kanban path.
- `KanbanScreen` with `task` and `board` params opens that card.

## Checks
- `.venv/bin/python -m pytest -p no:cacheprovider tests/ext/test_kanban.py`
- `.venv/bin/ruff check nanobot/ext/kanban.py`
- `.venv/bin/basedpyright nanobot/ext/kanban.py`
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`

Never run `ruff format`. Read the results yourself before committing.

## Do not
- Add a push service (FCM).
- Add new dependencies.
- Edit upstream files or `mobile/vendor/**`.

## Report
`mobile/docs/agy/reports/NT-A.md` with:
- the files you touched;
- the test numbers;
- the event path you chose for review and blocked;
- any deviations.

Commit, push `grok/NT-A`, and give the last hash. Do not merge.
