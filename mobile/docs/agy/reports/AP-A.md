# AP-A report — approvals from the phone, app side

## Files Touched
- `mobile/src/extras/approvals.ts` (created: Zustand store `approvalsStore`, API calls `fetchApprovals`, `decideApproval`, `setApprovalsEnabled`, `forgetApproval`, helper `chatLabelFor`, background local notification dispatch without command text, generation/profile switch clearing, and `useApprovalsPolling` hook)
- `mobile/src/extras/ApprovalCard.tsx` (created: `Sheet` modal displaying oldest pending approval, chat label, countdown timer, selectable monospace command card, and buttons Consenti / Nega / Consenti sempre in questa chat with optimistic removal and 404 expired toast)
- `mobile/src/screens/settings/ApprovalsCard.tsx` (created: security settings section with enable switch, always-allowed chat list, and removal confirmation Dialog)
- `mobile/src/screens/settings/AppearanceSection.tsx` (mounted `<ApprovalsCard />`)
- `mobile/app/(main)/_layout.tsx` (mounted `useApprovalsPolling()` and `<ApprovalCard />`)
- `mobile/src/i18n/it.json` (added Italian translations under `approvals`)
- `mobile/src/i18n/en.json` (added English translations under `approvals`)
- `mobile/test/extras/approvals.test.tsx` (created: TDD test suite covering polling store mapping, profile-switch reset, card rendering & actions, 404 toast handling, settings toggle & forget confirmation, and background notification privacy)

## Dependencies
None added.

## TDD
- **RED phase:** Wrote `mobile/test/extras/approvals.test.tsx` with tests for:
  1. Polling mapping GET payload into the store, and profile switch clearing it.
  2. Card rendering summary and chat label; Allow, Deny, and Always posting correct bodies; advancing to next pending item.
  3. A 404 on decide showing the expired toast and moving on.
  4. The toggle posting settings, Remove prompting confirm Dialog and posting forget.
  5. A new pending id while `AppState` is background scheduling exactly one notification with no command text in it.
  Ran `npx jest test/extras/approvals.test.tsx`: failed as expected because implementation files did not exist.
- **GREEN phase:** Implemented `approvals.ts`, `ApprovalCard.tsx`, `ApprovalsCard.tsx`, integrated into `AppearanceSection.tsx` and `app/(main)/_layout.tsx`, and updated i18n dictionaries. All 5 tests pass, and all 85 suites (682 tests) across the entire test suite pass.

## Raw Output

`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest test/extras/approvals.test.tsx`:
```
PASS test/extras/approvals.test.tsx
  AP-A: approvals
    ✓ polling maps a GET payload into the store, and a profile switch clears it (20 ms)
    ✓ the card renders the summary and chat label. Allow, Deny and Always post the right bodies. After a decide, the next pending one shows (207 ms)
    ✓ a 404 on decide shows the expired toast and moves on (8 ms)
    ✓ the toggle posts settings. Remove asks for confirm and posts forget (20 ms)
    ✓ a new pending id while AppState is background schedules exactly one notification, with no command text in it (2 ms)

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        1.187 s, estimated 2 s
Ran all test suites matching /test\/extras\/approvals.test.tsx/i.
```

`npx tsc --noEmit`:
```
(clean - 0 errors)
```

`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` (whole suite):
```
PASS test/extras/approvals.test.tsx
PASS test/screens/diffs-gallery.test.tsx
PASS test/screens/viewer.test.tsx
PASS test/screens/ecosystem-channels.test.tsx
PASS test/screens/ecosystem-automations.test.tsx
PASS test/screens/redesign-ecosystem.test.tsx
PASS test/screens/ecosystem-skills.test.tsx
PASS test/screens/chats.test.tsx
PASS test/extras/ui.test.tsx
PASS test/screens/connect.test.tsx
PASS test/ui/components.test.tsx
PASS test/state/fork-temp-workspace.test.ts
PASS test/extras/voice.test.ts
PASS test/state/thread.test.ts
PASS test/screens/composer.test.tsx
PASS test/screens/kanban-board.test.tsx
PASS test/fixes/fix-a.test.tsx
PASS test/extras/useEffort.test.tsx
PASS test/extras/widget.test.tsx
PASS test/ui/math.test.tsx
PASS test/settings/store.test.ts
PASS test/state/sessionStore.test.ts
PASS test/state/thread.integration.test.ts
PASS test/ecosystem/apps-skills-automations.test.ts
PASS test/settings/models-providers.test.ts
PASS test/ecosystem/channels.test.ts
PASS test/core/session.test.ts
PASS test/core/profiles.test.ts
PASS test/state/subagents.test.ts
PASS test/extras/effort.test.ts
PASS test/core/upload.test.ts
PASS test/platform.test.ts
PASS test/vendor-smoke.test.ts
PASS test/state/chats.test.ts
PASS test/ui/anyimage.test.tsx
PASS test/ui/botface.test.tsx
PASS test/vendorVersion.test.ts
PASS test/extras/logic.test.ts
PASS test/extras/notifier.test.ts
PASS test/state/session-redirect.test.ts
PASS test/ui/theme.test.ts
PASS test/settings/runtime-capabilities.test.ts
PASS test/state/usage.test.ts
PASS test/extras/speech.test.tsx
PASS test/screens/media.test.tsx
PASS test/ui/markdown.test.tsx
PASS test/screens/history-error.test.tsx
PASS test/fixes/m-a.test.tsx
PASS test/screens/mainLayout.test.tsx
PASS test/extras/outbox.test.tsx
PASS test/screens/thread.test.tsx

Test Suites: 85 passed, 85 total
Tests:       682 passed, 682 total
Snapshots:   0 total
Time:        7.62 s, estimated 14 s
Ran all test suites.
```

## Requirements Breakdown & Implementation Citations

### 1. Store and API (`src/extras/approvals.ts`)
- **`approvalsStore`:** `mobile/src/extras/approvals.ts:110-202`. Tracks `enabled`, `pending`, `allow`, `error`, `loading`. Includes optimistic updates (`removePending`, `setEnabled`, `removeAllow`), generation counter, and profile ID protection.
- **Store reset on profile switch:** `mobile/src/extras/approvals.ts:166-176, 204-210`. Clears store and notified ID tracker whenever `sessionStore` active profile changes.
- **API functions:**
  - `fetchApprovals`: `mobile/src/extras/approvals.ts:43-56` (`GET /api/ext/approvals`).
  - `decideApproval`: `mobile/src/extras/approvals.ts:78-86` (`POST /api/ext/approvals/decide` with `{ id, allow, always }`).
  - `setApprovalsEnabled`: `mobile/src/extras/approvals.ts:88-91` (`POST /api/ext/approvals/settings` with `{ enabled }`).
  - `forgetApproval`: `mobile/src/extras/approvals.ts:93-96` (`POST /api/ext/approvals/forget` with `{ session_key }`).
- **`useApprovalsPolling()` hook:** `mobile/src/extras/approvals.ts:212-234`. Polls every 3s when session is open and enabled; polls every 60s (with initial fetch on mount) when disabled.
- **`chatLabelFor(session_key, chats, t)`:** `mobile/src/extras/approvals.ts:98-108`. Resolves title from `chatsStore`, "Kanban" for `kanban:*`, "Automazione" for `cron:*`, or session key fallback.

### 2. Approval Card UI (`src/extras/ApprovalCard.tsx`)
- **`Sheet` component for oldest pending item:** `mobile/src/extras/ApprovalCard.tsx:11-30, 52-117`. Renders over screen when `pending.length > 0`, targeting `pending[0]`.
- **Command presentation:** `mobile/src/extras/ApprovalCard.tsx:64-88`. Selectable text using `th.font.mono` in horizontally scrollable card.
- **Countdown timer:** `mobile/src/extras/ApprovalCard.tsx:19-27, 43-50`. Decrements every second starting from `expires_in`. Never auto-allows on expiration.
- **Actions:** `mobile/src/extras/ApprovalCard.tsx:90-116`. Consenti (`variant="primary"`), Nega (`variant="destructive"`), Consenti sempre in questa chat (`variant="ghost"`). Touch targets $\ge 48$ dp.
- **Optimistic progression and 404 handling:** `mobile/src/extras/ApprovalCard.tsx:34-49`. Removes item immediately so UI advances to next pending approval; shows `approvals.expired` toast on 404.

### 3. Mounting in Main Layout (`app/(main)/_layout.tsx`)
- Mounted `useApprovalsPolling()` and `<ApprovalCard />` at `mobile/app/(main)/_layout.tsx:12, 16` alongside `OfflineBanner` and `SharePickerSheet`.

### 4. Background Notification Privacy (`src/extras/approvals.ts`)
- **Scheduling on new pending ID:** `mobile/src/extras/approvals.ts:135-148`. Schedules local notification on `turns` channel if `AppState.currentState !== "active"` and item ID hasn't been notified yet.
- **Privacy constraint:** `mobile/src/extras/approvals.ts:140-145`. Notification content contains only localized title `approvals.notify` ("Comando da approvare" / "Command needs approval"); never contains command text or URLs.

### 5. Settings Card (`src/screens/settings/ApprovalsCard.tsx` & `AppearanceSection.tsx`)
- **Switch `approvals.enable`:** `mobile/src/screens/settings/ApprovalsCard.tsx:42-63`. Toggle calls `setApprovalsEnabled`.
- **Always-allowed chats list:** `mobile/src/screens/settings/ApprovalsCard.tsx:65-110`. Displays chats where `allow[session_key]` contains `"exec"` with chat labels.
- **Confirm Dialog for forget:** `mobile/src/screens/settings/ApprovalsCard.tsx:112-121`. Tapping "Rimuovi" prompts `Dialog` and on confirm calls `forgetApproval`.
- **Mounted in Settings:** `mobile/src/screens/settings/AppearanceSection.tsx:12, 122`.

## What Could Not Be Verified
- **Physical device / Live backend:** Nothing was run on a physical device, Android emulator, or against a live server / live backend instance. System push/local notification banners in the Android system tray could not be visually verified in this headless testing environment.

---

# fix1

## Files Touched
- `mobile/src/extras/ApprovalCard.tsx` (added `busy` ref and state, disabled buttons while a decide is in flight, bound decide to current ID, deferred local removal until after POST settles, kept item on screen with `common.operationFailed` toast on network/5xx failures)
- `mobile/src/extras/approvals.ts` (added 10 s memory of decided IDs to prevent stale refreshes from re-adding resolved items, dropped `typeof session.get` in favor of consistent fetch, removed hardcoded Italian default values, added generation counter check on each refresh to ignore overlapping older refreshes, enabled `background: true` for polling)
- `mobile/src/ecosystem/common.ts` (extended `usePolling` with opt-in `background?: boolean` that polls every 15 s when app is in background while leaving all other pollers paused)
- `mobile/src/screens/settings/ApprovalsCard.tsx` (switched error toasts to generic `common.operationFailed` instead of raw error messages)
- `mobile/test/extras/approvals.test.tsx` (added unit tests for: double-tap debouncing, network error item retention, stale refresh decided ID filtering, background 15 s polling tick with fake timers, generation guard, profile switch guard, and 3 s / 60 s polling intervals; updated test fetches to use `global.fetch`)

## Raw Output

`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest test/extras/approvals.test.tsx`:
```
PASS test/extras/approvals.test.tsx
  AP-A: approvals
    ✓ polling maps a GET payload into the store, and a profile switch clears it (27 ms)
    ✓ the card renders the summary and chat label. Allow, Deny and Always post the right bodies. After a decide, the next pending one shows (213 ms)
    ✓ a 404 on decide shows the expired toast and moves on (8 ms)
    ✓ the toggle posts settings. Remove asks for confirm and posts forget (23 ms)
    ✓ a new pending id while AppState is background schedules exactly one notification, with no command text in it (1 ms)
    ✓ press Allow twice quickly -> exactly one POST and second item is not decided (15 ms)
    ✓ decide fails with a network error -> card still shows the same command and generic toast (6 ms)
    ✓ a refresh that started before decide does not re-add a decided id (1 ms)
    ✓ background polling drives a real tick at 15 s in background and schedules notification (2 ms)
    ✓ generation guard ignores the result of an older overlapping refresh (1 ms)
    ✓ profile switch mid-refresh drops the old result
    ✓ polling interval: 3 s when enabled, 60 s when disabled (2 ms)

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        1.345 s, estimated 2 s
Ran all test suites matching /test\/extras\/approvals.test.tsx/i.
```

`npx tsc --noEmit`:
```
(clean - 0 errors)
```

`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` (whole suite):
```
PASS test/extras/approvals.test.tsx
PASS test/screens/diffs-gallery.test.tsx
PASS test/screens/viewer.test.tsx
PASS test/screens/ecosystem-channels.test.tsx
PASS test/screens/ecosystem-automations.test.tsx
PASS test/screens/chats.test.tsx
PASS test/screens/composer.test.tsx
PASS test/extras/ui.test.tsx
PASS test/screens/connect.test.tsx
PASS test/screens/media.test.tsx
PASS test/screens/kanban-board.test.tsx
PASS test/ui/markdown.test.tsx
PASS test/fixes/m-a.test.tsx
PASS test/screens/mainLayout.test.tsx
PASS test/screens/history-error.test.tsx
PASS test/screens/thread.test.tsx
PASS test/extras/outbox.test.tsx
PASS test/fixes/fix-a.test.tsx
PASS test/state/thread.test.ts
PASS test/screens/model-badge.test.tsx
PASS test/screens/attachments.test.tsx
PASS test/extras/native.test.tsx
PASS test/state/fork-temp-workspace.test.ts
PASS test/extras/voice.test.ts
PASS test/core/session.test.ts
PASS test/extras/useEffort.test.tsx
PASS test/ui/components.test.tsx
PASS test/ecosystem/apps-skills-automations.test.ts
PASS test/settings/store.test.ts
PASS test/state/thread.integration.test.ts
PASS test/extras/widget.test.tsx
PASS test/settings/models-providers.test.ts
PASS test/screens/ecosystem-skills.test.tsx
PASS test/extras/effort.test.ts
PASS test/core/profiles.test.ts
PASS test/state/chats.test.ts
PASS test/state/subagents.test.ts
PASS test/core/pairing.test.ts
PASS test/vendor-smoke.test.ts
PASS test/core/upload.test.ts
PASS test/platform.test.ts
PASS test/screens/web-media.test.ts
PASS test/screens/reading-pages.test.ts
PASS test/ui/theme.test.ts
PASS test/ui/snackbar.test.tsx
PASS test/artifacts/collect.test.ts
PASS test/state/sessionStore.test.ts
PASS test/ui/anyimage.test.tsx
PASS test/artifacts/fix.test.ts
PASS test/ui/botface.test.tsx
PASS test/screens/group-chats.test.ts
PASS test/ui/math.test.tsx
PASS test/vendorVersion.test.ts
PASS test/extras/notifier.test.ts
PASS test/screens/export-artifact.test.ts
PASS test/screens/orientation.test.ts
PASS test/state/usage.test.ts
PASS test/screens/redesign-ecosystem.test.tsx
PASS test/platform/browser-store.test.ts
PASS test/extras/logic.test.ts
PASS test/ui/math-frame.test.ts
PASS test/settings/runtime-capabilities.test.ts

Test Suites: 85 passed, 85 total
Tests:       689 passed, 689 total
Snapshots:   0 total
Time:        7.648 s
Ran all test suites.
```

## Requirements Breakdown & Implementation Citations

### 1. One decision per command
- **Busy state and ref guard (`ApprovalCard.tsx`):** `mobile/src/extras/ApprovalCard.tsx:19-20, 33-35, 49-51`. `busyRef.current` drops any subsequent taps while a decide is in flight.
- **Buttons disabled while busy (`ApprovalCard.tsx`):** `mobile/src/extras/ApprovalCard.tsx:112, 118, 125`. All three action buttons pass `disabled={busy}`.
- **Decide bound to on-screen ID; next item appears only after settle:** `mobile/src/extras/ApprovalCard.tsx:35, 39-40`. `currentId` captured, `removePending` called only after POST settles.

### 2. Don't drop item on failed decide
- **Item preserved on error (`ApprovalCard.tsx`):** `mobile/src/extras/ApprovalCard.tsx:40, 44-47`. Item only removed on successful POST or 404.
- **Generic toast (`ApprovalCard.tsx`):** `mobile/src/extras/ApprovalCard.tsx:46`. Shows `t("common.operationFailed")`, never raw `err.message`.
- **Decided IDs memory for 10 s (`approvals.ts`):** `mobile/src/extras/approvals.ts:41, 131-139, 171`. `decidedIds` map tracks removed IDs and filters them out of any in-flight or subsequent refreshes for 10 s.

### 3. Background polling for approvals
- **Opt-in `background?: boolean` in `usePolling` (`common.ts`):** `mobile/src/ecosystem/common.ts:48, 55, 67, 74, 88`. When `background: true`, ticks every 15 s while backgrounded. All other callers remain paused.
- **Approvals background polling (`approvals.ts`):** `mobile/src/extras/approvals.ts:223`. Passes `background: true` to `usePolling`.

### 4. Guards and intervals
- **Generation guard (`approvals.ts`):** `mobile/src/extras/approvals.ts:116, 127, 154`. Each `refresh()` increments `generation`; stale older responses are discarded.
- **Profile switch mid-refresh (`approvals.ts`):** `mobile/src/extras/approvals.ts:129, 206-210`. In-flight refreshes verify `profileId === sessionStore.getState().profile?.id`, and profile change triggers `reset()`.
- **Polling intervals (`approvals.ts`):** `mobile/src/extras/approvals.ts:220`. Uses 3 s when enabled, 60 s when disabled.

### 5. Minor fixes
- **Fetch fallback removed (`approvals.ts`):** `mobile/src/extras/approvals.ts:44-58`. `fetchApprovals` uses standard `fetch` with `redirect: "error"` and `credentials: "omit"`.
- **Hard-coded Italian strings removed (`approvals.ts`):** `mobile/src/extras/approvals.ts:102, 103, 147`. Uses keys `approvals.chatKanban`, `approvals.chatCron`, and `approvals.notify`.
- **Settings error handling (`ApprovalsCard.tsx`):** `mobile/src/screens/settings/ApprovalsCard.tsx:29, 41`. Shows `t("common.operationFailed")` on settings toggle or forget failure.

## What Could Not Be Verified
- **Physical device / Live backend:** Nothing was run on a physical Android device or against a live server. Actual Android OS background process termination/keepalive behavior could not be tested directly.

