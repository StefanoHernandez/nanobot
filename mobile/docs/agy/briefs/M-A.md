# M-A: automation schedule pickers and the toast race (owner: agy)

Branch `agy/M-A`, created from `claude/redesign-companion`. Worktree `../nanobot-agy`.

## Read first
- `mobile/docs/agy/README.md`: the rules.
- `mobile/docs/design/companion.md`: the design. Use tokens and `th.font.*` only, with no `fontWeight`.
- `mobile/docs/agy/reviews/claude-review-2026-10-14.md`: "Parked", items I8 and I15.

## Scope (only these files)
- `src/screens/ecosystem/automations/**`
- `src/ui/components/ToastHost.tsx`
- `src/ui/components/Toast.tsx`
- `src/i18n/it.json` and `src/i18n/en.json`
- New tests under `test/`

## 1. I8: real schedule input in `AutomationJobSheet.tsx`
Today `at` and `every` are free text in English (`parseAtSchedule`, `parseEverySchedule`, `formatEverySchedule` ~43-90). The `at` value is shown as a UTC ISO string but parsed as local time, so it doesn't round-trip.
- **`at`:** two buttons, "Date" and "Time", open the native picker. Use `@react-native-community/datetimepicker`, installed with `npx expo install`; justify it in the report.
  - Show the chosen moment in local time, formatted with `Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" })`.
  - Send epoch ms exactly as today.
  - A moment in the past shows an inline error (`automations.err.past`) and blocks Save.
- **`every`:** a numeric `TextField` (`keyboardType="number-pad"`) plus unit chips "minuti / ore / giorni" (i18n).
  - Prefill from the existing `every_ms`: largest whole unit, e.g. 90 minutes stays as 90 min, not 1.5 h.
  - Value ≤ 0 or not a number shows an inline error and blocks Save.
  - Sub-minute values are no longer rounded away silently: show them as minutes with decimals, or keep the raw ms.
- Remove the hard-coded English strings ("1 day", "hours"…). All copy goes through i18n.
- The payload sent to the server must be **identical** to today's for the same schedule: same keys, ms units.

## 2. I15: a toast fired just before a Sheet/Dialog opens must be visible
`ToastHost.tsx`: the newest-mounted host renders the toast. But a host that mounts **after** `toast.show()` starts with `msg=null`, so the toast is invisible behind the modal.
- Fix: on mount, a host reads the toast store's current message, if it hasn't expired, and renders it.
- Only the top-most mounted host renders: never two copies.

## Tests (write first)
- **I8:**
  - an `every` of 90 min prefills "90" plus the minutes chip;
  - changing the unit to hours with "2" sends `every_ms = 7_200_000`;
  - an `at` in the past shows the error and does not call the mutate;
  - the formatter round-trips local time (assert with a fixed timezone via `process.env.TZ` in the test).
- **I15:**
  - `toast.show("x")`, then mount a `Sheet` → "x" is rendered inside the sheet;
  - with the root `ToastHost` and an open `Sheet`, "x" is rendered exactly once;
  - after the sheet closes, the root host shows the next toast.

  Do not mock `ToastHost` or the toast store.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- Commit `fix(mobile): automation schedule pickers; toasts visible over just-opened sheets`.
- Report in `mobile/docs/agy/reports/M-A.md`, per README "Before you say done". Say nothing was run on a device.
