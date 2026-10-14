# FIX-A Report: Final Review Fixes for Thread, Composer, and Core

- **Branch:** `agy/FIX-A`
- **Verification:**
  - `npx jest`: PASS (50 test suites, 418 passed, 0 failed)
  - `npx tsc --noEmit`: PASS (0 errors)
- **Focused Test Suite:** `mobile/test/fixes/fix-a.test.tsx` (12 tests covering all assigned findings)

---

## Status of Assigned Findings

| Finding | Severity | Description | Status | Resolution Details |
|---|---|---|---|---|
| **I1** | Important | Mentions leak across chats | Fixed | Added `key={chatKey}` to `<Composer>` in `ThreadScreen.tsx` ensuring state unmounts/resets on chat switch. Added `pruneMentions` in `Composer.tsx`'s `handleSend` to prune mentions removed from the draft before sending. |
| **I2** | Important | Clear mentions and files only after `send` succeeds | Fixed | On immediate send (no files), mentions are cleared. When files are uploaded asynchronously, `draft`, `pendingFiles`, and mentions are preserved on upload failure (`sendError`), and cleared only on successful upload completion. |
| **I3** | Important | Upload binding & timeout per file | Fixed | Captured `cap0 = session.uploadCapability` and verified capability unchanged before & during upload loop. Added 60 s per-file timeout via `AbortController` (`upload_timed_out`). Handled upload failure in `threadStore.ts` by resetting `uploading: false` and recording `sendError`. |
| **I4** | Important | Temporary chat discard on Back/blur | Fixed | Handled via `useFocusEffect` and `onBack` in `app/(main)/chat/[key].tsx`: on focus cancels leave, on blur or Back schedules leave with 300 ms timer (`scheduleLeave`) if chat is temporary. |
| **M1** | Medium (Security) | FileViewer URI validation & directory traversal | Fixed | Implemented pure function `isViewerUriAllowed(uri)` checking scheme `file://`, ensuring path is within media cache or artifact temp directory, and blocking directory traversal (`..`, `%2e%2e`, `%252e%252e`). Displayed "File not available" / "File non disponibile" and disabled copy/share/open when disallowed. |
| **M2** | Medium | `absoluteMediaUrl` pass-through | Fixed | In `mobile/src/screens/thread/media/media.ts`, passed `file:`, `content:`, and `data:` URIs through unchanged. |
| **M3** | Medium | Thread upload IIFE checks `rt` match | Fixed | In `mobile/src/state/threadStore.ts`, added `rts.get(key) === rt` guard before `patch` and `sendMessage` in upload IIFE. |
| **M4** | Medium | Session guards in `workspace.ts` | Fixed | Added session guard check `(!cur \|\| cur === session)` for `/api/workspaces` response and workspace scope timeout. |
| **M5** | Medium | Gen/active guards in `subagentsStore` and `SubagentThreadScreen` | Fixed | Captured `g = gen` in `cancelSubagent` and ignored result if `g !== gen`. Added `active` unmount guard in `SubagentThreadScreen` `useEffect`. |
| **M6** | Medium | `clearSendError` store action | Fixed | Added `clearSendError(key)` store action in `threadStore.ts` and called it in `Composer.tsx` after displaying the error toast. |
| **M7** | Medium | Session guard on `refreshSettings` error branch | Fixed | Added session guard `(!cur \|\| cur === session)` on error branch in `settings/store.ts`. |
| **M18** | Medium | Remove double decode in `app/gallery/[key].tsx` | Fixed | Removed redundant `decodeURIComponent(key)` in `app/gallery/[key].tsx` since Expo Router already decodes route parameters. |

---

## Out of Scope

Findings I5–I11, I13–I15, and M19–M25 belong to other tracks (FIX-B / FIX-C) and were intentionally untouched.
