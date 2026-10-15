# CO-A: costs, app side (owner: agy)

Branch `agy/CO-A`, from `main`. Worktree: whichever one is free. MD-A runs at the same time and also adds a settings section; Claude resolves the `SECTIONS` merge.

## Read first
- `nanobot/ext/costs.py`: the server API (read-only for you).
- `mobile/docs/agy/README.md` and `mobile/docs/design/companion.md`.
- `src/extras/approvals.ts`: copy how it fetches (URL, `Authorization`, `redirect: "error"`, `credentials: "omit"`, generation + profile guard) and how it sends one background notification.

## Server API (already built)
- `GET /api/ext/costs?days=30` (1–90) returns:
  ```
  { currency: "USD", today: "YYYY-MM-DD", today_cost_usd, total_cost_usd,
    days: [{ date, cost_usd, models: [{ provider, model, input_tokens, output_tokens,
             total_tokens, cache_read_tokens, cache_write_tokens, cost_usd | null }] }],
    unpriced_models: ["provider/model"],
    prices: { "provider/model" or "model": { input, output, cache_read?, cache_write? } },
    daily_cap_usd | null, alert_pct, alert: bool, over_cap: bool }
  ```
  - Prices are USD per 1M tokens.
  - A model's `cost_usd` is `null` when it has no price. Those models are not counted in the totals and are listed in `unpriced_models`.
  - `days` holds only days with usage.
- `POST /api/ext/costs/settings` takes any subset of `{ prices, daily_cap_usd: number | null, alert_pct: 1..100 }`. `prices` replaces the whole map. It returns `{ ok, prices, daily_cap_usd, alert_pct }`.
- The cap is **soft**: nothing is blocked on the server. The app only warns.

## Build
1. **`src/extras/costs.ts`**:
   - `fetchCosts(days)` and `saveCostSettings(partial)`;
   - a hook `useCosts(days)` that refreshes on mount and on pull-to-refresh, with no fast polling;
   - the generation and profile guard as in `approvals.ts`, with data cleared on profile switch.
2. **`src/screens/settings/CostsSection.tsx`**, a new settings section `costs` ("Costi"), added to `SECTIONS` in `SettingsScreen.tsx` right after `overview`, with icon `cash`. It shows:
   - **Header:** today's cost, plus the cap if set (`$1.20 / $5.00`) with a percent bar. The bar uses the `warning` colour when `alert` is set and `danger` when `over_cap` is set. Show the 7/30-day totals, picked with `Chips`.
   - **Daily bars:** one simple `View` bar per day for the chosen range, with no chart library and no gaps for days without data. Tapping a day shows that day's per-model list.
   - **Per model** (for the range): model name, tokens in/out and cost, sorted by cost. Unpriced models show the cost as "—" with an "Imposta prezzo" action.
   - **Unpriced banner:** if `unpriced_models` is not empty, a quiet card says "N modelli senza prezzo: i totali sono parziali".
   - **Prices editor:** a list of priced models, each with input, output and optional cache-read prices in USD per 1M tokens. Add, edit and delete go through a `Sheet` with numeric `TextField`s. The key is prefilled as `provider/model` when the sheet is opened from an unpriced model. Saving posts the full `prices` map.
   - **Cap:** a daily cap field (empty means no cap) and an alert % field (default 80), both saved on blur or confirm.
3. **Alert notification:** on each refresh, if the app is in background or this is not the costs screen, and `alert` or `over_cap` turns true for a `today` not yet notified, schedule one local notification (`costs.alertNotify` / `costs.overNotify`) on the existing channel. Keep one per day per kind, remembered in kv, never repeated. Refresh in background through the existing `usePolling` with `{ background: true }` at a slow interval: every **10 min**, mounted in `app/(main)/_layout.tsx` and only while a cap is set.
4. **Formatting:** dollar amounts through one helper: `$0.0042` below 1 cent, `$1.20` otherwise. Token counts are compact (`1.2M`, `340k`).
5. **Errors:** show `common.operationFailed`, never raw `err.message`. Keep the last good data on screen.
6. i18n keys go in both `it.json` and `en.json`. Use theme tokens and `th.font.*`, no `fontWeight`, touch targets ≥ 48dp.

## Tests (write first, no mocking of the hook or the section)
- The payload renders today, the cap bar and per-model sorting. An unpriced model shows "—" and the banner.
- Bar colour for normal, `alert` and `over_cap`.
- The range chips change the totals between 7 and 30 days, and missing days render as empty bars.
- The prices sheet posts the full map. Delete posts the map without that key. Opening it from an unpriced model prefills the key. Invalid numbers are refused on the client.
- Saving the cap posts the number. An empty field posts `null`. alert_pct 0 or 101 is refused.
- The notification fires once per day per kind, and is not fired when no cap is set.
- A profile switch mid-request drops the stale result.
- The money and token formatter edge cases.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- No edits to `mobile/vendor/**` or to server Python.
- Commit `feat(mobile): costs per model with daily cap alert`.
- Report in `mobile/docs/agy/reports/CO-A.md`. Say nothing was run on a device or against a live server.
