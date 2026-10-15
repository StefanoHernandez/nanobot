# MD-A Report: Machine Dashboard in Settings

- **Branch:** `agy/MD-A`
- **Verification:**
  - `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`: PASS (87 test suites, 716 passed, 0 failed)
  - `npx tsc --noEmit`: PASS (0 errors)
- **Focused Test Suite:** `mobile/test/screens/machine-dashboard.test.tsx` (10 passed, 0 failed)

---

## Files Changed and Created

### Created
1. `mobile/src/extras/system.ts` — Types (`SystemSnapshot`, `SystemMemory`, `SystemDisk`, `SystemStatsState`), `fetchSystem(session)` client matching `approvals.ts`, pure helper `formatDuration(seconds, lang)`, `temperatureColor(tempC, theme)` helper, `systemStore` with generation counter and profile switch listener, and `useSystemStats()` foreground polling hook (5s interval, `background: false`).
2. `mobile/src/screens/settings/MachineSection.tsx` — Settings section `machine` with CPU, RAM (with % bar), swap (conditionally rendered only when `swap_total_mb > 0`), disk (used/total + free), temperature (color thresholds), load averages (1m, 5m, 15m with core count), machine and gateway uptimes, gateway restart row (confirm `Dialog` reusing `useRestart().run`), and recent errors (newest first, mono font, selectable, up to 20, or quiet line `machine.noErrors`).
3. `mobile/test/screens/machine-dashboard.test.tsx` — Test suite covering all 8 requirements of the brief without mocking the section or hook.
4. `mobile/docs/agy/reports/MD-A.md` — This report.

### Modified
1. `mobile/src/screens/settings/SettingsScreen.tsx` — Added `"machine"` to `SECTIONS` immediately after `"system"`; assigned `"chip"` icon to `SECTION_ICONS`.
2. `mobile/src/screens/settings/SettingsSection.tsx` — Imported `MachineSection` and rendered it when `s === "machine"`.
3. `mobile/src/i18n/it.json` — Added `"machine": "Macchina"` under `settings.sections` and added `"machine"` namespace.
4. `mobile/src/i18n/en.json` — Added `"machine": "Machine"` under `settings.sections` and added `"machine"` namespace.

---

## Brief Items Implementation Details

| Item | Requirement | Implementation Details | File:Line |
|---|---|---|---|
| **1. `src/extras/system.ts`** | `fetchSystem()`, `useSystemStats()` foreground polling (5s, not background), generation/profile guard, clear on profile switch | Implemented `fetchSystem` using `Bearer` auth, `redirect: "error"`, `credentials: "omit"`. Zustand `systemStore` with `generation` and `profileId` guards. Subscribed to `sessionStore` to reset on profile change. `usePolling` with `intervalMs: 5000` and `background: false`. | `mobile/src/extras/system.ts:47-158` |
| **2. `formatDuration` helper** | Uptime as readable durations ("3 g 4 h", "12 min", "59 s", "0 s") | Pure function handling seconds: `<60s` -> `${s} s`, `<86400s` -> `${m} min`, `>=86400s` -> `${d} ${unit} ${h} h` ("g" for Italian, "day(s)" for English). Returns "—" on null/NaN. | `mobile/src/extras/system.ts:41-50` |
| **3. Temperature thresholds** | Turns `danger` colour at >= 75 °C, `warning` colour at >= 65 °C, normal otherwise | Pure function `temperatureColor`: `>= 75` -> `th.colors.destructive`, `>= 65` -> `th.colors.ring`, `< 65` -> `th.colors.foreground`, `null` -> `th.colors.mutedForeground`. | `mobile/src/extras/system.ts:52-58` |
| **4. Settings routing & icon** | Add `machine` section to `SECTIONS` after `system` with icon `chip` or `server` | Added `"machine"` to `SECTIONS` right after `"system"` and mapped to `"chip"` in `SECTION_ICONS`. Routed in `SettingsSection.tsx`. | `mobile/src/screens/settings/SettingsScreen.tsx:10,18`<br>`mobile/src/screens/settings/SettingsSection.tsx:12,23` |
| **5. Gauges UI** | CPU %, RAM used/total with bar, swap only if `swap_total_mb > 0`, disk used/total + free, temperature | Built `GaugeRow` with simple percent `View` bar (no chart library). Swap conditionally rendered with `hasSwap = (data?.memory?.swap_total_mb ?? 0) > 0`. | `mobile/src/screens/settings/MachineSection.tsx:11-37,47-79` |
| **6. Load and cores** | 1/5/15 min load averages next to cores | Displayed load averages joined with separator and cores via `t("machine.cores", { count: data.cores })`. | `mobile/src/screens/settings/MachineSection.tsx:57-58,81-87` |
| **7. Uptime rows** | Machine and gateway uptime | Rendered machine and gateway uptimes using `formatDuration`. | `mobile/src/screens/settings/MachineSection.tsx:60-61,89-101` |
| **8. Recent errors** | `log_errors` newest first, mono font, selectable, max 20; if empty, `machine.noErrors` | `[...data.log_errors].reverse().slice(0, 20)`. Rendered with `selectable`, `fontFamily: th.font.mono`. If empty, shows quiet text `machine.noErrors`. | `mobile/src/screens/settings/MachineSection.tsx:63,111-155` |
| **9. Restart row** | "Riavvia gateway" reusing `useRestart().run` behind confirm `Dialog` | Uses `useRestart().run` from `src/settings/store.ts`. Pressing row opens destructive confirm `Dialog`. Confirm triggers `run()`. | `mobile/src/screens/settings/MachineSection.tsx:28-29,103-109,157-168` |
| **10. Error handling** | 401/403 shows `machine.noAccess`, other shows `common.operationFailed`, keep last good data, never raw message | Catch block in `systemStore.refresh` maps status 401/403 to `"machine.noAccess"` and other errors to `"common.operationFailed"`. Retains previous `data` in store and on screen. | `mobile/src/extras/system.ts:114-124`<br>`mobile/src/screens/settings/MachineSection.tsx:67-71` |
| **11. Styling & i18n** | Theme tokens, `th.font.*`, no `fontWeight`, touch targets >= 48dp, it + en | All colors from `useTheme()`, all fonts from `th.font`, no `fontWeight`. All rows `minHeight: 48` or `ListItem` (56dp). Full Italian and English translations in `it.json` and `en.json`. | `mobile/src/screens/settings/MachineSection.tsx`<br>`mobile/src/i18n/it.json:152,983-1004`<br>`mobile/src/i18n/en.json:152,983-1004` |

---

## What Could Not Be Verified

- **Physical Device & Live Server Execution:** Nothing was run on a real Android/iOS physical device, nor connected to a live nanobot server / Arduino Uno Q.
- **Verification Environment:** All logic, contracts, edge cases, error mappings, color thresholds, and formatting were verified via automated Jest tests and TypeScript strict compilation.

---

## Raw Test and Typecheck Output

### `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest test/screens/machine-dashboard.test.tsx`

```text
PASS test/screens/machine-dashboard.test.tsx
  MD-A: Machine Dashboard
    ✓ SettingsScreen includes machine section after system
    ✓ renders CPU, RAM, disk, temperature, load and uptimes; swap is shown when swap_total_mb > 0 (167 ms)
    ✓ null fields render '—' and swap is hidden when swap_total_mb is 0 (7 ms)
    ✓ log_errors renders newest first; empty list shows machine.noErrors (11 ms)
    ✓ failed poll keeps previous data; 403 shows machine.noAccess (19 ms)
    ✓ profile switch mid-request drops stale result and clears data
    ✓ restart row asks for confirm dialog, then calls existing restart (17 ms)
    ✓ polling interval is 5 s and disabled in background (2 ms)
    Duration helper (formatDuration)
      ✓ formats 0 s, 59 s, 61 min, 3 days 4 h in en and 3 g 4 h in it (11 ms)
    Temperature color thresholds
      ✓ thresholds at 64 °C (normal), 65 °C (warning), and 75 °C (danger) (1 ms)

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
Snapshots:   0 total
Time:        0.812 s, estimated 1 s
Ran all test suites matching /test\/screens\/machine-dashboard.test.tsx/i.
```

### Full test suite: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`

```text
Test Suites: 87 passed, 87 total
Tests:       716 passed, 716 total
Snapshots:   0 total
Time:        7.014 s
Ran all test suites.
```

### `npx tsc --noEmit`

```text
(Clean exit with code 0 - no errors or warnings reported)
```
