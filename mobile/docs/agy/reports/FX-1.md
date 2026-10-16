# FX-1 Report: Review Fixes for MD-A and CO-A

- **Branch:** `agy/FX-1`
- **Brief:** `mobile/docs/agy/briefs/FX-1.md`
- **Commit Message:** `fix(mobile): costs and machine dashboard review fixes`
- **Verification:**
  - `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`: PASS (89 test suites, 736 passed, 0 failed)
  - `npx tsc --noEmit`: PASS (0 errors)
- **Focused Test Suite:** `mobile/test/fixes/fx-1.test.tsx` (12 passed, 0 failed)

---

## Summary of Changes

### Costs (CO-A)
1. **Watcher starts without opening CostsSection (Item 1):** In `mobile/src/extras/costs.ts`, `useCostsBackgroundWatcher` now triggers its own `fetchCosts(1)` once on session `open` or profile switch. Background polling is enabled only when `daily_cap_usd != null`. Exported alias `useCostsWatcher` for compatibility.
2. **Preserve `cache_write` when editing prices (Item 2):** In `mobile/src/screens/settings/CostsSection.tsx`, `openEditPrice` and `handleSavePrice` preserve `input`, `output`, `cache_read`, and `cache_write`. Added an optional `cache_write` text input in the edit price sheet.
3. **Invalid or negative prices rejected (Item 3):** Negative or non-numeric values for `cache_read` and `cache_write` display the `costs.invalidPrice` toast and block saving.
4. **Hardcoded strings to i18n (Item 4):** Moved price summaries and placeholders (`inputPricePlaceholder`, `outputPricePlaceholder`, `cacheReadPlaceholder`, `cacheWritePlaceholder`, `capPlaceholder`, `alertPctPlaceholder`, `priceSummary`, `cacheReadPart`, `cacheWritePart`, `cacheBothPart`) to `mobile/src/i18n/it.json` and `en.json`.
5. **Daily bars touch target >= 48dp (Item 5):** Added `hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}` and `minHeight: 48` to touchable daily cost bars.
6. **Single request on range change (Item 6):** Removed duplicate `refresh` call in `handleRangeChange`; changing range now fires only one request via `useCosts(Number(range))`.
7. **Progress bar colors (Item 7):** Progress bar uses `colors.brand` for warning/approaching cap and `colors.destructive` for `over_cap`.

### Machine Dashboard (MD-A)
8. **Error banner does not flicker (Item 8):** In `mobile/src/extras/system.ts`, `systemStore.refresh()` no longer resets `error: null` before the response. Previous error remains displayed until a successful response arrives.
9. **`formatDuration` units in i18n (Item 9):** `formatDuration` accepts a translation function `t` to render translated units (`s`, `min`, `h`, `d`, `g`, `day/days`) defined under `i18n.machine.duration`.
10. **Temperature warning color (Item 10):** In `mobile/src/extras/system.ts`, temperature >= 65 °C uses `colors.brand` (warning), and >= 75 °C uses `colors.destructive` (danger).
11. **Load array check (Item 11):** In `mobile/src/screens/settings/MachineSection.tsx`, `data.load` is rendered only when `Array.isArray(data?.load)`, falling back to `" — "`. Removed unused `lang` variable.
12. **Remove defensive guards (Item 12):** Removed defensive `sessionStore?.getState ? ...` ternary guards in `mobile/src/extras/system.ts`.

---

## Files Changed and Created

### Created
1. `mobile/test/fixes/fx-1.test.tsx` — Test suite containing one test per item covering all 12 review fixes.
2. `mobile/docs/agy/reports/FX-1.md` — This report.

### Modified
1. `mobile/src/extras/costs.ts` — Updated `useCostsBackgroundWatcher` with initial fetch and cap-conditional polling.
2. `mobile/src/extras/system.ts` — Fixed error flicker in `refresh()`, duration i18n helper, temperature color warning threshold, and removed defensive guards.
3. `mobile/src/screens/settings/CostsSection.tsx` — Cache-write field in sheet, validation, hitSlop touch area on bars, single request on range change.
4. `mobile/src/screens/settings/MachineSection.tsx` — Load array guard and duration i18n parameter.
5. `mobile/src/i18n/it.json` — Italian translations for price placeholders, duration units, and summaries.
6. `mobile/src/i18n/en.json` — English translations for price placeholders, duration units, and summaries.
7. `mobile/test/screens/machine-dashboard.test.tsx` — Updated tests to supply `t` to `formatDuration` and verify `colors.brand` warning color.

---

## Verification

### Focused Test Suite: `mobile/test/fixes/fx-1.test.tsx`
```text
PASS test/fixes/fx-1.test.tsx
  FX-1: Review fixes for MD-A and CO-A
    ✓ Item 1: watcher fetches costs(1) on session open and sends alert notification in background without opening screen (25 ms)
    ✓ Item 2: editing a model that has cache_write preserves cache_write when only output is modified (259 ms)
    ✓ Item 3: negative cache_read or cache_write shows costs.invalidPrice and blocks save (64 ms)
    ✓ Item 4: price line and placeholders use i18n in it and en (1 ms)
    ✓ Item 5: daily bars have at least 48dp touch area (hitSlop or style) (30 ms)
    ✓ Item 6: changing the range fires only one request, not two (81 ms)
    ✓ Item 7: progress bar color uses brand for alert and destructive for over_cap (44 ms)
    ✓ Item 8: refresh does not clear error before poll response (1 ms)
    ✓ Item 9: formatDuration helper takes t function and renders translated units (1 ms)
    ✓ Item 10: temperature warning at 65 °C uses colors.brand and danger at 75 °C uses destructive
    ✓ Item 11: load averages render '—' if load is not an Array (10 ms)
    ✓ Item 12: system.ts contains no defensive sessionStore?.getState ? ... ternary checks

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        1.335 s
Ran all test suites matching /test\/fixes\/fx-1.test.tsx/i.
```

### Full Test Suite: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`
```text
Test Suites: 89 passed, 89 total
Tests:       736 passed, 736 total
Snapshots:   0 total
Time:        6.952 s, estimated 13 s
Ran all test suites.
```

### TypeScript Compiler Check: `npx tsc --noEmit`
```text
(Clean exit with code 0 - no errors reported)
```

---

## What Could Not Be Verified

- **Physical Device & Real Server Execution:** All tests and verifications were executed inside simulator/Jest automated harnesses without a physical Android/iOS hardware device and without a running backend server.
