# MD-A: machine dashboard, app side (owner: agy)

Branch `agy/MD-A`, from `main`. Worktree: whichever one is free.

## Read first
- `nanobot/ext/system.py`: the server API (read-only for you).
- `mobile/docs/agy/README.md` and `mobile/docs/design/companion.md`.
- `src/extras/approvals.ts`: copy how it fetches (URL, `Authorization`, `redirect: "error"`, `credentials: "omit"`, generation + profile guard).

## Server API (already built)
`GET /api/ext/system`, same auth as `/api/ext/approvals`. It returns:
```
{ cpu_percent, load: [1m, 5m, 15m], cores,
  memory: { total_mb, used_mb, swap_total_mb, swap_used_mb },
  temperature_c, disk: { total_gb, used_gb, free_gb },
  uptime_s, gateway_uptime_s, log_errors: [string] }
```
Every field can be `null` (not every machine exposes it), and so can a nested object. Show "—" for null. The first `cpu_percent` after a gateway start may be `null`.

## Build
1. **`src/extras/system.ts`**:
   - `fetchSystem()`;
   - a hook `useSystemStats()` that uses `usePolling` (from `src/ecosystem/common.ts`, foreground only, **not** `background`) every 5 s while the screen is mounted and the session is `open`. It returns `{ data, error }`;
   - the same generation and profile guard as `approvals.ts`. Clear the data on profile switch.
2. **`src/screens/settings/MachineSection.tsx`**, a new settings section `machine` ("Macchina"), added to `SECTIONS` in `SettingsScreen.tsx` after `system`, with an icon (`chip` or `server`). It has:
   - **Gauges:**
     - CPU %;
     - RAM, used/total, with a percent bar;
     - swap, shown only if `swap_total_mb > 0`;
     - disk, used/total plus free;
     - temperature, which turns `danger` colour at 75 °C or more and `warning` colour at 65 °C or more.

     Each gauge is a simple bar (a `View` with a percent width), with no chart library.
   - **Load:** the 1/5/15 min load averages next to `cores`.
   - **Uptime:** machine and gateway uptime as readable durations ("3 g 4 h", "12 min"), through a small pure helper with tests.
   - **Recent errors:** `log_errors` newest first, mono font, selectable, at most 20. If the list is empty, show the quiet line `machine.noErrors`.
   - **Restart:** a "Riavvia gateway" row that reuses `useRestart().run` from `src/settings/store.ts`, behind a confirm `Dialog`, just as `RuntimeConfigSection.tsx` uses it. Do not add a new restart path.
3. **Errors:** a 401 or 403 shows `machine.noAccess`; anything else shows `common.operationFailed`. Never show raw `err.message`. Keep the last good data on screen when a poll fails.
4. i18n keys go in both `it.json` and `en.json`, with no hard-coded Italian. Use theme tokens and `th.font.*` only, no `fontWeight`, touch targets ≥ 48dp.

## Tests (write first, no mocking of the hook or the section)
- A GET payload renders CPU, RAM, disk, temperature and load. Null fields render "—". Swap is hidden when `swap_total_mb` is 0.
- Temperature colour thresholds at 64, 65 and 75 °C.
- The duration helper: 0 s, 59 s, 61 min, 3 days 4 h.
- `log_errors` render newest first. An empty list shows `machine.noErrors`.
- A failed poll keeps the previous data. A 403 shows `machine.noAccess`.
- A profile switch mid-request drops the stale result.
- The restart row asks for confirm, then calls the existing restart.
- The interval is 5 s, and the hook does not poll in background.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- No edits to `mobile/vendor/**` or to server Python.
- Commit `feat(mobile): machine dashboard in settings`.
- Report in `mobile/docs/agy/reports/MD-A.md`. Say nothing was run on a device or against a live server.
