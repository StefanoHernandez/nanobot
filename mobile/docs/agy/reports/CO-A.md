# CO-A report — costs per model with daily cap alert

## Files Touched
- `mobile/src/extras/costs.ts` (created: types, formatters `formatCost` & `formatTokens`, API callers `fetchCosts` & `saveCostSettings`, Zustand store `costsStore` with profile guard and notification deduplication in kv, hook `useCosts`, and background watcher hook `useCostsBackgroundWatcher` polling every 10 min)
- `mobile/src/screens/settings/CostsSection.tsx` (created: settings section with today & cap header, progress bar with normal/warning/danger colors, range selector chips, daily bars chart, per-model usage breakdown sorted by cost, unpriced models banner, price editor sheet with validation, and cap / alert threshold fields)
- `mobile/src/screens/settings/SettingsScreen.tsx` (added `costs` right after `overview` in `SECTIONS`, with icon `cash` in `SECTION_ICONS`)
- `mobile/src/screens/settings/SettingsSection.tsx` (wired `s === "costs" ? <CostsSection /> : ...`)
- `mobile/src/ui/components/TextField.tsx` (added `onBlur` to Pick<TextInputProps> so form fields can save on blur)
- `mobile/app/(main)/_layout.tsx` (mounted `useCostsBackgroundWatcher()`)
- `mobile/src/i18n/it.json` (added Italian translations for `costs`)
- `mobile/src/i18n/en.json` (added English translations for `costs`)
- `mobile/test/extras/costs.test.tsx` (created: 8 comprehensive unit and integration tests covering all requirements in the brief)
- `mobile/docs/agy/reports/CO-A.md` (this report)

## Dependencies
None added.

## TDD
- **RED phase:** Created `mobile/test/extras/costs.test.tsx` testing formatters, rendering of today and cap, bar colors for normal/alert/over_cap, range chips (7d vs 30d) with empty bars for missing days, price editor sheet (prefill, validation, full map posting, key deletion), cap and alert_pct validation and blur saving, notification firing once per day per kind only when cap is set, and profile switch dropping stale requests. Ran `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest test/extras/costs.test.tsx`: failed with module not found error as expected.
- **GREEN phase:** Implemented `costs.ts`, `CostsSection.tsx`, integrated into settings navigation and layout, added localization strings, and verified all 8 tests pass. Full test suite (87 suites, 714 tests) and TypeScript typecheck pass cleanly.

## Raw Output

`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest test/extras/costs.test.tsx`:
```
PASS test/extras/costs.test.tsx
  CO-A: costs
    ✓ the money and token formatter edge cases (12 ms)
    ✓ the payload renders today, the cap bar and per-model sorting. An unpriced model shows — and the banner (212 ms)
    ✓ bar colour for normal, alert and over_cap (91 ms)
    ✓ the range chips change the totals between 7 and 30 days, and missing days render as empty bars (39 ms)
    ✓ the prices sheet posts the full map. Delete posts the map without that key. Opening it from an unpriced model prefills the key. Invalid numbers are refused on the client (136 ms)
    ✓ saving the cap posts the number. An empty field posts null. alert_pct 0 or 101 is refused (76 ms)
    ✓ the notification fires once per day per kind, and is not fired when no cap is set (1 ms)
    ✓ a profile switch mid-request drops the stale result (1 ms)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        1.466 s, estimated 2 s
Ran all test suites matching /test\/extras\/costs.test.tsx/i.
```

`npx tsc --noEmit`:
```
(clean - 0 errors)
```

`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` (whole suite):
```
PASS test/state/fork-temp-workspace.test.ts
PASS test/screens/model-badge.test.tsx
PASS test/ecosystem/apps-skills-automations.test.ts
PASS test/screens/preview-bridge.test.ts
PASS test/screens/attachments.test.tsx
PASS test/screens/message-row-document.test.tsx
PASS test/core/upload.test.ts
PASS test/ecosystem/channels.test.ts
PASS test/screens/gallery-files.test.tsx
PASS test/state/thread.integration.test.ts
PASS test/ui/components.test.tsx
PASS test/state/subagents.test.ts
PASS test/state/thread.test.ts
PASS test/state/chats.test.ts
PASS test/core/pairing.test.ts
PASS test/settings/store.test.ts
PASS test/ui/math.test.tsx
PASS test/core/session.test.ts
PASS test/extras/outbox.test.tsx
PASS test/ui/snackbar.test.tsx
PASS test/core/profiles.test.ts
PASS test/vendor-smoke.test.ts
PASS test/screens/web-media.test.ts
PASS test/screens/group-chats.test.ts
PASS test/vendorVersion.test.ts
PASS test/artifacts/fix.test.ts
PASS test/state/usage.test.ts
PASS test/ui/anyimage.test.tsx
PASS test/ui/theme.test.ts
PASS test/screens/export-artifact.test.ts
PASS test/screens/reading-pages.test.ts
PASS test/screens/orientation.test.ts
PASS test/platform/browser-store.test.ts
PASS test/ui/botface.test.tsx
PASS test/platform.test.ts
PASS test/ui/math-frame.test.ts
PASS test/settings/runtime-capabilities.test.ts
PASS test/artifacts/collect.test.ts

Test Suites: 87 passed, 87 total
Tests:       714 passed, 714 total
Snapshots:   0 total
Time:        7.473 s
Ran all test suites.
```

## Requirements Breakdown & Implementation Citations

### 1. `src/extras/costs.ts`
- **`fetchCosts(days)` & `saveCostSettings(partial)`:** `mobile/src/extras/costs.ts:89-125`. Uses `redirect: "error"`, `credentials: "omit"`, and `Authorization: Bearer <token>`.
- **Zustand store `costsStore` with generation & profile guard:** `mobile/src/extras/costs.ts:127-217`. Increments generation and discards responses if profile changed mid-flight. Clears store on `sessionStore` profile switch.
- **Hook `useCosts(days)`:** `mobile/src/extras/costs.ts:227-248`. Refreshes on mount or when `days` or session state changes. Provides `refresh` callback for pull-to-refresh without fast polling.
- **Hook `useCostsBackgroundWatcher()`:** `mobile/src/extras/costs.ts:250-260`. Uses `usePolling` with `{ background: true, intervalMs: 600000 }` (every 10 minutes), active only when session is open and `daily_cap_usd != null`.

### 2. `src/screens/settings/CostsSection.tsx`
- **Section placement & navigation:** `mobile/src/screens/settings/SettingsScreen.tsx:10, 15` (added `costs` right after `overview` with icon `cash`), `mobile/src/screens/settings/SettingsSection.tsx:13, 22` (routes `costs` to `<CostsSection />`).
- **Header with today's cost & cap progress bar:** `mobile/src/screens/settings/CostsSection.tsx:254-307`. Displays `$today / $cap` (or `$today` if no cap). Progress bar uses `th.colors.primary` for normal, `th.colors.brand` for `alert`, and `th.colors.destructive` for `over_cap`.
- **Range selection Chips & period totals:** `mobile/src/screens/settings/CostsSection.tsx:309-322`. Chips switch between 7 and 30 days and update total cost.
- **Daily bars chart:** `mobile/src/screens/settings/CostsSection.tsx:176-200, 324-386`. Renders one `View` bar per day in the selected range without chart libraries. Days without data render with 0 height (minimum baseline) and no gaps. Tapping a day selects that day and shows its model usage list.
- **Per-model usage list:** `mobile/src/screens/settings/CostsSection.tsx:202-233, 424-515`. Shows model name, input/output token counts, and cost, sorted descending by cost. Unpriced models display "—" with a "Set price" / "Imposta prezzo" action.
- **Unpriced banner:** `mobile/src/screens/settings/CostsSection.tsx:389-421`. Renders when `unpriced_models.length > 0`.
- **Prices editor Sheet:** `mobile/src/screens/settings/CostsSection.tsx:517-586, 621-700`. Lists configured prices with edit button. Sheet allows adding, editing, and deleting prices in USD per 1M tokens. Prefills model key when opened from an unpriced model. Validates numeric inputs on client and saves full price map.
- **Cap and alert threshold fields:** `mobile/src/screens/settings/CostsSection.tsx:589-619`. Daily cap (empty saves `null`) and alert percentage (1-100 required; 0 or 101 refused on client) saved on blur.
- **Lifecycle guard:** `mobile/src/screens/settings/CostsSection.tsx:40-45`. Sets `onCostsScreen = true` on mount and `false` on unmount.

### 3. Background Notifications
- **Deduplicated local notifications:** `mobile/src/extras/costs.ts:158-185`. When in background or outside the costs screen, and `daily_cap_usd != null`: schedules `costs.overNotify` or `costs.alertNotify` via `Notifications.scheduleNotificationAsync` on channel `turns`. Records `costs.notified.${today}.${kind}` in `kv` so notifications never repeat on the same day.
- **Watcher mount:** `mobile/app/(main)/_layout.tsx:8, 13`. Mounts `useCostsBackgroundWatcher()`.

### 4. Formatters
- **`formatCost(amount)`:** `mobile/src/extras/costs.ts:60-66`. Returns `$0.0042` below 1 cent, `$1.20` / `$0.00` otherwise.
- **`formatTokens(tokens)`:** `mobile/src/extras/costs.ts:68-76`. Compact notation (e.g. `1.2M`, `340k`, `10k`, `1.5k`, `500`, `0`).

### 5. Error Handling & Invariants
- **Generic error message:** `mobile/src/extras/costs.ts:194`, `mobile/src/screens/settings/CostsSection.tsx:132, 144, 157`. Shows `common.operationFailed`, never raw error message. Last valid data kept on screen on refresh failure.
- **i18n & Theme:** All strings localized in `mobile/src/i18n/it.json` and `mobile/src/i18n/en.json`. Strict adherence to `useTheme()` tokens and `th.font.*`, no `fontWeight`, minimum 48 dp touch targets.

## What Could Not Be Verified
- **Physical device / Live server:** Nothing was run on a physical Android device or against a live nanobot server. Background execution limits and lockscreen notification rendering could not be directly observed on real hardware.
