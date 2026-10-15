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
