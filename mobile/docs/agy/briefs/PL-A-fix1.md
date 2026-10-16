# PL-A-fix1: finish the prompt library (owner: agy)

The work on `agy/PL-A` is green (jest 733, tsc ok) but **not committed** and has no report.

**Do not rebase and do not merge main.** Stay on `agy/PL-A` as it is. Claude merges and resolves any conflicts.

## Fixes, before committing
1. `src/extras/prompts.ts`:
   - **One transport.** Remove the `session.get` attempt with `catch {}` followed by `fetch`. Use only the same `fetch` pattern as `approvals.ts` (`redirect: "error"`, `credentials: "omit"`). A failure must not produce a second request. Fix the tests to mock `fetch` only.
2. **Variable regex aligned with the server.**
   - Names may be up to 40 characters: `[A-Za-z_][A-Za-z0-9_ ]{0,39}?`, in both `fillPrompt` and `extractVariables`.
   - Test: a 41-character name is not a variable.
3. **`fillPrompt` reads only the values it was given.** Use `Object.hasOwn(values, name)`, never `values[name] !== undefined`. Test: `{{constructor}}` with empty values stays as is.
4. **`PromptPickerSheet`:**
   - if `projectsStore` is not loaded, load it before resolving the project;
   - remove the `typeof byPath === "function"` check;
   - an empty search result shows `prompts.noMatches` ("Nessun prompt trovato"), not `prompts.empty`;
   - "Salva bozza come prompt" is **disabled** (not hidden) when the draft is empty;
   - each row shows only the **first line** of the body.
5. **`PromptEditorSheet`:**
   - **do not trim the body** when saving; only check that it is not blank;
   - when editing an existing prompt, keep its `project_id` unless the user changes the switch. Never turn it global just because `projectId` is missing;
   - one refresh per save. Remove the duplicate between `promptsStore.refresh` and `onSaved`.
6. **Tests to strengthen:**
   - the project section: assert that the **global prompt is absent**;
   - the profile switch: make it hit the `profileId` guard. Change the profile without calling `reset()` (or check that it fails if the guard is removed);
   - remove the "overlapping act()" warnings: each interaction gets its own awaited `act`;
   - find the delete-confirm button by its role or label inside the `Dialog`, not by "the last match".

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- No edits to `mobile/vendor/**` or to server Python.
- **One** commit on `agy/PL-A`: `feat(mobile): prompt library`.
- Report in `mobile/docs/agy/reports/PL-A.md`, including a "fix1" section. Say nothing was run on a device or against a live server.
