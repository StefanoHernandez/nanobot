# MD-B report

Branch `agy/MD-B`, from `origin/main` (`bdc02ee4e`). Not merged.

App only. No server files touched. No thread screens touched (`ThreadScreen.tsx` etc.). No new dependencies. `mobile/vendor/**` was not edited.

## Summary of Completed Parts

### 1. Provider logos (`ProviderIcon.tsx` & bundled SVGs)
- Added bundled SVGs for `anthropic`, `openai`, `gemini`, and `deepseek` in `mobile/assets/providers/` alongside `provider-icons-NOTICE.txt`.
- Created `mobile/src/ui/ProviderIcon.tsx` using `react-native-svg` (`SvgXml`), supporting size, provider name normalization, and a colored circular letter-avatar fallback for custom or unbundled providers.
- Integrated `ProviderIcon` across:
  - `ProvidersPanel.tsx` provider rows.
  - `ModelsSection.tsx` configured provider Chips in `PresetEditor`.
  - `ModelsSection.tsx` call order list rows and disabled preset list rows.
  - `ModelsSection.tsx` `ModelPicker` header.
- Added `icon` support to `Button.tsx` and `React.ReactNode` title support to `Sheet.tsx` to display the logo in `ModelPicker`.
- Unit tests: `mobile/test/ui/provider-icon.test.tsx` (5 passed).

### 2. Model autofill from catalog
- Added `setByModel` translation string in `mobile/src/i18n/en.json` ("Set by the model") and `mobile/src/i18n/it.json` ("Impostato dal modello").
- In `ModelsSection.tsx` (`PresetEditor`), selecting a model from the inline list or picker, or typing an exact model ID from the catalog, automatically fills:
  - `contextWindowTokens` with helper text hint `models.setByModel`.
  - `maxTokens` with helper text hint `models.setByModel`.
  - Resets `reasoningEffort` to `""` if the new model does not support the currently selected effort.
- Typing in either field dismisses the helper hint immediately.
- Unit tests in `mobile/test/screens/models-settings.test.tsx` (3 passed).

### 3. Reasoning effort levels filtered by model catalog
- In `mobile/src/extras/effort.ts`, updated `loadEffortState` to query `loadProviderModels(provider)` using the shared cache from `mobile/src/settings/models.ts`.
- When the catalog lists specific `reasoning_efforts` for the model, those values take precedence and are sorted according to `sortEfforts`.
- If the catalog is unsupported or fails, falls back to the static `REASONING_EFFORT_MODELS` list.
- If the model does not support reasoning effort (empty list), returns `null` so the thread effort pill is hidden.
- Unit tests: `mobile/test/extras/effort.test.ts` (3 passed).

### 4. Default temperature for new presets
- Added `defaultTemperature()` (default 0.1, clamped 0.0–2.0, rounded to 1 decimal place) and `setDefaultTemperature(t)` to `mobile/src/settings/prefs.ts`.
- Added localized strings `defaultTemperature`, `decreaseTemp`, and `increaseTemp` to `mobile/src/i18n/it.json` and `mobile/src/i18n/en.json`.
- In `ModelsSection.tsx`:
  - Added a stepper row above "Add model" with `-` and `+` `IconButton` controls (disabled at 0.0 and 2.0 bounds) and formatted 1-decimal readout.
  - `PresetEditor` initializes `temp` with `preset?.temperature ?? prefs.defaultTemperature()` so new presets start with the preference while existing presets keep their configured value.
- Unit tests in `mobile/test/screens/models-settings.test.tsx` (3 passed).

---

## Files Changed and Created

### Created
- `mobile/assets/providers/anthropic.svg`
- `mobile/assets/providers/deepseek.svg`
- `mobile/assets/providers/gemini.svg`
- `mobile/assets/providers/openai.svg`
- `mobile/assets/providers/provider-icons-NOTICE.txt`
- `mobile/src/ui/ProviderIcon.tsx`
- `mobile/test/ui/provider-icon.test.tsx`
- `mobile/test/extras/effort.test.ts`
- `mobile/docs/agy/reports/MD-B.md`

### Modified
- `mobile/src/ui/components/Button.tsx`
- `mobile/src/ui/components/Sheet.tsx`
- `mobile/src/screens/settings/common.tsx`
- `mobile/src/screens/settings/ProvidersPanel.tsx`
- `mobile/src/screens/settings/ModelsSection.tsx`
- `mobile/src/settings/prefs.ts`
- `mobile/src/extras/effort.ts`
- `mobile/src/i18n/en.json`
- `mobile/src/i18n/it.json`
- `mobile/test/screens/models-settings.test.tsx`

---

## Verification Checks

```
cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 ./node_modules/.bin/jest
Test Suites: 123 passed, 123 total
Tests:       982 passed, 982 total
Snapshots:   0 total
Time:        12.88 s

cd mobile && ./node_modules/.bin/tsc --noEmit
(exit 0, no errors)

cd mobile && npx expo export --platform android --output-dir /tmp/nb-export
Android Bundled 18122ms index.js (2537 modules)
› Assets (70)
› android bundles (1)
› Files (1)
Exported: /tmp/nb-export
(exit 0, no errors)
```

## Deviations & Self-Checks

- Reused `react-native-svg` (`SvgXml`) which was already in `package.json`, ensuring zero new dependencies.
- Provider SVGs use SVGO-optimized vectors with bundled licenses documented in `provider-icons-NOTICE.txt`.
- Letter avatar fallback assigns deterministic background hues using a simple djb2 hash of the provider name.
- Preset editor helper hints ("Set by the model") are displayed using `TextField`'s existing `helper` prop.
- Catalog cache is shared via `loadProviderModels` from `models.ts` and cleared in test hooks (`clearCatalogCache()`).
- No server code, no thread screens, and no worktrees touched.
