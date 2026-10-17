# MD-C report: On/off switch on models and picker visibility

Branch `agy/MD-C`, created from `origin/main`. App only: no server files touched. No automations files touched. No new dependencies. No `@react-navigation/*` imports. `mobile/vendor/**` was not edited.

## Summary of Changes

### 1. Unified Models List with On/Off Switch (`ModelsSection.tsx`)
- Combined call order and disabled presets into one list showing all base presets from `visiblePresets(data)`:
  - Active presets render first, in call order, with `chevron-up` and `chevron-down` reordering arrows.
  - Disabled presets render after the active ones, greyed with `opacity: 0.5`, without arrows.
  - Each row has a `Switch` on the right:
    - Turning off an active fallback removes it via `callOrderOps.remove(order, i)`.
    - Turning on a disabled model appends it to the end via `callOrderOps.add(order, preset.name)`.
    - The primary model (index 0) and single active model cannot be switched off: switch is disabled (`disabled={busy || !editable || (r.active && (r.index === 0 || order.length <= 1))}`) and shows the "Principale" tag.
  - Removed X buttons (`IconButton icon="close"`), the separate "Disattivati" section, and "Aggiungi all'ordine" buttons.
  - Tapping any row opens the preset editor where deleting secondary models remains functional.
  - Added help line under the list: *"I modelli disattivati non vengono usati né proposti nelle chat. Il primo attivo è il principale."* / *"Disabled models are not used or proposed in chats. The first active model is the primary."*

### 2. Active Preset Helper (`src/settings/models.ts`)
- Added `activePresetNames(settings)`:
  - Returns `Set<string>` of active preset names based on `model_call_order`.
  - Shared across `ModelsSection.tsx`, `ModelBadge.tsx`, and `TaskModels.tsx`.

### 3. Disabled Models Hidden from Pickers (`ModelBadge.tsx` and `TaskModels.tsx`)
- **Chat Model Picker (`ModelBadge.tsx`)**:
  - `pickablePresets(presets, settings, currentPreset)`: filters presets to only include active presets in call order.
  - Exception: if the chat currently uses a disabled preset, it is kept in the list.
  - When rendered in the sheet, any disabled preset is marked with `(disattivato)` (IT) / `(disabled)` (EN).
- **Task Models Picker (`TaskModels.tsx`)**:
  - Options list consists of "Same as chat" (`null`), followed by active presets in call order.
  - If the task currently has a disabled preset selected, it is kept in the list, marked with `(disattivato)` (IT) / `(disabled)` (EN).
  - Other disabled presets do not appear in the sheet.

### 4. Localized Strings (`it.json` & `en.json`)
- Added:
  - `models.help`: explanation under the models list.
  - `models.disabledTag`: localized tag `disattivato` / `disabled`.
- Removed no longer used keys:
  - `models.disabled`
  - `models.addToOrder`
  - `models.remove`

---

## Self-Check Against Brief Requirements

| Brief Item | Implemented In | Description |
|---|---|---|
| One list showing all base presets, active first in call order with arrows, disabled after (greyed opacity ~0.5, no arrows) | `mobile/src/screens/settings/ModelsSection.tsx:49-74`, `107-133` | Single list from `allRows` combining active and disabled base presets with opacity and conditional arrows. |
| Switch on each row: off -> `callOrderOps.remove`, on -> `callOrderOps.add` | `mobile/src/screens/settings/ModelsSection.tsx:125-139` | `Switch` toggles between callOrderOps add and remove. |
| Primary switch disabled, single active model switch disabled, shows "Principale" tag | `mobile/src/screens/settings/ModelsSection.tsx:69-73`, `127` | Primary row displays badge; switch disabled when `r.index === 0 \|\| order.length <= 1`. |
| Remove X buttons, separate "Disattivati" section and "Aggiungi all'ordine" | `mobile/src/screens/settings/ModelsSection.tsx:84-143` | Cleaned up separate section and removed X button. |
| Help line under list | `mobile/src/screens/settings/ModelsSection.tsx:145-147` | Muted help text placed directly below the card. |
| Tapping row opens editor | `mobile/src/screens/settings/ModelsSection.tsx:106` | `onPress={() => setEditing(r.preset)}` on every row. |
| Helper in `src/settings/models.ts` used by all 3 places | `mobile/src/settings/models.ts:110-118`, `ModelsSection.tsx:35`, `ModelBadge.tsx:101`, `TaskModels.tsx:86` | `activePresetNames` defined once and imported in all three places. |
| `ModelBadge` hides disabled presets, keeps chat's current preset marked `(disattivato)` | `mobile/src/screens/thread/ModelBadge.tsx:13-44`, `102`, `134-146` | `pickablePresets` respects call order, keeps current disabled, and displays tag. |
| `TaskModels.tsx` hides disabled presets, keeps selected marked | `mobile/src/screens/settings/TaskModels.tsx:86-101`, `118-124` | Filters by active in call order, appends current if disabled with tag. |
| i18n cleanup & additions | `mobile/src/i18n/it.json:499-500`, `mobile/src/i18n/en.json:499-500` | Added `help` and `disabledTag`, removed `disabled`, `addToOrder`, and `remove`. |

---

## Files Changed

- `mobile/src/settings/models.ts`
- `mobile/src/i18n/it.json`
- `mobile/src/i18n/en.json`
- `mobile/src/screens/settings/ModelsSection.tsx`
- `mobile/src/screens/thread/ModelBadge.tsx`
- `mobile/src/screens/settings/TaskModels.tsx`
- `mobile/test/screens/models-settings.test.tsx`
- `mobile/test/screens/model-badge.test.tsx`
- `mobile/docs/agy/reports/MD-C.md`

---

## Verification Evidence

### 1. Jest Tests
```
cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest
Test Suites: 126 passed, 126 total
Tests:       1012 passed, 1012 total
Snapshots:   0 total
Time:        13.145 s
Ran all test suites.
```

Targeted suites:
- `test/screens/models-settings.test.tsx`: 37 passed
- `test/screens/model-badge.test.tsx`: 5 passed
- `test/screens/thread-header-model.test.tsx`: 3 passed
- `test/settings/models-providers.test.ts`: 20 passed

### 2. TypeScript Typecheck
```
cd mobile && npx tsc --noEmit
(exit 0, no errors)
```

### 3. Release Export Build
```
cd mobile && npx expo export --platform android --output-dir /tmp/nb-export
Android Bundled 21090ms index.js (2539 modules)
Export was successful.
(exit 0, no errors)
```

---

## Deviations

None. All constraints and behaviors from `mobile/docs/agy/briefs/MD-C.md` were implemented exactly as specified.

---

## What Could Not Be Verified on PC (Needs Phone to Check)

- Physical touch interaction with the switch toggles on Android hardware.
- Native rendering of opacity (0.5) and switch track animations on device display.
