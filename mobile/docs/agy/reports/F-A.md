# F-A report — chat "Media e file" (gallery with a Files tab)

## Files Touched
- `mobile/src/screens/gallery/GalleryScreen.tsx`:
  - Added `ThreadFile` type (`url`, `name`, `kind`, `role`, `createdAt`).
  - Implemented `collectThreadFiles(messages, baseUrl): ThreadFile[]` covering `m.media` and `m.images`, de-duplicating by absolute URL while preserving message order.
  - Re-implemented `collectThreadImages` on top of `collectThreadFiles`.
  - Added helper functions `fileExt` and `fileIcon` mapping file kinds and extensions to `MaterialCommunityIcons` (`video`, `music-note`, `file-pdf-box`, `file-word-box`, `file-excel-box`, `file-powerpoint-box`, `file-outline`).
  - Added companion-style pill tabs at the top ("Immagini" and "File") using theme tokens (`card`, `muted`, `foreground`, `mutedForeground`), `th.font.medium`/`th.font.regular`, without `fontWeight`, and touch targets $\ge 48$ dp.
  - Automatically opens on "File" tab when chat has no images and has non-image files.
  - Implemented the Files list with icon, file name, sender subtitle ("Inviato da te" / "Dal bot"), and a share `IconButton` (`shareMedia`).
  - Row tap triggers `downloadMedia` and opens `/viewer` when `viewerKind(name) !== null`, or `openLocal` otherwise.
  - Empty states for both tabs ("Nessuna immagine in questa chat" / "Nessun file in questa chat").
  - URL capability safety: URLs are never logged, toasted, or leaked into route params.
- `mobile/src/screens/thread/ThreadScreen.tsx`:
  - Updated header condition to `hasFiles = collectThreadFiles(messages, "").length > 0`.
  - Updated header button icon to `"folder-multiple-image"` and label to `t("gallery.open")`.
- `mobile/src/i18n/it.json`:
  - Added `gallery.title` ("Media e file"), `gallery.open` ("Media e file"), `gallery.tabImages` ("Immagini"), `gallery.tabFiles` ("File"), `gallery.sentByUser` ("Inviato da te"), `gallery.sentByBot` ("Dal bot"), `gallery.emptyImages` ("Nessuna immagine in questa chat"), `gallery.emptyFiles` ("Nessun file in questa chat"), `gallery.share` ("Condividi").
- `mobile/src/i18n/en.json`:
  - Added `gallery.title` ("Media and files"), `gallery.open` ("Media and files gallery"), `gallery.tabImages` ("Images"), `gallery.tabFiles` ("Files"), `gallery.sentByUser` ("Sent by you"), `gallery.sentByBot` ("From bot"), `gallery.emptyImages` ("No images in this chat"), `gallery.emptyFiles` ("No files in this chat"), `gallery.share` ("Share").
- `mobile/test/screens/gallery-files.test.tsx`:
  - Created test suite verifying:
    - `collectThreadFiles` with mixture of media types (image, pdf, m4a, mp4), role extraction, URL deduplication, and order preservation.
    - `collectThreadImages` filtering on top of `collectThreadFiles`.
    - `GalleryScreen` default tab selection (opens on File tab when chat has only files).
    - File row tap downloading and navigating to `/viewer` for PDF.
    - `ThreadScreen` header button visibility for chats with non-image media vs no media.

## Dependencies
None added.

## TDD
- **RED phase:** Created `mobile/test/screens/gallery-files.test.tsx` specifying the expected behavior for `collectThreadFiles`, the Gallery screen tabs, PDF row interaction, and ThreadScreen header button. Tests failed as expected before implementation.
- **GREEN phase:** Implemented `collectThreadFiles` and companion pill tabbed view in `GalleryScreen.tsx`, updated `ThreadScreen.tsx` header condition and icon, and updated i18n dictionaries. All 5 tests in `test/screens/gallery-files.test.tsx` passed, existing tests in `test/screens/diffs-gallery.test.tsx` passed, and all 64 test suites across the project passed.

## Raw Output

`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest test/screens/gallery-files.test.tsx`:
```
PASS test/screens/gallery-files.test.tsx
  F-A: collectThreadFiles
    ✓ mixes user/assistant images, a PDF, an .m4a and an .mp4, checks kinds/roles, de-duplicates URL and keeps order (5 ms)
  F-A: GalleryScreen with Files tab
    ✓ with only files it opens on the File tab and shows file info (140 ms)
    ✓ the File row tap with a .pdf calls downloadMedia, then navigates to /viewer (5 ms)
  F-A: ThreadScreen header gallery button
    ✓ shows button with icon folder-multiple-image when chat has a PDF (non-image file) (51 ms)
    ✓ hides button when chat has no media at all (18 ms)

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        1.151 s, estimated 2 s
Ran all test suites matching /test\/screens\/gallery-files.test.tsx/i.
```

`npx tsc --noEmit`:
```
(clean - 0 errors)
```

`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` (whole suite):
```
PASS test/screens/composer.test.tsx
PASS test/state/fork-temp-workspace.test.ts
PASS test/settings/store.test.ts
PASS test/state/chats.test.ts
PASS test/ui/components.test.tsx
PASS test/extras/useEffort.test.tsx
PASS test/extras/m-b.test.tsx
PASS test/extras/widget.test.tsx
PASS test/state/sessionStore.test.ts
PASS test/core/profiles.test.ts
PASS test/settings/models-providers.test.ts
PASS test/core/upload.test.ts
PASS test/extras/native.test.tsx
PASS test/state/subagents.test.ts
PASS test/extras/effort.test.ts
PASS test/core/session.test.ts
PASS test/extras/notifier.test.ts
PASS test/extras/outbox.test.tsx
PASS test/ecosystem/channels.test.ts
PASS test/screens/thread.test.tsx
PASS test/extras/voice.test.ts
PASS test/vendor-smoke.test.ts
PASS test/ui/anyimage.test.tsx
PASS test/ui/botface.test.tsx
PASS test/platform.test.ts
PASS test/state/usage.test.ts
PASS test/settings/runtime-capabilities.test.ts
PASS test/extras/logic.test.ts
PASS test/screens/mainLayout.test.tsx
PASS test/vendorVersion.test.ts
PASS test/ecosystem/apps-skills-automations.test.ts
PASS test/ui/theme.test.ts
PASS test/ui/math.test.tsx
PASS test/state/thread.integration.test.ts
PASS test/fixes/m-a.test.tsx
PASS test/screens/gallery-files.test.tsx
PASS test/screens/diffs-gallery.test.tsx

Test Suites: 64 passed, 64 total
Tests:       552 passed, 552 total
Snapshots:   0 total
Time:        6.902 s
Ran all test suites.
```

## Requirements Breakdown & Implementation Citations

### 1. `collectThreadFiles(messages, baseUrl): ThreadFile[]`
- **Function and type definition:** `mobile/src/screens/gallery/GalleryScreen.tsx:41-96`. Iterates through messages and checks both `m.media` and `m.images`. Resolves absolute URLs, extracts `name` (falling back to `mediaName`), maps `kind` via `classify(item)`, attaches sender role and `createdAt`.
- **Deduplication and order:** `mobile/src/screens/gallery/GalleryScreen.tsx:50, 56-59, 75-78`. Uses `seenUrls` Set with absolute URLs, preserving message ordering.
- **`collectThreadImages`:** `mobile/src/screens/gallery/GalleryScreen.tsx:98-102`. Filters `collectThreadFiles` for `kind === "image"` and returns `{ url, name }`.

### 2. Gallery screen: "Media e file" with companion pill tabs
- **Header title:** `mobile/src/screens/gallery/GalleryScreen.tsx:189-194`. Uses `t("gallery.title")`.
- **Pill tabs:** `mobile/src/screens/gallery/GalleryScreen.tsx:197-251, 440-457`. Two tabs ("Immagini" and "File") in a pill container with `th.colors.muted`, selected tab on `th.colors.card`, `th.font.medium`/`th.font.regular`, minHeight 48 dp.
- **Default tab logic:** `mobile/src/screens/gallery/GalleryScreen.tsx:143-144`. Opens on "File" if chat has 0 images and $\ge 1$ other files.
- **Immagini tab:** `mobile/src/screens/gallery/GalleryScreen.tsx:254-311, 375-430`. Existing 3-column grid and full screen paging viewer. Empty state at lines 256-265.
- **File tab:** `mobile/src/screens/gallery/GalleryScreen.tsx:323-372`. FlatList displaying non-image files with icons (`fileIcon` mapping at lines 109-123: `video`, `music-note`, `file-pdf-box`, `file-word-box`, `file-excel-box`, `file-powerpoint-box`, `file-outline`), name, and "Inviato da te" / "Dal bot".
- **File tap & share actions:** `mobile/src/screens/gallery/GalleryScreen.tsx:156-176`. Tap downloads and opens `/viewer` if `viewerKind(name) !== null`, otherwise calls `openLocal`. Share button calls `downloadMedia` and `shareMedia`.
- **File tab empty state:** `mobile/src/screens/gallery/GalleryScreen.tsx:313-322`. Displays "Nessun file in questa chat" when no non-image files exist.

### 3. ThreadScreen header gallery button
- **Button condition:** `mobile/src/screens/thread/ThreadScreen.tsx:34, 50-56`. Checks `collectThreadFiles(messages, "").length > 0`.
- **Icon and label:** `mobile/src/screens/thread/ThreadScreen.tsx:52-54`. Icon `folder-multiple-image`, accessibilityLabel `t("gallery.open")`.

### 4. Capability safety & privacy
- **No URL leaks:** `mobile/src/screens/gallery/GalleryScreen.tsx:165, 174`. Error toasts use generic localized strings (`media.openFailed`, `media.shareFailed`) without logging or exposing the URL.

## What Could Not Be Verified
- **Physical device execution:** Nothing was tested on a physical Android/iOS phone or tablet. Actual opening of system viewers via `IntentLauncher.startActivityAsync`, the system share sheet via `Sharing.shareAsync`, and hardware rendering of large media files could not be checked in this headless Linux development environment.


## fix1: Review fixes (busy state, progress feedback, roles, dedupe, labels)

### Files Touched
- `mobile/src/screens/gallery/GalleryScreen.tsx`:
  - Added per-URL busy guard (`busyRef` and `busyUrls` state) preventing concurrent downloads from rapid double taps on the file row or share button.
  - Added progress feedback: renders `ActivityIndicator` in place of the file icon with accessibility label `media.opening`, and sets `loading={busy}` / `disabled={busy}` on the share `IconButton`.
  - Fixed sender role classification: only `m.role === "user"` maps to `"user"` ("Inviato da te"); `assistant`, `tool` and `system` all map to `"assistant"` ("Dal bot").
  - Fixed deduplication edge case: separate dedupe tracking for images (`seenImageUrls`) and other files (`seenOtherUrls`), so an image whose URL was first encountered in a non-image attachment is never lost.
- `mobile/src/i18n/en.json`:
  - Updated `gallery.open` to `"Media and files"`.
- `mobile/test/screens/diffs-gallery.test.tsx`:
  - Updated gallery label regex to `/gallery|media and files/i` to maintain compatibility with updated `gallery.open`.
- `mobile/test/screens/gallery-files.test.tsx`:
  - Added test verifying dedupe edge case where an image URL was first seen as a non-image file.
  - Added test verifying role mapping (`user` vs `assistant`, `tool`, `system`).
  - Added test for rapid double presses on the same PDF row (asserts `downloadMedia` and `router.push` called once, and `ActivityIndicator` with `media.opening` is displayed).
  - Added test for `openLocal` branch with `.zip` file (not supported by file viewer).
  - Added test for share button calling `shareMedia` once.
  - Updated header button test to explicitly assert `icon === "folder-multiple-image"`.

### TDD
- **RED phase:** Added new unit tests in `mobile/test/screens/gallery-files.test.tsx` for dedupe edge cases, non-user roles, rapid double-press busy guard, `openLocal`, and share button. Observed failures as expected.
- **GREEN phase:** Implemented the busy guard, progress indicator, role fix, and kind-grouped deduplication in `GalleryScreen.tsx`, updated `en.json`, and updated `diffs-gallery.test.tsx`. All 10 tests in `gallery-files.test.tsx` and all 64 test suites across the project passed.

### Raw Output

`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest test/screens/gallery-files.test.tsx`:
```
PASS test/screens/gallery-files.test.tsx
  F-A: collectThreadFiles
    ✓ mixes user/assistant images, a PDF, an .m4a and an .mp4, checks kinds/roles, de-duplicates URL and keeps order (3 ms)
    ✓ dedupe edge case: does not lose an image whose URL was first seen as a non-image file (4 ms)
    ✓ roles: only user maps to user, assistant, tool and system all map to assistant (1 ms)
  F-A: GalleryScreen with Files tab
    ✓ with only files it opens on the File tab and shows file info (151 ms)
    ✓ the File row tap with a .pdf calls downloadMedia, then navigates to /viewer (9 ms)
    ✓ two quick presses on the same PDF row: downloadMedia called once, progress feedback shown, router.push called once (24 ms)
    ✓ openLocal branch: file that viewer cannot show (.zip) calls openLocal and does not navigate (7 ms)
    ✓ share button calls shareMedia once and does not navigate (7 ms)
  F-A: ThreadScreen header gallery button
    ✓ shows button with icon folder-multiple-image when chat has a PDF (non-image file) (23 ms)
    ✓ hides button when chat has no media at all (8 ms)

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
Snapshots:   0 total
Time:        1.388 s, estimated 2 s
Ran all test suites matching /test\/screens\/gallery-files.test.tsx/i.
```

`npx tsc --noEmit`:
```
(clean - 0 errors)
```

`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` (whole suite):
```
PASS test/screens/composer.test.tsx
PASS test/state/fork-temp-workspace.test.ts
PASS test/settings/store.test.ts
PASS test/state/chats.test.ts
PASS test/ui/components.test.tsx
PASS test/extras/useEffort.test.tsx
PASS test/extras/m-b.test.tsx
PASS test/extras/widget.test.tsx
PASS test/state/sessionStore.test.ts
PASS test/core/profiles.test.ts
PASS test/settings/models-providers.test.ts
PASS test/core/upload.test.ts
PASS test/extras/native.test.tsx
PASS test/state/subagents.test.ts
PASS test/extras/effort.test.ts
PASS test/core/session.test.ts
PASS test/extras/notifier.test.ts
PASS test/extras/outbox.test.tsx
PASS test/ecosystem/channels.test.ts
PASS test/screens/thread.test.tsx
PASS test/extras/voice.test.ts
PASS test/vendor-smoke.test.ts
PASS test/ui/anyimage.test.tsx
PASS test/ui/botface.test.tsx
PASS test/platform.test.ts
PASS test/state/usage.test.ts
PASS test/settings/runtime-capabilities.test.ts
PASS test/extras/logic.test.ts
PASS test/screens/mainLayout.test.tsx
PASS test/vendorVersion.test.ts
PASS test/ecosystem/apps-skills-automations.test.ts
PASS test/ui/theme.test.ts
PASS test/ui/math.test.tsx
PASS test/state/thread.integration.test.ts
PASS test/fixes/m-a.test.tsx
PASS test/screens/gallery-files.test.tsx
PASS test/screens/diffs-gallery.test.tsx

Test Suites: 64 passed, 64 total
Tests:       557 passed, 557 total
Snapshots:   0 total
Time:        6.393 s
Ran all test suites.
```

### Requirements Breakdown & Implementation Citations

1. **Busy guard (`GalleryScreen.tsx`):**
   - Per-URL busy state tracking via `busyRef` and `busyUrls`: `mobile/src/screens/gallery/GalleryScreen.tsx:238-239`.
   - `handleOpenFile` and `handleShare` guard against concurrent execution: `mobile/src/screens/gallery/GalleryScreen.tsx:249, 269`.
   - Row pressable and share button disabled while busy: `mobile/src/screens/gallery/GalleryScreen.tsx:139-140, 196-197`.
2. **Progress feedback (`GalleryScreen.tsx`):**
   - Shows `ActivityIndicator` in place of the file icon with accessibility label `t("media.opening")`: `mobile/src/screens/gallery/GalleryScreen.tsx:151-163`.
   - Pass `loading={busy}` to the share `IconButton`: `mobile/src/screens/gallery/GalleryScreen.tsx:195-197`.
3. **Label in `en.json`:**
   - Updated `gallery.open` to `"Media and files"`: `mobile/src/i18n/en.json:464`.
4. **Roles mapping:**
   - Only `m.role === "user"` maps to `"user"` ("Inviato da te"); `assistant`, `tool` and `system` all map to `"assistant"` ("Dal bot"): `mobile/src/screens/gallery/GalleryScreen.tsx:54`.
5. **Dedupe edge case:**
   - Dedupe per kind group (`seenImageUrls` and `seenOtherUrls`), ensuring images with identical URLs to earlier non-image attachments are not dropped from `collectThreadImages`: `mobile/src/screens/gallery/GalleryScreen.tsx:51-52, 63-65, 83-84`.
6. **Tests:**
   - Assert `btn.props.children[0].props.name === "folder-multiple-image"`: `mobile/test/screens/gallery-files.test.tsx:489`.
   - Rapid double-press busy guard and progress feedback test: `mobile/test/screens/gallery-files.test.tsx:336-360`.
   - `openLocal` branch test: `mobile/test/screens/gallery-files.test.tsx:362-404`.
   - Share button test: `mobile/test/screens/gallery-files.test.tsx:406-449`.

### What Could Not Be Verified
- Real touch double-tap latency on a physical touch screen; actual Android system viewer launch for .zip files; native share sheet animations.
