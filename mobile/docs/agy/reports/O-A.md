# O-A Report: App Fixes from 2026-10-15 Review

- **Branch:** `agy/O-A`
- **Verification:**
  - `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`: PASS (85 test suites, 689 passed, 0 failed)
  - `npx tsc --noEmit`: PASS (0 errors)
- **Focused Test Suite:** `mobile/test/screens/o-a.test.tsx` (12 passed, 0 failed)

---

## Files Changed and Created

### Created
1. `mobile/test/screens/o-a.test.tsx` — Comprehensive test suite covering all 6 brief requirements:
   - Task 1: per-version network switch reset and clearing of `fixError`.
   - Task 2: CSP injection in `printDocument` and regex stripping of `<svg/onload=...>` and `<img/src=x/onerror=...>`.
   - Task 3: profile switch guards dropping stale async responses for `ProjectDetailScreen`, `KanbanScreen`, and `DevicesCard`.
   - Task 4: saving currently viewed artifact version, `file_exists` conflict confirmation dialog, and retry with overwrite.
   - Task 5: `devices.revokeSelf` warning when revoking the paired phone device ID.
   - Task 6: `setViewerLibForTest` / `clearViewerLibsForTest`, real file load verification for Vega-Lite and Leaflet vendor bundles into HTML shells.
2. `mobile/docs/agy/reports/O-A.md` — This report.

### Modified
1. `mobile/src/screens/viewer/FileViewer.tsx` — Added `versionIndex` to network reset effect; resets `network(false)`, `askNetwork(false)`, and `fixError(null)`; updates `artifactStore` index on version navigation.
2. `mobile/src/screens/viewer/exportArtifact.ts` — Imports `viewerCsp` from `ArtifactWebView.tsx` and injects `viewerCsp(false, false)` into `<head>` (wrapping if missing) for all printed documents.
3. `mobile/src/screens/viewer/readingPages.ts` — Enforces CSP in print html and updates regex sanitizer to strip `[\s/]+(on[a-z0-9_-]+)\s*=` including `<svg/onload=...>` and `<img/src=x/onerror=...>`.
4. `mobile/src/screens/projects/ProjectDetailScreen.tsx` — Added `genRef`, `mountedRef`, and validation against `sessionStore.getState()?.profile?.id` to ignore stale server responses upon profile switch.
5. `mobile/src/screens/ecosystem/kanban/KanbanScreen.tsx` — Added `genRef`, `mountedRef`, and `profile.id` validation in `load()` to prevent stale kanban snapshots.
6. `mobile/src/screens/settings/DevicesCard.tsx` — Added `genRef`, `mountedRef`, and `profile.id` guard in `load()`; added `getStoredPhoneDeviceId()` to show `devices.revokeSelf` warning when revoking current device.
7. `mobile/src/screens/gallery/GalleryScreen.tsx` — Saves viewed version via `artifactStore.get()?.index`; handles `file_exists` error by prompting overwrite confirmation `Dialog` and retrying with `overwrite: true`.
8. `mobile/src/screens/viewer/viewerLibs.ts` — Exported `setViewerLibForTest` and `clearViewerLibsForTest` test hooks.
9. `mobile/src/i18n/it.json` — Added `devices.revokeSelf`, `gallery.fileExistsConfirm`, and `gallery.overwrite`.
10. `mobile/src/i18n/en.json` — Added `devices.revokeSelf`, `gallery.fileExistsConfirm`, and `gallery.overwrite`.
11. `mobile/test/screens/export-artifact.test.ts` — Updated print test expectation to verify CSP meta injection into full HTML documents.

---

## Brief Items Implementation Details

| Item | Requirement | Implementation Details | File:Line |
|---|---|---|---|
| **1. Network permission per version** | `FileViewer.tsx:134`: reset network and clear `fixError` on version change | Added `versionIndex` to `useEffect` dependency array; resets `network(false)`, `askNetwork(false)`, and `setFixError(null)`; syncs active `versionIndex` in `artifactStore` | `mobile/src/screens/viewer/FileViewer.tsx:136,255` |
| **2. PDF export CSP & Sanitization** | `printDocument` injects `viewerCsp(false, false)` into `<head>`; strip `<svg/onload=...>` & `<img/src=x/onerror=...>` | `printDocument` injects viewer CSP at the start of `<head>` (wrapping in `<head>` if missing); `stripDangerousHtml` updated regex to `[\s/]+(on[a-z0-9_-]+)\s*=` and pre-sanitizes raw markdown before marked parse | `mobile/src/screens/viewer/exportArtifact.ts:44-65`<br>`mobile/src/screens/viewer/readingPages.ts:60,86-90` |
| **3. Profile switch guards** | `ProjectDetailScreen`, `KanbanScreen`, `DevicesCard`: generation ref, unmount flag, check profile id | Added `genRef`, `mountedRef`, and `sessionStore.getState()?.profile?.id === profileId` checks before applying responses in all 3 screens | `mobile/src/screens/projects/ProjectDetailScreen.tsx:92-101,133-155`<br>`mobile/src/screens/ecosystem/kanban/KanbanScreen.tsx:36-44,60-84`<br>`mobile/src/screens/settings/DevicesCard.tsx:37-45,48-63` |
| **4. Artifact save overwrite** | `GalleryScreen.tsx`: on `file_exists`, confirm Dialog and retry with `overwrite: true`; save viewed version | `resolveArtifactForUpload` resolves viewed version from `artifactStore.get()?.index`; catches `file_exists` error and presents confirmation Dialog; on confirm calls `uploadProjectFile(..., overwrite: true)` | `mobile/src/screens/gallery/GalleryScreen.tsx:255-274,344-345,413-440,738-751` |
| **5. Revoking this phone warning** | `DevicesCard.tsx`: if revoked device is this phone, Dialog shows `devices.revokeSelf` ("È questo telefono: verrai disconnesso") | `getStoredPhoneDeviceId()` checks `session.deviceId`, `profile.deviceId`, and `kv.get("device.id")`; appends `devices.revokeSelf` if matching device ID; skips without guessing if absent | `mobile/src/screens/settings/DevicesCard.tsx:22-31,86-90,124-126`<br>`mobile/src/i18n/it.json:303`<br>`mobile/src/i18n/en.json:303` |
| **6. Viewer libraries real tests** | Load real Vega-Lite & Leaflet bundles from `assets/viewers/`, check non-empty, globals, and shell embed | Exported `setViewerLibForTest` / `clearViewerLibsForTest`; added automated tests reading `assets/viewers/vega-lite.min.vendorjs` and `assets/viewers/leaflet.vendorjs`, asserting `vegaLite` and `L` globals and shell embedding | `mobile/src/screens/viewer/viewerLibs.ts:32-38`<br>`mobile/test/screens/o-a.test.tsx:600-631` |

---

## What Could Not Be Verified

- **Physical Device & Real Server Execution:** Nothing was run on a physical Android or iOS device, nor connected to a live nanobot backend.
- Verified in testing environment via:
  - Focused Jest test suite `mobile/test/screens/o-a.test.tsx` (12/12 passing).
  - Full Jest test suite: 85 test suites, 689 passing, 0 failing.
  - TypeScript strict typecheck: `npx tsc --noEmit` clean with 0 errors.

---

## Raw Command Outputs

### 1. `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest test/screens/o-a.test.tsx`
```text
PASS test/screens/o-a.test.tsx
  O-A Task 1: Network permission is per version & fixError cleared
    ✓ allowing network on v1, tapping next version resets network and clears fixError (246 ms)
  O-A Task 2: PDF export & Markdown print sanitization
    ✓ printDocument injects viewerCsp(false, false) into head (1 ms)
    ✓ markdownToPrintHtml strips <svg/onload=...> and <img/src=x/onerror=...> (5 ms)
  O-A Task 3: Profile switch guards against stale server responses
    ✓ ProjectDetailScreen drops response if profile switched during load (3 ms)
    ✓ KanbanScreen drops snapshot if profile switched during load (14 ms)
    ✓ DevicesCard drops device list if profile switched during load (2 ms)
  O-A Task 4: Saving viewed version & conflict overwrite dialog
    ✓ saves viewed version (not latest), handles file_exists with confirm dialog and retry with overwrite (60 ms)
  O-A Task 5: Revoking this phone warning
    ✓ shows devices.revokeSelf warning when revoking this phone (matching stored id) (7 ms)
    ✓ skips warning if device id does not match or no stored id (5 ms)
  O-A Task 6: Viewer libraries bundle verification and test hooks
    ✓ setViewerLibForTest and clearViewerLibsForTest work correctly
    ✓ Vega-Lite real bundle is non-empty, defines vegaLite, and chart shell embeds it (2 ms)
    ✓ Leaflet real bundle is non-empty, defines global L, and map shell embeds it (1 ms)

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        1.306 s, estimated 2 s
Ran all test suites matching /test\/screens\/o-a.test.tsx/i.
```

### 2. Full Test Suite (`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`)
```text
Test Suites: 85 passed, 85 total
Tests:       689 passed, 689 total
Snapshots:   0 total
Time:        7.498 s
Ran all test suites.
```

### 3. `npx tsc --noEmit`
```text
(Clean exit with code 0 - no errors or warnings reported)
```
