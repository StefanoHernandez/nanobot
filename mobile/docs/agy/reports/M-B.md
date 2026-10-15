# M-B report — outbox in other chats, offline new-chat intent, share merging

## Files Touched
- `mobile/src/extras/outbox.ts` (added `pendingByChat` memoized selector with comments explaining that chats not open are never sent to, made `threadStore` lazily loaded in `flushNext` to prevent circular test mock issues)
- `mobile/src/screens/chats/ChatRow.tsx` (added `outbox.pendingCount` pill using tokens `brandSoft`/`brandSoftForeground`, `th.font.medium`, min font size 11, without `fontWeight`)
- `mobile/src/screens/chats/ChatDrawer.tsx` (added `otherChats` line above chat list using `brandSoft`/`brandSoftForeground` when any other chat has a pending outbox, tapping navigates to the first such chat, with comment on no background sending)
- `mobile/app/new-chat.tsx` (subscribes to `sessionStore` when state is `connecting` or `reconnecting`, waits up to 15s for `open` with single-shot guard, on timeout or `offline`/`auth_error` redirects to `/` with `widget.offline` toast, cleans up timer and subscription on unmount)
- `mobile/src/extras/share.ts` (implemented `mergePendingShare` in `openPicker` joining texts with blank line and deduplicating files by URI; validated file sizes against `limits.max_file_bytes`, dropping oversized files with `extras.shareTooLarge` toast naming the file without URI)
- `mobile/src/extras/SharePickerSheet.tsx` (font size bumped to 13 and `fontFamily: th.font.regular` added to comply with companion design)
- `mobile/src/i18n/en.json` (added `outbox.pendingCount`, `outbox.otherChats`, `widget.offline`, `extras.shareTooLarge`)
- `mobile/src/i18n/it.json` (added `outbox.pendingCount`, `outbox.otherChats`, `widget.offline`, `extras.shareTooLarge`)
- `mobile/test/extras/m-b.test.tsx` (created: unit tests for `pendingByChat`, `ChatRow` pill, `ChatDrawer` other chats line, `new-chat` 15s timeout and transition to open, share text/file merging without duplicate URIs, and oversized file dropping with toast)

## Dependencies
None added.

## TDD
- **RED phase:** Created `mobile/test/extras/m-b.test.tsx` testing outbox pending counts, ChatRow pill, ChatDrawer other chats line, new-chat 15s timeout and reconnect transition, share merging and oversized file dropping. Tests initially failed.
- **GREEN phase:** Implemented the required behavior across `outbox.ts`, `ChatRow.tsx`, `ChatDrawer.tsx`, `new-chat.tsx`, `share.ts`, `SharePickerSheet.tsx`, and i18n files. All 7 tests in `test/extras/m-b.test.tsx` pass, and all 62 suites (536 tests) across the entire test suite pass.

## Raw Output

`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest test/extras/m-b.test.tsx`:
```
PASS test/extras/m-b.test.tsx
  M-B: Outbox pending in other chats
    ✓ pendingByChat counts per chat for active profile (2 ms)
    ✓ a ChatRow with 2 queued messages shows the pendingCount pill (45 ms)
    ✓ the drawer line appears only for chats other than the open one and tapping opens first such chat (191 ms)
  M-B: Widget/tile new chat while offline
    ✓ mounted with state reconnecting, then switched to open -> newChat is called once (6 ms)
    ✓ stays reconnecting for 15 s (fake timers) -> router.replace('/') and toast; newChat is not called (2 ms)
  M-B: Share merging and file size checks
    ✓ two shares (text plus file, then text plus another file) -> pending has both texts and both files without uri duplicates (4 ms)
    ✓ an oversized file is dropped with the toast (1 ms)

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
Snapshots:   0 total
Time:        1.242 s, estimated 2 s
Ran all test suites matching /test\/extras\/m-b.test.tsx/i.
```

`npx tsc --noEmit`:
```
(clean - 0 errors)
```

`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` (whole suite):
```
PASS test/screens/diffs-gallery.test.tsx
PASS test/screens/viewer.test.tsx
PASS test/ui/markdown.test.tsx
PASS test/screens/ecosystem-channels.test.tsx
PASS test/screens/ecosystem-automations.test.tsx
PASS test/screens/redesign-ecosystem.test.tsx
PASS test/screens/ecosystem-skills.test.tsx
PASS test/screens/chats.test.tsx
PASS test/extras/ui.test.tsx
PASS test/ecosystem/apps-skills-automations.test.ts
PASS test/extras/useEffort.test.tsx
PASS test/ecosystem/channels.test.ts
PASS test/screens/media.test.tsx
PASS test/state/fork-temp-workspace.test.ts
PASS test/ui/components.test.tsx
PASS test/screens/connect.test.tsx
PASS test/state/thread.integration.test.ts
PASS test/extras/speech.test.tsx
PASS test/state/subagents.test.ts
PASS test/screens/composer.test.tsx
PASS test/extras/m-b.test.tsx
PASS test/settings/models-providers.test.ts
PASS test/extras/voice.test.ts
PASS test/core/profiles.test.ts
PASS test/screens/history-error.test.tsx
PASS test/core/session.test.ts
PASS test/extras/effort.test.ts
PASS test/vendor-smoke.test.ts
PASS test/settings/store.test.ts
PASS test/extras/widget.test.tsx
PASS test/state/thread.test.ts
PASS test/core/upload.test.ts
PASS test/settings/runtime-capabilities.test.ts
PASS test/ui/math.test.tsx
PASS test/state/sessionStore.test.ts
PASS test/platform.test.ts
PASS test/vendorVersion.test.ts
PASS test/ui/botface.test.tsx
PASS test/ui/anyimage.test.tsx
PASS test/extras/notifier.test.ts
PASS test/state/usage.test.ts
PASS test/ui/theme.test.ts
PASS test/state/chats.test.ts
PASS test/extras/logic.test.ts
PASS test/screens/mainLayout.test.tsx
PASS test/screens/thread.test.tsx
PASS test/extras/outbox.test.tsx

Test Suites: 62 passed, 62 total
Tests:       536 passed, 536 total
Snapshots:   0 total
Time:        6.226 s, estimated 7 s
Ran all test suites.
```

## Requirements Breakdown & Implementation Citations

### 1. Outbox: show queues of other chats (do not auto-send them)
- **`pendingByChat(state): Record<string, number>` selector:** `mobile/src/extras/outbox.ts:136-156`. Counts per chat for `activeProfileId`, returns `{}` when no active profile. Memoized by reference to prevent React `useSyncExternalStore` maximum update depth loops.
- **Do not send to chats that are not open:** Documented in comments at `mobile/src/extras/outbox.ts:136` and `mobile/src/screens/chats/ChatDrawer.tsx:50`.
- **`ChatRow` pending pill:** `mobile/src/screens/chats/ChatRow.tsx:21, 30-43`. Displays `outbox.pendingCount` ("{{count}} in attesa" / "{{count}} queued") using `brandSoft`/`brandSoftForeground`, `th.font.medium`.
- **`ChatDrawer` other chats line:** `mobile/src/screens/chats/ChatDrawer.tsx:51-53, 63-69, 103-130`. Shows `outbox.otherChats` banner when any chat other than the open one has a queue. Tapping it opens the first such chat and closes the drawer.

### 2. Widget/tile "new chat" while offline
- **Connecting/reconnecting wait logic:** `mobile/app/new-chat.tsx:49-67`. Shows "opening new chat…" loading screen and subscribes to `sessionStore`, with a 15 s timeout and single-shot guard (`handledRef`). Transitions to `open` call `handleNewChatIntent()` once.
- **Timeout and offline/auth_error redirection:** `mobile/app/new-chat.tsx:37-43, 52-57`. Redirects to `/` and triggers `toast.show(t("widget.offline"))`.
- **Cleanup on unmount:** `mobile/app/new-chat.tsx:64-67`. Unsubscribes from `sessionStore` and clears timer.

### 3. Share: merging and file size checks
- **Share merging without overwrite:** `mobile/src/extras/share.ts:16-29, 61-64`. In `openPicker`, merges incoming payload into `shareStore.pending`: texts are joined with a blank line (`\n\n`), files concatenated without duplicate URIs.
- **File size check at share time:** `mobile/src/extras/share.ts:124-142`. Validates each file against `limits.max_file_bytes` (from `session.limits` or `DEFAULT_LIMITS`). Oversized files are dropped with toast `extras.shareTooLarge` naming the file (`name`) without the URI.

## What Could Not Be Verified
- **Device execution:** Nothing was checked on a physical Android device or emulator. Real share intents from third-party Android apps and physical quick settings tile taps could not be tested in this headless environment.
