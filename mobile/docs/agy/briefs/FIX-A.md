# FIX-A: final review fixes, thread/composer/core (owner: agy)

The final whole-branch review of Phases 2-4 is in `mobile/docs/agy/reviews/final-review-p234.md`. Read it first. Each finding has file:line, a failure scenario and a suggested fix. Also read `mobile/docs/agy/README.md`.

- **Branch:** `agy/FIX-A`, which Claude creates from `dev`.
- **Folder:** `nanobot_androidapp-agy`.
- **Before starting:** `cd mobile && npm ci`.

## Fix these findings
- **I1:** mentions leak across chats. Use `key={chatKey}` on Composer, and prune mentions in `handleSend`.
- **I2:** clear mentions and files only after `send` succeeds. On an upload failure, keep everything for retry.
- **I3:**
  - bind an upload batch to one session/connection: capture the token once, and abort if it changes;
  - add a timeout per file (60 s, or `limits`-based if provided) using AbortController;
  - a stalled or aborted upload sets `sendError` and never leaves `uploading` stuck.
- **I4:** a temporary chat must be discarded when leaving it via Back, even though the screen stays mounted. Use navigation focus/blur (`useFocusEffect`) or a beforeRemove listener, keeping the existing 300 ms `scheduleLeave` semantics.
- **I12 (security, was M1):** `app/viewer.tsx` and `FileViewer.tsx` must accept only `file://` URIs inside the app's media cache directory (the one `src/screens/thread/media/media.ts` downloads into). Also accept the artifact temp dir if the code-block preview uses one. Anything else shows "File non disponibile" / "File not available" and never reads, shares or opens it.
  - Put the check in one pure function, `isViewerUriAllowed(uri)`, with tests, including `../` traversal and percent-encoded `%2e%2e`.
  - NOTE: branch `agy/P5-V1` also edits `FileViewer.tsx`. Keep your change small and isolated (an early guard) so Claude can merge both.
- **M2:** `absoluteMediaUrl` passes `file:`, `content:` and `data:` URIs through unchanged.
- **M3:** in the upload IIFE in `threadStore`, check `rts.get(key) === rt` before `patch` or `sendMessage`.
- **M4:** session guards in `workspace.ts` (the `/api/workspaces` response and the scope timeout timer).
- **M5:** gen/active guards in `subagentsStore.cancelSubagent` and `SubagentThreadScreen`.
- **M6:** after `sendError` is shown once, clear it via a new store action `clearSendError(key)`.
- **M7:** add the session guard on the `refreshSettings` error branch.
- **M18:** remove the double `decodeURIComponent` in `app/gallery/[key].tsx`.
- **I13:** "keep current key" in `HintSecretField` (`settings/common.tsx`) must return to untouched, so the key is omitted from the payload. Saving must never send `api_key: ""` unless the user explicitly clears it, behind a confirm (check `CapabilitiesSection`).
- **I14:** the add-custom-provider sentinel must not collide with the built-in `custom` provider. Use a distinct sentinel value.
- **I15:** toasts must be visible above RN Modals (Sheet and Dialog). Render the ToastHost inside a top-level Modal-safe layer, or render a ToastHost inside Sheet and Dialog as well. Pick the simplest approach that works on Android, and test that a toast fired while a Sheet is open is rendered.
- **Settings minors:** M19 (render the settings load error with Retry), M20 (`restartState` resets after done), M21 (local service access confirm), M22 (`busy` per group), M23 (show unrendered field errors as a toast), M24 (clear the catalogue cache on profile switch), M25 (`router.back` falls back to `router.replace("/")` when `!canGoBack()`, in one helper).

## Hard rules
No `client.onChat` subscriber outside threadStore. Do not edit `mobile/vendor/**`. Never log URIs, tokens or secrets.

## Tests (write first)
Add one focused test per finding:
- I1: switching chatKey resets the picked mentions;
- I2: an upload failure keeps the mentions;
- I3: a stalled upload times out and `uploading` is false afterwards;
- I4: a blur on a temporary chat calls the discard;
- I12: `isViewerUriAllowed` table tests, and the viewer with a disallowed URI shows the error and does not read the file;
- M2, M3, M6: one each;
- I13: keep-current omits the key;
- I15: a toast is rendered while a Sheet is open.

## Done when
- In `mobile/`, `npx jest` and `npx tsc --noEmit` pass.
- Commit on `agy/FIX-A` as `fix(mobile): final review fixes for thread, composer and core`, with the report in `mobile/docs/agy/reports/FIX-A.md` listing each finding as fixed or not and why.
