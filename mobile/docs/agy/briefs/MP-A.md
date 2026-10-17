# MP-A: a full model picker with every model the provider offers (owner: Grok)

Branch `grok/MP-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it says to always run. App only: no server changes.

## Today
In `mobile/src/screens/settings/ModelsSection.tsx` (`PresetEditor`), the "Model" text field shows suggestions under it:
- **The cap:** `allMatches.slice(0, MATCH_CAP)`, at most 30, with a line "Altri N modelli: scrivi per cercare".
- **Deferred providers:** for `ollama`, `openrouter` and `lm_studio`, nothing shows until 2 characters are typed.

The user wants to **see and scroll the whole list** of models the provider offers. OpenRouter alone has hundreds.

The catalog is already loaded in full: `useProviderModels(provider)` → `cat.models`. The gap is only in how the app shows it.

## The change
- **A "Scegli dalla lista" / "Choose from list" button** next to the Model field. It is shown only when the provider has a catalog (`catalogued`). It opens a new **model picker** in its own `Sheet` with `scroll={false}`.
- **The picker:**
  - **Search field** at the top. It filters by id and label, case-insensitive, and works from the first character for every provider: there is no 2-character rule in the picker.
  - **A counter:** "N modelli", or "N di M" while a search is active.
  - **The list is a `FlatList`**, virtualized, with every match and no cap. Each row shows:
    - the id;
    - the label, when it differs from the id;
    - the context window, when it is known (for example "200k").

    The current model has a ✓.
  - **Tapping a row** calls the existing `pickModel(id)`, which fills the name and the context window, then closes the picker.
  - **Loading:** a spinner while `cat.loading`.
  - **Error:** if the catalog is empty or failed, show a message with a "Riprova" button that calls `cat.refresh()`. Reuse the existing refresh.
  - **Height:** the list must scroll inside the sheet, with no nested ScrollView. Give the picker a fixed height, about 80% of the window.
- **The inline suggestions under the field:** keep them only as a **short autocomplete** while typing, up to 8. Remove the "Altri N modelli" line, because the picker replaces it. Keep the 2-character rule there for deferred providers.
- **Typing a model id by hand still works,** for models the catalog does not list.
- **i18n** in `it` and `en`. Remove `models.moreMatches` if it is no longer used.

## Tests (jest, `test/screens/models-settings.test.tsx`)
- With a catalog of 300 models, the picker shows the count "300", and a model near the end can be found by searching.
- Search filters by id and by label, and the counter shows "N di M".
- A deferred provider (`openrouter`) shows models in the picker without typing.
- Picking a row fills the Model field, and the context window when it is known, then closes the picker.
- An empty or failed catalog shows the retry button, and pressing it calls the refresh.
- The button is hidden when the provider has no catalog.
- Update the existing "30 matches" test to the new behavior: 8 inline suggestions, and no "more" line.

## Checks
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`

## Do not
- Add new dependencies.
- Edit server files or `mobile/vendor/**`.
- Import `@react-navigation/*`.

## Report
`mobile/docs/agy/reports/MP-A.md` with:
- the files you touched;
- the test numbers;
- any deviations.

Say what you could not check on a phone, such as scrolling a 300-model list.

Commit, push `grok/MP-A`, and give the last hash. Do not merge.
