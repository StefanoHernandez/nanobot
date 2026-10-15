# O-A: app fixes from the 2026-10-15 review (owner: agy)

Branch `agy/O-A`, created from `main`. Worktree `../nanobot-agy`.

## Read first
- `mobile/docs/agy/README.md`: the rules.
- `mobile/docs/agy/reviews/claude-review-2026-10-15.md`: rows 6-10 and 12.
- `mobile/docs/wiki/known-issues.md`.

## Scope (only these files)
- `src/screens/viewer/FileViewer.tsx`
- `src/screens/viewer/readingPages.ts`
- `src/screens/viewer/exportArtifact.ts`
- `src/screens/projects/ProjectDetailScreen.tsx`
- `src/screens/ecosystem/kanban/KanbanScreen.tsx`
- `src/screens/settings/DevicesCard.tsx`
- `src/screens/gallery/GalleryScreen.tsx`
- `src/screens/viewer/viewerLibs.ts` (tests hook only)
- `src/i18n/it.json` and `src/i18n/en.json`
- New tests under `test/`

Never edit `src/state/**`, `src/core/**` or `src/platform/**`.

## 1. Network permission is per version (review row 6)
`FileViewer.tsx:134` resets `network` only when `[name, opened?.id]` changes.
- Add the active version index to that reset.
- Also clear `fixError` when the version changes. Today a v1 error can be sent as "versione 2".
- Test: allow network on v1, tap "next version" → the network switch is off again and v2 renders without `connect-src https:`.

## 2. PDF export never loads remote content or runs scripts (row 7)
- `printDocument` (`exportArtifact.ts`) must inject the viewer CSP: `viewerCsp(false, false)` from `ArtifactWebView.tsx`, as a `<meta http-equiv="Content-Security-Policy">` at the start of `<head>`.
  - Apply it to every document it prints, including full HTML artifacts.
  - If the document has no `<head>`, wrap it in one.
- `markdownToPrintHtml` (`readingPages.ts:97-102`): stop relying on the regex sanitizer for safety. The CSP is the guard.
  - Still strip `<script>` and `on*=` attributes in every form, including `<svg/onload=…>` and `<img/src=x/onerror=…>`. Test those two strings.

## 3. Profile switch never shows the old server's data (row 8)
- `ProjectDetailScreen.tsx` `loadData`, `KanbanScreen.tsx` `load` and `DevicesCard.tsx` load: add a generation ref, plus an unmount flag.
  - Results apply only if the generation is still current, and only for the same `sessionStore` profile id that started the fetch.
- Copy the pattern from `src/projects/store.ts`, which already does this correctly.
- Test, for each screen: start a load, switch profile (`sessionStore.setState` with a new profile) and resolve the old fetch → the old data is not rendered.

## 4. Saving an artifact to a project twice (row 9)
`GalleryScreen.tsx:~391` calls `uploadProjectFile` without `overwrite`.
- On a `file_exists` error, show a confirm `Dialog` ("Il file esiste già: sovrascrivere?"). On confirm, retry with `overwrite: true`.
- Save the version the user is **viewing**, not always the latest.
- Test: first save ok; second save → dialog → confirm → upload called with overwrite.

## 5. Revoking this phone (row 10)
`DevicesCard.tsx`: if the device being revoked is this phone, the revoke `Dialog` shows an extra warning, `devices.revokeSelf` ("È questo telefono: verrai disconnesso"). Identify this phone by comparing the stored device id saved at pairing, if there is one. If no id is stored, skip the warning; do not guess.

## 6. Viewer libraries have no real test (row 12)
`viewerLibs.ts:60-64` stubs every library under jest.
- Add **one** test that loads the real Vega-Lite bundle text from `assets/viewers/` (fs read in the test) and checks:
  - the bundle is non-empty and defines its global;
  - the artifact shell for a Vega chart contains it.
- Same for Leaflet. No device or WebView execution needed.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- Commit `fix(mobile): per-version network, safe PDF export, profile-switch guards, artifact overwrite`.
- Report in `mobile/docs/agy/reports/O-A.md`, with each item mapped to file:line. Say nothing was run on a device.
