# AU-A: "Nuova automazione" — create an automation from the app (owner: agy)

Branch `agy/AU-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires (full pytest, because server files change). Server changes go in **fork files only** (`nanobot/ext/*`); do not edit `nanobot/webui/ws_http.py` or other upstream files.

## Today
- The Automazioni screen (`mobile/src/screens/ecosystem/automations/AutomationsScreen.tsx`) lists, edits, runs, enables/disables and deletes jobs (`mobile/src/ecosystem/automations.ts`, `AutomationJobSheet.tsx`).
- **There is no way to create one from the app.** Jobs are created only by the agent's `cron` tool (`nanobot/agent/tools/cron.py:123-222`), which binds the job to the chat it was asked in.
- The server has no create route: the automation actions regex in `ws_http.py:1411` allows only `enable|disable|delete|run|update|change-chat`.

## 1. Server: `POST /api/ext/automations/create` (new `nanobot/ext/automations.py`)
- Copy the shape of `nanobot/ext/journal.py`: same auth (`admin_authorized` / router variant), same way of receiving `cron: CronService` from `nanobot/cli/gateway_runtime.py`, and register the route the same way the journal routes are registered.
- **Body:**
  ```json
  {"name": "Rassegna mattina", "message": "Riassumi le notizie su…", "schedule": {"kind": "cron", "expr": "0 8 * * *", "tz": "Europe/Rome"}, "session_key": "websocket:abc"}
  ```
  - `schedule.kind` is `"at" | "every" | "cron"` with `at_ms`, `every_ms` or `expr` + optional `tz`. Validate it the same way `_parse_automation_schedule` / `_validate_automation_schedule` in `ws_http.py` do: **import and reuse them** if they are importable functions; copy only if they are not.
  - `at` must be in the future and sets `delete_after_run`, as the `cron` tool does.
  - `every_ms` minimum 60 000 (one minute).
  - `message` is required and non-empty; `name` defaults to the first 40 characters of `message`.
  - `session_key` is the chat the job delivers to. It must be an existing, non-temporary websocket chat. Build the binding (`session_key`, `origin_channel`, `origin_chat_id`, `origin_metadata`) the way `AutomationChat.binding` in `nanobot/webui/automation_chats.py` does; reuse it.
- Call `cron.add_job(...)` and return the job in the same shape `/api/webui/automations` lists it, so the app can show it right away.
- **Errors:** `400 invalid_schedule`, `400 invalid_message`, `400 invalid_chat`, `401` unauthorized, `503` when cron is not available.
- **Tests** (`tests/ext/test_automations.py`): each schedule kind creates a job bound to the given chat; a past `at`, an `every` under a minute, an empty message, and an unknown chat are rejected; unauthorized is 401. **Tests must never read or write the real `~/.nanobot`**: use `tmp_path` and fakes.

## 2. App: the "Nuova automazione" sheet
- **Entry points:** a "+" `IconButton` in the Automazioni header (`AutomationsScreen.tsx:67-77`) and a "Nuova automazione" button in the empty state (lines 119-128).
- **The sheet** (new `NewAutomationSheet.tsx` next to `AutomationJobSheet.tsx`), top to bottom:
  1. **Cosa deve fare** — multiline text, required (this is the `message` the bot runs).
  2. **Nome** — optional; placeholder shows the auto name.
  3. **Quando** — `Chips`: "Ogni giorno", "Ogni N", "Una volta", "Avanzato".
     - *Ogni giorno*: a time picker (`@react-native-community/datetimepicker`, as in `AutomationJobSheet.tsx`) → `cron` `M H * * *`, tz = device timezone.
     - *Ogni N*: a number plus a unit chip (minuti / ore / giorni) → `every_ms`.
     - *Una volta*: date + time picker, future only → `at_ms`.
     - *Avanzato*: a cron expression field with a one-line example.
     - Reuse the schedule helpers in `AutomationJobSheet.tsx` if they can be shared; move them to a small shared module rather than copying.
  4. **Dove risponde** — default "Nuova chat" (the app creates a new chat first, titled with the automation name, the same way the drawer's "Nuova chat" does, and uses its key); or pick an existing chat from a list of the user's non-temporary chats (`chatsStore`).
  5. **Crea** button. On success: toast "Automazione creata", close the sheet, refresh the list. On error: show the server error under the button, keep the form.
- **A secondary link at the bottom:** "Oppure descrivila al bot". It opens a new chat and sends the text of field 1 with `intent: "create_automation"` (the vendored `sendMessage` already accepts it; the server adds `templates/agent/automation_creation.md`). This is what the upstream WebUI does; keep it as the fallback for complex requests.
- **i18n** `it` and `en` for every string.
- **Tests (jest):**
  - the header "+" opens the sheet;
  - each "Quando" option sends the right `schedule` (mock the session `post`);
  - "Nuova chat" creates a chat first and sends its key; picking a chat sends that key;
  - an empty "Cosa deve fare" disables Crea;
  - a server error is shown and the form is kept;
  - "Descrivila al bot" sends with `intent: "create_automation"`.

## Checks
- `.venv/bin/python -m pytest -p no:cacheprovider tests` (3 known failures, see README).
- `.venv/bin/ruff check` and `.venv/bin/basedpyright` on the touched Python files.
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`

## Do not
- Edit upstream server files (`nanobot/webui/*`, `nanobot/cron/*`, `nanobot/agent/*`) or `mobile/vendor/**`.
- Add dependencies. Import `@react-navigation/*`.

## Report
`mobile/docs/agy/reports/AU-A.md`: files, tests, deviations, and what needs the arduino or a phone to check.

Commit, push `agy/AU-A`, and give the last hash. Do not merge.
