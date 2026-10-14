# FIX-A-fix1: complete FIX-A (owner: agy)

Your FIX-A commit fixed I1-I4, M2-M7, M18 and M20. However, **I13, I14, I15 and M19, M21-M25 are part of `mobile/docs/agy/briefs/FIX-A.md`** (see its "Settings minors" line and I13-I15). They are not out of scope: do them now. Work on the same branch, `agy/FIX-A`, in the folder `nanobot_androidapp-agy`. The details are in `mobile/docs/agy/reviews/final-review-p234.md`.

## To do
1. **I12 regression.** `dev` now contains P5-V1. The code-block artifact preview opens the viewer with `uri === ""`, and the content comes from `artifactStore` (`CodeBlock.tsx` ~56).
   - Your `isViewerUriAllowed` rejects `""`, so every code-block preview would show "File not available".
   - **First merge `dev` into your branch** (`git merge dev`), then resolve the conflict in `FileViewer.tsx` by keeping both sides:
     - keep dev's artifact routing (ArtifactWebView, artifactStore, artifactFallback, size routing);
     - keep your guard;
     - set `allowed` to true when `uri === "" && artifactStore.get()` returns content;
     - add `allowed` to the read-effect deps;
     - put the `!allowed` render branch before the artifact branches.
   - Remove the non-existent `/artifacts/` and `/temp/` prefixes, unless you can point to code that writes there.
   - For i18n conflicts, union the keys.
   - Also put the same guard at the route level in `app/viewer.tsx`: an early error view when not allowed.
2. **I13:** "keep current key" in `HintSecretField` (`src/screens/settings/common.tsx` ~56) and `CapabilitiesSection.tsx` ~206 must return the field to *untouched*, so the key is omitted from the payload. `api_key: ""` must never be sent unless the user explicitly clears it, behind a confirm.
3. **I14:** the add-custom-provider sentinel in `ProvidersPanel.tsx` ~23-46 must not collide with the built-in `custom` provider. Use a distinct sentinel, for example `"__new_custom__"`.
4. **I15:** toasts must be visible while a Sheet or Dialog (RN Modal) is open on Android. Pick one approach:
   - render a `ToastHost` inside `Sheet` and `Dialog`, as well as at the root, so the toast store renders in the top-most layer;
   - or move the toast into a Modal-safe overlay.

   Add a test: with a Sheet open, `toast.show("x")` renders `x`.
5. **M19:** the settings screens render the load `error`, with a Retry button.
6. **M21:** the "local service access" toggle in `NetworkSafetyCard.tsx` ~30 sits behind a confirm with risk text.
7. **M22:** `RuntimeConfigSection.tsx`: replace the single `busy` flag with a per-group one.
8. **M23:** `ProvidersPanel.tsx` ~94: server field errors for fields that are not rendered appear as a toast (generic i18n, not raw).
9. **M24:** clear the provider catalogue cache (`settings/models.ts` ~137) on profile switch.
10. **M25:** add one helper, `goBackOr(router, fallback="/")`, used by the settings and ecosystem back buttons (`canGoBack()` → `back()`, else `replace(fallback)`).
11. **M4 and M7 guard strength.** `!cur || cur === session` lets stale results in when the session became null. Use `cur === session` only.

## Tests (add, write first)
- I12: the code-block preview with `uri ""` and artifactStore content renders the preview, not the error; `isViewerUriAllowed` still rejects `content://`, `http://` and traversal.
- I13: keep-current omits the key from the payload.
- I14: choosing "add custom" does not open the built-in `custom` sheet.
- I15: a toast is shown while a Sheet is open.
- M21: the confirm appears before saving.

## Done when
- In `mobile/`, `npx jest` and `npx tsc --noEmit` pass.
- Commit on `agy/FIX-A` as `fix(mobile): complete final review fixes (settings, toasts, viewer guard)`. Append "fix1" to `mobile/docs/agy/reports/FIX-A.md` with each item and its file:line.
