# F-A: chat "Media e file" (gallery with a Files tab) (owner: agy)

Branch `agy/F-A`, created from `claude/projects`. Worktree `../nanobot-agy3`.

## Read first
- `mobile/docs/agy/README.md`: the rules.
- `mobile/docs/design/companion.md`: the design. Use tokens and `th.font.*` only, no `fontWeight`, and touch targets ≥ 48 dp.
- Reference code:
  - `src/screens/gallery/GalleryScreen.tsx`: `collectThreadImages`, the grid and the full-screen pager;
  - `src/screens/thread/media/media.ts`: `classify`, `mediaName`, `absoluteMediaUrl`, `downloadMedia`, `openLocal`, `shareMedia`;
  - `src/screens/thread/media/MediaViews.tsx` `FileCard`: how a file card downloads, then opens `/viewer` or shares.

## Scope (only these files)
- `src/screens/gallery/**`, `app/gallery/[key].tsx`
- `src/screens/thread/ThreadScreen.tsx`: only the header gallery button condition and its icon
- `src/i18n/it.json` and `src/i18n/en.json`
- New tests under `test/`

## What to build
The user wants, for each chat, one place with **every file sent or received**, not only images.

1. **`collectThreadFiles(messages, baseUrl): ThreadFile[]`** in `GalleryScreen.tsx`:
   - covers every `m.media` item (and `m.images`) that has a `url`;
   - `ThreadFile = { url, name, kind: "image" | "video" | "audio" | "file", role: "user" | "assistant", createdAt? }`;
   - de-duplicate by absolute URL and keep chat order;
   - keep `collectThreadImages` working (other code uses it). It can be implemented on top of the new function.
2. **The gallery screen becomes "Media e file"**, with two pill tabs at the top (companion style, same look as the ecosystem tabs):
   - **Immagini:** the current grid and pager, unchanged in behaviour (SVG through `AnyImage`).
   - **File:** a list of videos, audio and files.
     - Each row shows an icon by kind (`file-pdf-box`, `file-word-box`, `file-excel-box`, `file-powerpoint-box`, `music-note`, `video`, generic `file-outline`), the name, and "Inviato da te" / "Dal bot".
     - Tap: when `viewerKind(name)` is not null, download and open `/viewer`; otherwise `openLocal`. Same flow as `FileCard`.
     - A share icon button uses `shareMedia`.
     - Empty state: "Nessun file in questa chat".
   - The tab opens on "File" when the chat has no images.
3. **ThreadScreen header:** show the button when the chat has **any** file (`collectThreadFiles(...).length > 0`), not only images. Icon `folder-multiple-image`, label `gallery.open` → "Media e file".
4. **Rules:**
   - Media URLs are capabilities: never log them, never toast them, never put them in route params except the existing `/viewer` local-file flow.
   - All strings through i18n.

## Tests (write first)
- `collectThreadFiles`:
  - mixes user/assistant images, a PDF, an `.m4a` and an `.mp4`;
  - checks the kinds and roles;
  - de-duplicates the same URL;
  - keeps the order.
- **Gallery screen:**
  - with only files it opens on the File tab;
  - the File row tap with a `.pdf` calls the download, then navigates to `/viewer`. Mock `downloadMedia` and the router, not `collectThreadFiles`.
- **ThreadScreen:** a chat with only a PDF shows the header button; a chat with no media doesn't.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- Commit `feat(mobile): chat media and files view`.
- Report in `mobile/docs/agy/reports/F-A.md`. Say nothing was run on a device.
