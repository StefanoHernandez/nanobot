# MD-C: a clear "Attivo / Disattivato" switch on every model (owner: agy)

Branch `agy/MD-C`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires. **App only:** no server changes.

## Today (`mobile/src/screens/settings/ModelsSection.tsx`)
- The top list is the **call order**: index 0 is the primary model, the rest are fallbacks (`settings.model_call_order.update {order}`; server `settings_models.py:1332-1376`).
- Each row has ↑ ↓ and an **X**. The X takes the model out of the order, and it then appears under **"Disattivati"** with an "Aggiungi all'ordine" button (lines ~74-99).
- **The user did not understand that the X means "disable".** And a "disabled" model still shows in the chat model picker (`ModelBadge.tsx` `pickablePresets`) and in the task models (`TaskModels.tsx`).

## The change
1. **One list, one switch per model.**
   - Show **all** base presets (`visiblePresets`) in one list. Active ones first, in call order, with ↑ ↓; disabled ones after, greyed (opacity ~0.5), without arrows.
   - Each row has a `Switch` on the right: on = in the call order, off = not.
     - Off → `callOrderOps.remove`; on → `callOrderOps.add` (appends as the last fallback). Same `settings.model_call_order.update` call as today.
     - The **primary** (index 0) cannot be switched off: the switch is disabled and the row shows the "Principale" tag, as today. The same applies when it is the only active model.
   - Remove the X buttons, the separate "Disattivati" section and "Aggiungi all'ordine".
   - Under the list, one help line: "I modelli disattivati non vengono usati né proposti nelle chat. Il primo attivo è il principale."
   - Tapping a row still opens the editor (where Delete stays).
2. **Disabled models disappear from the pickers (mobile only).**
   - `ModelBadge` picker (`pickablePresets`): show only presets in the call order. **Exception:** if the chat currently uses a disabled preset, keep that one in the list, marked "(disattivato)", so the user sees where they are.
   - `TaskModels.tsx` (subagent, Dream, Diario): same rule — active presets plus the currently selected one.
   - The effort pill is unaffected.
   - Put the "is it active" rule in one helper in `src/settings/models.ts` (e.g. `activePresetNames(settings)`), used by all three places. Do not duplicate it.
3. **i18n** `it` and `en`. Remove the keys no longer used (`models.disabled`, the add-to-order label, …) only if nothing else uses them.

## Tests (jest)
- A row's switch off sends the order without it; on appends it.
- The primary's switch is disabled; with a single active model its switch is disabled too.
- Disabled rows render after the active ones and have no arrows.
- The chat picker hides disabled presets but keeps the chat's current one, marked.
- TaskModels follows the same rule.
- Update the existing tests that pressed the X or "Aggiungi all'ordine".

## Checks
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`

## Do not
- Edit server files or `mobile/vendor/**`. Add dependencies. Import `@react-navigation/*`.

## Report
`mobile/docs/agy/reports/MD-C.md`: files, tests, deviations, what needs a phone to check.

Commit, push `agy/MD-C`, and give the last hash. Do not merge.
