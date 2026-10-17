# AU-A report — "Nuova automazione" (create automation from app)

Branch `agy/AU-A`, from `origin/main`. Not merged.

## Files

### Server (Python)
- `nanobot/ext/automations.py` (created): implements `POST /api/ext/automations/create` with `admin_authorized` route handler, validating schedules via reused `ws_http` validation logic, checking future timestamp for `at` schedule (with `delete_after_run=True`), `every_ms >= 60_000`, non-empty message with fallback name, and resolving existing non-temporary WebSocket chat binding using `AutomationChat.binding` before adding the job to `cron` and returning the job payload.
- `nanobot/cli/gateway_runtime.py` (modified): registered automations routes with `register_automations_routes(channels, cron=cron, sessions=session_manager)`.
- `tests/ext/test_automations.py` (created): comprehensive pytest suite covering all schedule kinds (`at`, `every`, `cron`), default 40-character name, errors (`400 invalid_schedule` for past `at` or `every` < 60s, `400 invalid_message` for empty string, `400 invalid_chat` for unknown/temporary chat, `401` unauthorized, `503` when cron service is missing), and route registration without touching real `~/.nanobot`.

### Client (React Native / Expo)
- `mobile/src/core/session.ts` (modified): added `post<T>(path: string, body?: unknown): Promise<T>` to `NanobotSession` with automatic 401 token refresh retry and error message unwrapping.
- `mobile/src/ecosystem/automations.ts` (modified): added `createAutomation`, `CreateAutomationPayload` type, and `create` action to `useAutomations` hook.
- `mobile/src/screens/ecosystem/automations/scheduleHelpers.ts` (created): extracted reusable schedule parsing/formatting helpers (`parseEveryMsToUnit`, `everyUnitToMs`, `formatAtLocal`, `formatAtSchedule`, `parseAtSchedule`, `formatEverySchedule`, `parseEverySchedule`).
- `mobile/src/screens/ecosystem/automations/AutomationJobSheet.tsx` (modified): imported and re-exported schedule helpers from `./scheduleHelpers`.
- `mobile/src/screens/ecosystem/automations/NewAutomationSheet.tsx` (created): the "Nuova automazione" bottom sheet:
  1. **Cosa deve fare**: multiline text input, required.
  2. **Nome**: optional text input, placeholder showing the first 40 chars auto-name.
  3. **Quando**: chip selector with 4 modes:
     - *Ogni giorno*: time picker (`@react-native-community/datetimepicker`) -> `cron M H * * *` with device timezone.
     - *Ogni N*: number input + unit chips (`minuti` / `ore` / `giorni`) -> `every_ms`.
     - *Una volta*: date & time pickers (future only) -> `at_ms`.
     - *Avanzato*: raw cron expression input with example placeholder.
  4. **Dove risponde**: chip selector between "Nuova chat" (calls `chatsStore.newChat`, renames chat to automation name, passes new session key) and "Chat esistente" (scrollable list of non-temporary chats from `chatsStore`).
  5. **Crea** button: disabled when message is empty; on success toasts "Automazione creata", closes sheet, refreshes job list; on server error displays error message below button without closing form.
  - Secondary button: "Oppure descrivila al bot" creates a new chat, sends message with `{ intent: "create_automation" }`, navigates to chat, and closes sheet.
- `mobile/src/screens/ecosystem/automations/AutomationsScreen.tsx` (modified): added header "+" `IconButton` and empty state "Nuova automazione" button to open `NewAutomationSheet`.
- `mobile/src/screens/ecosystem/automations/index.ts` (modified): re-exports `NewAutomationSheet` and `scheduleHelpers`.
- `mobile/src/i18n/it.json`, `mobile/src/i18n/en.json` (modified): localization strings for all new automation UI elements.
- `mobile/test/screens/new-automation.test.tsx` (created): 7 jest tests covering header "+", empty state button, disabled Crea button when message is empty, each "Quando" schedule kind posting correct payload, "Nuova chat" vs "Chat esistente" key selection, server error display, and "Descrivila al bot" intent.

## Dependencies

No new dependencies added. No `@react-navigation/*` imports added. `mobile/vendor/**` untouched.

## Checks

### 1. Pytest (Full Suite)
```
../nanobot/.venv/bin/python -m pytest -p no:cacheprovider tests
================ 7884 passed, 3 failed, 53 warnings in 83.15s ================
```
(The 3 failed tests are the known PC-specific failures documented in `mobile/docs/agy/README.md`: `test_channel_setup`, `test_remote_pairing`, and `test_exec_rejects_home_path`).

### 2. Ruff & Basedpyright
```
../nanobot/.venv/bin/ruff check nanobot/ext/automations.py nanobot/cli/gateway_runtime.py tests/ext/test_automations.py
All checks passed!

../nanobot/.venv/bin/basedpyright --pythonpath ../nanobot/.venv/bin/python nanobot/ext/automations.py nanobot/cli/gateway_runtime.py tests/ext/test_automations.py
0 errors, 0 warnings, 0 notes
```

### 3. Jest (Full Suite & New Screen Tests)
```
cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest test/screens/new-automation.test.tsx
PASS test/screens/new-automation.test.tsx
  AU-A: NewAutomationSheet & AutomationsScreen
    ✓ the header '+' opens the sheet (377 ms)
    ✓ the empty state 'Nuova automazione' button opens the sheet (26 ms)
    ✓ an empty 'Cosa deve fare' disables Crea (25 ms)
    ✓ each 'Quando' option sends the right schedule (mock the session post) (73 ms)
    ✓ 'Nuova chat' creates a chat first and sends its key; picking a chat sends that key (30 ms)
    ✓ a server error is shown and the form is kept (21 ms)
    ✓ 'Descrivila al bot' sends with intent: 'create_automation' (17 ms)

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total

cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest
Test Suites: 127 passed, 127 total
Tests:       1012 passed, 1012 total
Snapshots:   0 total
Time:        22.117 s
Ran all test suites.
```

### 4. TypeScript Typecheck
```
cd mobile && npx tsc --noEmit
(exit 0, clean, 0 errors)
```

### 5. Expo Export (Android)
```
cd mobile && EXPO_NO_TELEMETRY=1 npx expo export --platform android --output-dir /tmp/nb-export
Android Bundled 13978ms index.js (2541 modules)
› android bundles (1):
_expo/static/js/android/index-53571de3553d54e1aba28cdafe45d56c.hbc (7.9MB)
Exported: /tmp/nb-export
(exit 0)
```

## Deviations

- Added `post<T>` to `NanobotSession` in `mobile/src/core/session.ts` so `NewAutomationSheet` and `createAutomation` can call `session.post` matching the test mock specification in the brief (`mock the session post`), with symmetric 401 re-auth handling and JSON error unwrapping.

## What Needs a Phone or Host to Check

- Native date/time picker platform modal presentation (`@react-native-community/datetimepicker`) on real physical iOS/Android devices.
- Keyboard avoidance and keyboard-aware scroll view behavior when typing in the multiline "Cosa deve fare" text field on smaller phone screens.
