# FX-1: review fixes for MD-A and CO-A (owner: agy)

Branch `agy/FX-1`, from `main`. MD-A and CO-A are already merged. Claude has resolved the `SECTIONS` conflict and fixed `usePolling`, so in background it now waits `max(intervalMs, 15 s)` and the 10 min costs watcher really ticks every 10 min.

Colour convention, since the theme has no `warning` token: **warning = `colors.brand`** (gold) and **danger = `colors.destructive`**. Do not add theme tokens.

## Costs (CO-A)
1. 🔴 **The watcher never starts without opening the screen.** `useCostsWatcher` reads the cap from `costsStore.data`, which only `CostsSection` fills. Fix it so the watcher does its own `fetchCosts(1)` once when the session becomes `open` (and after a profile switch), then polls only if `daily_cap_usd != null`. Test: with the layout mounted and the section never opened, a payload with a cap and `alert: true` while in background gives exactly one notification.
2. 🔴 **Editing a price erases `cache_write`.** `openEditPrice` and `handleSavePrice` must carry every field (`input`, `output`, `cache_read`, `cache_write`). The editor gets an optional cache-write field. Test: edit a model that has `cache_write`, change only `output`, and the POSTed map still holds `cache_write`.
3. Invalid or negative `cache_read`/`cache_write` show `costs.invalidPrice` and block the save. Do not drop them silently.
4. Hard-coded strings in `CostsSection.tsx`: the "$X in / $Y out / cache" line and the "e.g. …" placeholders move to i18n (it + en).
5. Daily bars: keep them visually thin, but give each one at least a 48dp touch area (`hitSlop` or a wider transparent `Pressable` around the bar).
6. Changing the range fires two requests. Keep only one, either the effect on `days` or the handler, not both.
7. Bar colour: `alert` uses `colors.brand`, `over_cap` uses `colors.destructive`. This is already the case, so just add a test for it if one is missing.

## Machine dashboard (MD-A)
8. The error banner flickers: `refresh()` sets `error: null` before every poll. Clear `error` only after a successful response.
9. The `formatDuration` units (`g`, `day/days`, …) move to i18n keys (it + en). There is no language detection in the helper: it takes `t` or the already-translated labels.
10. The temperature warning (≥ 65 °C) uses `colors.brand`, not `colors.ring`. Danger (≥ 75 °C) stays `destructive`.
11. `load`: render it only if `Array.isArray(data.load)`, otherwise "—".
12. Remove the defensive `sessionStore?.getState ? …` guards in `system.ts`. The store always exists.

## Tests
- One test per item above, wherever the item changes behaviour.
- The existing tests stay green.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- No edits to `mobile/vendor/**` or to server Python.
- Commit `fix(mobile): costs and machine dashboard review fixes`.
- Report in `mobile/docs/agy/reports/FX-1.md`.
