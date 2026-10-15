# F-A-fix1: chat media and files, review fixes (owner: agy)

Same branch `agy/F-A`, same worktree `../nanobot-agy3`. The review of commit `1445e9fb` found the issues below. Write the tests first.

## Important
1. **No busy guard (`GalleryScreen.tsx` ~156-176).** `handleOpenFile` and `handleShare` start a download on every tap. A double tap downloads twice (both write the same `.part`) and can push `/viewer` twice.
   - Keep a busy state per row, keyed by the file URL: while a row is busy, ignore taps on it and on its share button. `FileCard` (`MediaViews.tsx` ~130-147) is the model.

   **Test:** two quick presses on the same PDF row → `downloadMedia` is called once and `router.push` once.
2. **No progress feedback (~329-378).** While a row is downloading, show an `ActivityIndicator` in place of its icon, with accessibility label `media.opening`, and put `loading` on its share button.

## Minor (fix these)
3. **Label:** `en.json` `gallery.open` becomes "Media and files".
4. **Roles (~54):** only `"user"` maps to "Inviato da te". `assistant`, `tool` and `system` all show "Dal bot".
5. **Dedupe edge case (~51):** `collectThreadImages` must not lose an image whose URL was first seen as a non-image file. Dedupe per kind group, or build the images list independently.
6. **Tests:**
   - the header button test asserts the icon name, not only the label;
   - add a test for the `openLocal` branch (a file the viewer can't show, e.g. `.zip`);
   - add a test for the share button (calls `shareMedia` once).

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- Commit `fix(mobile): media and files busy state, progress, labels`.
- Append a "fix1" section to `mobile/docs/agy/reports/F-A.md`.
