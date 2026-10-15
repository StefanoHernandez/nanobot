# M-A Report: Automation Schedule Pickers & Toast Race Over Sheets

- **Branch:** `agy/M-A`
- **Verification:**
  - `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`: PASS (62 test suites, 539 passed, 0 failed)
  - `npx tsc --noEmit`: PASS (0 errors)
- **Focused Test Suite:** `mobile/test/fixes/m-a.test.tsx` (10 tests covering I15 toast visibility across sheets, single rendering top-most host, sheet dismissal toast restoration, I8 schedule picker prefilling, unit chip selection, sub-minute decimal preservation, invalid value blocking, and past date blocking)

---

## Files Changed

1. `mobile/package.json` (installed `@react-native-community/datetimepicker` via `npx expo install`)
2. `mobile/package-lock.json` (lockfile updated for `@react-native-community/datetimepicker`)
3. `mobile/app.json` (plugin entry added by Expo for `@react-native-community/datetimepicker`)
4. `mobile/src/ui/components/ToastHost.tsx` (toast store now preserves `currentToast` with `expiresAt`; new hosts mount with active toast; topmost host rendering logic; `th.font.regular` applied)
5. `mobile/src/screens/ecosystem/automations/AutomationJobSheet.tsx` (native date/time pickers for `at`, numeric textfield with unit chips for `every`, localized error handling and sub-minute decimal support)
6. `mobile/src/i18n/it.json` (added keys under `automations`: `date`, `time`, `minutes`, `hours`, `days`, `interval`, `err.past`, `err.invalid`)
7. `mobile/src/i18n/en.json` (added keys under `automations`: `date`, `time`, `minutes`, `hours`, `days`, `interval`, `err.past`, `err.invalid`)
8. `mobile/test/fixes/m-a.test.tsx` (new test suite for I8 and I15 requirements)
9. `mobile/test/screens/ecosystem-automations.test.tsx` (updated 2 existing tests from obsolete free-text assertions to new picker/chips UI)
10. `mobile/docs/agy/reports/M-A.md` (this report)

---

## Brief Items Implementation Details

| Item | Brief Requirement | Implementation Details | File:Line |
|---|---|---|---|
| **I8: Date & Time Buttons** | Two buttons "Date" and "Time" open native `@react-native-community/datetimepicker` | Renders `Button` components for Date and Time triggering `DateTimePicker` with `mode="date"` or `mode="time"`. Handles Android dismissal and iOS/Android value changes | `mobile/src/screens/ecosystem/automations/AutomationJobSheet.tsx:225-240,439-467` |
| **I8: Local Time Formatting** | Show chosen moment formatted with `Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" })` | Created `formatAtLocal(atMs, lang)` helper using `Intl.DateTimeFormat` with requested options and language locale | `mobile/src/screens/ecosystem/automations/AutomationJobSheet.tsx:69-74,435-438` |
| **I8: Exact Server Payload** | Send epoch ms `at_ms` / `every_ms` exactly as before | `handleSaveEdit` constructs `{ kind: "at", at_ms: atDate.getTime(), ...(tz ? { tz } : {}) }` or `{ kind: "every", every_ms: ms, ...(tz ? { tz } : {}) }` identically to previous contract | `mobile/src/screens/ecosystem/automations/AutomationJobSheet.tsx:254-282` |
| **I8: Past Time Validation** | A moment in the past shows inline error (`automations.err.past`) and blocks Save | In `handleSaveEdit`, checks `atDate.getTime() <= Date.now()`. Displays error and blocks `update` mutation | `mobile/src/screens/ecosystem/automations/AutomationJobSheet.tsx:258-261` |
| **I8: Numeric Interval & Unit Chips** | Numeric `TextField` (`keyboardType="number-pad"`) + unit chips "minuti / ore / giorni" (i18n) | Renders `TextField` with `number-pad` for amount and button chips for `minutes`, `hours`, and `days` mapped through i18n | `mobile/src/screens/ecosystem/automations/AutomationJobSheet.tsx:459-488` |
| **I8: Whole Unit Prefill** | Prefill from `every_ms`: largest whole unit (90 minutes stays 90 min, not 1.5 h) | `parseEveryMsToUnit` checks days, then hours, then minutes for whole integers. 90m returns `{ amount: "90", unit: "minutes" }` | `mobile/src/screens/ecosystem/automations/AutomationJobSheet.tsx:38-56,174-177` |
| **I8: Sub-minute & Invalid Check** | Value ≤ 0 or not a number shows inline error and blocks Save; sub-minute values kept as decimals | `everyUnitToMs` parses decimals and rejects invalid/<=0 values. `parseEveryMsToUnit` keeps decimals (e.g. 30s -> 0.5m) | `mobile/src/screens/ecosystem/automations/AutomationJobSheet.tsx:54-56,58-67,264-268` |
| **I8: i18n Localization** | Remove hardcoded English strings; all copy through i18n | Added translation keys for units, pickers, and error states to `it.json` and `en.json`; removed hard-coded English strings | `mobile/src/i18n/it.json:739-748`<br>`mobile/src/i18n/en.json:739-748`<br>`mobile/src/screens/ecosystem/automations/AutomationJobSheet.tsx:432-488` |
| **I15: Toast Visibility Over Sheets** | On mount, host reads unexpired `currentToast` from toast store and renders it | Maintained `currentToast = { message, expiresAt }` in `ToastHost.tsx`. Host initializes `useState` with active message and checks `currentToast` in `useEffect` on mount | `mobile/src/ui/components/ToastHost.tsx:35-52,59-64,79-81` |
| **I15: Topmost Host Only** | Only the topmost mounted host renders: never two copies | Uses `useSyncExternalStore` with stack of mounted host IDs. Only host matching `topHostId` renders the toast container | `mobile/src/ui/components/ToastHost.tsx:21-33,65,92` |
| **I15: Post-sheet Toast Restoration** | After sheet closes, root host shows next toast | When sheet unmounts, topHost resets to root host. Root host receives subsequent `toast.show` events normally | `mobile/src/ui/components/ToastHost.tsx:71-74,92-99` |

---

## Dependencies Added

- `@react-native-community/datetimepicker` (`~9.1.0`): Added via `npx expo install @react-native-community/datetimepicker`.
  - **Justification:** Required by brief item I8 to provide native date and time picker dialogs on mobile platforms, replacing raw English free-text parsing.

---

## Doubts or Deviations

None. All constraints and boundaries were respected:
- Token-based styling and `th.font.*` fonts only, no `fontWeight` used.
- Colors sourced strictly through `useTheme()`.
- Minimum touch targets ≥ 48 dp maintained via `Button` component base styles.

---

## What Could Not Be Verified

- **Physical Device Execution:** No testing was performed on a physical Android or iOS device in this Linux development environment.
- Native system modal presentation (`DatePickerDialog` / `TimePickerDialog` on Android, UIDatePicker on iOS) relies on Expo / React Native runtime bindings.
- Verified in testing environment via:
  - 10 targeted automated tests in `test/fixes/m-a.test.tsx` exercising all brief specifications.
  - Complete Jest test suite passing (62/62 test suites, 539/539 tests).
  - TypeScript strict typecheck (`npx tsc --noEmit`) passing with 0 errors.

---

## Raw Output of Verification Tools

### `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`

```text
PASS test/screens/capabilities-settings.test.tsx
PASS test/screens/ecosystem-channels.test.tsx
PASS test/fixes/m-a.test.tsx
PASS test/screens/media.test.tsx
PASS test/screens/redesign-settings.test.tsx
PASS test/screens/chats.test.tsx
PASS test/screens/ecosystem-automations.test.tsx
PASS test/screens/connect.test.tsx
PASS test/screens/redesign-ecosystem.test.tsx
PASS test/screens/settings.test.tsx
PASS test/extras/speech.test.tsx
PASS test/fixes/fix-a.test.tsx
PASS test/extras/native.test.tsx
PASS test/screens/composer.test.tsx
PASS test/extras/useEffort.test.tsx
PASS test/state/fork-temp-workspace.test.ts
PASS test/ecosystem/apps-skills-automations.test.ts
PASS test/extras/voice.test.ts
PASS test/screens/history-error.test.tsx
PASS test/state/sessionStore.test.ts
PASS test/core/session.test.ts
PASS test/state/chats.test.ts
PASS test/core/profiles.test.ts
PASS test/state/subagents.test.ts
PASS test/ui/components.test.tsx
PASS test/state/thread.integration.test.ts
PASS test/screens/artifacts.test.tsx
PASS test/settings/models-providers.test.ts
PASS test/settings/store.test.ts
PASS test/ecosystem/channels.test.ts
PASS test/ui/theme.test.ts
PASS test/settings/runtime-capabilities.test.ts
PASS test/state/thread.test.ts
PASS test/ui/anyimage.test.tsx
PASS test/extras/effort.test.ts
PASS test/state/usage.test.ts
PASS test/core/upload.test.ts
PASS test/extras/logic.test.ts
PASS test/extras/notifier.test.ts
PASS test/platform.test.ts
PASS test/vendor-smoke.test.ts
PASS test/screens/thread.test.tsx
PASS test/ui/math.test.tsx
PASS test/vendorVersion.test.ts
PASS test/ui/botface.test.tsx
PASS test/extras/outbox.test.tsx
PASS test/screens/ecosystem-skills.test.tsx
PASS test/screens/mainLayout.test.tsx

Test Suites: 62 passed, 62 total
Tests:       539 passed, 539 total
Snapshots:   0 total
Time:        6.347 s
Ran all test suites.
```

### `npx tsc --noEmit`

```text
(exited with code 0, no output)
```
