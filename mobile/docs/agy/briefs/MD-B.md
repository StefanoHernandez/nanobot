# MD-B: model settings that fill themselves — logos, context window, effort per model, default temperature (owner: Grok)

**Start only after MP-A is merged.** It touches the same file. Branch `grok/MD-B`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires. **App only.**

## 1. Provider logos
- **Copy the four SVGs** from the upstream WebUI into `mobile/assets/providers/`:
  - `webui/src/assets/providers/anthropic.svg`;
  - `openai.svg`;
  - `gemini-color.svg`;
  - `deepseek-color.svg`.

  They come from LobeHub lobe-icons, MIT licence. Copy the notice in `webui/public/brand/provider-icons-NOTICE.txt` next to them.
- **New `ProviderIcon` component** in `src/ui/`:
  - it draws the matching SVG with `react-native-svg`, which is already installed (`src/ui/AnyImage.tsx` shows how);
  - for any other provider it draws a round **letter avatar**: the first letter of the label, with a color taken from a hash of the name.
  - **No remote favicons:** they would tell third-party services which providers the user has.
  - Map the provider names the way `webui/src/lib/provider-icons.ts` does.
- **Use it in:**
  - `ProvidersPanel.tsx`, on every provider row;
  - the provider `Chips` in the preset editor;
  - the model list rows (the preset's provider);
  - the model picker from MP-A, in its header.
- **Test:** a known provider renders its SVG, and an unknown one renders the letter.

## 2. The model fills its own numbers (`src/screens/settings/ModelsSection.tsx`, `PresetEditor`)
**Today:** the context window is filled only for a **new** preset picked from the list. It is never filled when the user edits an existing preset, types the exact id, or for `max_tokens`.

**Change:** whenever the model changes, whether picked from the list or typed to an exact catalog id, for a new or an existing preset:
- **Context window:** set it from the catalog `context_window`, when known.
- **Max tokens:** set `max_tokens` from the catalog when it is known. Check the field name in `ProviderModelSpec` (`nanobot/providers/registry.py`) and in the provider-models payload.
- **Effort:** if the chosen effort is not in the new model's `reasoning_efforts`, reset it to default.
- **No catalog value:** keep what the field has.
- **Hint:** show a small "Impostato dal modello" under a field filled this way. Typing in the field removes the hint.

**Tests:**
- editing an existing preset and picking another model updates the context window;
- typing an exact id fills it;
- an effort the new model does not have is reset.

## 3. The effort pill shows only the levels the chat's model has
**Today:** `src/extras/effort.ts` `loadEffortState` (around 210) uses the preset's `reasoning_effort_values`. The server builds those with a rough rule (`nanobot/webui/settings_models.py` `reasoning_effort_values_for`: low/medium/high by default). The real per-model list is in the provider catalog, `reasoning_efforts`, which the app already fetches with `useProviderModels` / `/api/settings/provider-models`.

**Change, in the app:**
- `loadEffortState` also loads the catalog for the base preset's provider. It uses the shared cache in `src/settings/models.ts`; do not re-fetch every time.
- When the catalog entry for that model has `reasoning_efforts`, **use those**, sorted with `sortEfforts`.
- Otherwise keep `reasoning_effort_values` as today.
- When the model has no levels at all, the pill stays hidden, as today.

**Tests:**
- the catalog levels win;
- without a catalog it falls back;
- an empty list hides the pill.

## 4. Default temperature for new presets
**Today:** a new preset starts at `0.1`, hardcoded in `PresetEditor`.

**Change:**
- add an app pref, "Temperatura predefinita", in `src/settings/prefs.ts`, default `0.1`, range 0–2, step 0.1;
- edit it in the Modelli section, above "Aggiungi modello", as a small numeric field or a stepper;
- `PresetEditor` uses it for **new** presets only; existing presets keep their value.

**Test:** a new preset starts at the pref value, and an existing preset keeps its own.

## Checks
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`

## Do not
- Add dependencies.
- Edit server files or `mobile/vendor/**`.
- Import `@react-navigation/*`.
- Fetch any remote image.

## Report
`mobile/docs/agy/reports/MD-B.md`, per part:
- the files;
- the tests;
- any deviations.

Commit, push `grok/MD-B`, and give the last hash. Do not merge.
