# T4 — fix round 1 (owner: agy)

Same branch `agy/T4`. Claude's review approved the screen. Before the merge, fix these three items:

1. **Unhandled errors in submit** (`ConnectScreen.tsx` ~46-51)
   - Problem: `profiles.save` (SecureStore) or `crypto.randomUUID` can throw. That becomes an unhandled promise rejection and the user gets no feedback.
   - Fix: add a `catch` that shows `toast.show(t("common.error"))`. **Never put the error text in the toast**, because it could contain the secret. Keep the existing `finally`.
2. **Duplicate profiles** (`ConnectScreen.tsx` ~29-48)
   - Problem: saving a URL that is already saved creates a second profile.
   - Fix: if a saved profile already has the same normalized `baseUrl`, **reuse its id** and update its name/secret instead of creating a new one.
   - Careful: if the secret field is empty and the existing profile `hasSecret`, keep the stored secret. Use `await profiles.getSecret(id)` and pass that value to `testConnection` and `profiles.save`, because calling `save` with an empty secret DELETES the stored secret.
3. **Autocorrect on URL/secret** (`ProfileForm.tsx`)
   - Fix: add `autoCorrect={false}`, `spellCheck={false}` and `autoComplete="off"` on the URL and secret fields. Note that `TextField` may need to forward these props. If `TextField` does not forward extra props, add the minimal pass-through in `mobile/src/ui/components/TextField.tsx`. That is your T2 file, so you may edit it.

## Tests (write first, see them fail)
- `profiles.save` rejects → a toast with the generic error is shown, nothing navigates, and the button is enabled again.
- An existing profile `{id:"p1", baseUrl:"https://h", hasSecret:true}` plus submit of `https://h/` with an empty secret → `profiles.save` is called with `id "p1"` and the secret returned by `getSecret("p1")`. No new id is created.

## Done when
`npx jest` and `npx tsc --noEmit` pass. Commit on `agy/T4` with `fix(mobile): connect screen error toast, dedupe by URL, no autocorrect`. Append a "Fix round 1" section with RAW output to `mobile/docs/agy/reports/T4.md`.
