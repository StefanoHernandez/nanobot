# ED-A Report: Edit Sent Message

- **Branch:** `agy/ED-A`
- **Brief:** `mobile/docs/agy/briefs/ED-A.md`
- **Verification Summary:**
  - `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`: PASS (123 test suites, 971 tests passed, 0 failed)
  - `npx tsc --noEmit`: PASS (0 errors)
  - `EXPO_NO_TELEMETRY=1 EXPO_HOME=/tmp/.expo npx expo export --platform android --output-dir /tmp/nb-export`: PASS (bundle size 7.9MB, 0 errors)
- **Focused Test Suite Added:**
  - `mobile/test/screens/thread-edit-message.test.tsx` (9 passed)

---

## Changed Files

1. `mobile/src/i18n/it.json`:
   - Added `"fork"` keys: `"edit": "Modifica"`, `"editDisabledRunning": "Non disponibile durante la risposta"`, `"attachmentsNotCarried": "Gli allegati vanno riaggiunti"`.
2. `mobile/src/i18n/en.json`:
   - Added `"fork"` keys: `"edit": "Modifica"`, `"editDisabledRunning": "Unavailable while responding"`, `"attachmentsNotCarried": "Gli allegati vanno riaggiunti"`.
3. `mobile/src/screens/thread/MessageRow.tsx`:
   - Made user message bubble long-pressable via `UserWrap` (`Pressable` when `onLongPress` is present and message is not actively `sending`).
4. `mobile/src/screens/thread/Composer.tsx`:
   - Added and exported `markComposerForFocus(chatKey: string)`.
   - Added initial cursor selection and focus effect for targeted chats so keyboard opens and cursor is positioned at the end of the text.
5. `mobile/src/screens/thread/MessageList.tsx`:
   - Updated long-press sheet menu:
     - On user messages: shows "Copy" and "Modifica" (hidden for temporary chats; disabled with explanation while bot is running).
     - On assistant messages: shows "Copy" and "Fork from here" (Modifica is not shown).
   - Added `editMessage(m: UIMessage)`:
     - Checks and pages all older history (`loadOlder`) if `hasMoreBefore` is true.
     - Computes `before_user_index` over full history.
     - Derives new title as `${origTitle || t("chats.untitled")} (modificata)`.
     - Calls `chatsStore.fork(chatKey, beforeUserIndex, title)`.
     - Prefills composer draft via `threadStore.setDraft(nk, m.content)`.
     - Calls `markComposerForFocus(nk)`.
     - Shows toast "Gli allegati vanno riaggiunti" if the edited message contained media or images.
     - Navigates to `/chat/${encodeURIComponent(nk)}`.
     - On fork error: catches and shows `t("common.error")` without modifying draft or navigating.
6. `mobile/test/screens/thread-edit-message.test.tsx`:
   - Real component and store integration tests covering all requirements.

---

## How `before_user_index` is Computed

`before_user_index` is zero-based over the user messages in the session, matching the server's contract in `nanobot/session/manager.py` (`fork_session_before_user_index`):
- `0` means before the 1st user message (fork will retain 0 user messages).
- `1` means before the 2nd user message (fork will retain 1 user message and its assistant reply).
- `N` means before user message `N`.

In `MessageList.tsx`:
1. If older pages exist that have not been loaded yet (`threadStore.getState().threads[chatKey]?.hasMoreBefore`), `threadStore.getState().loadOlder(chatKey)` is called until all earlier messages are present.
2. The index of the message `m` in the full message history is located:
   `const targetIdx = fullMessages.findIndex((x) => x.id === m.id);`
3. The count of user messages strictly before that index is calculated:
   `const beforeUserIndex = fullMessages.slice(0, targetIdx).filter((x) => x.role === "user").length;`
4. This matches the assistant message fork formula, with the distinction that assistant fork uses `slice(0, at + 1)` (to retain the user prompt that generated that answer), whereas user edit uses `slice(0, targetIdx)` (to fork before the message being edited and replace it).

---

## Self-Check Against Brief

| Brief Item | Implementation File & Line | Status |
|---|---|---|
| Long-press user message shows "Modifica", next to Copy | `mobile/src/screens/thread/MessageRow.tsx#L96-L120`, `mobile/src/screens/thread/MessageList.tsx#L143-L154` | Implemented |
| Assistant message shows Fork, does not show Modifica | `mobile/src/screens/thread/MessageList.tsx#L154-L156` | Implemented |
| Call `chatsStore.fork` with `before_user_index` | `mobile/src/screens/thread/MessageList.tsx#L76` | Implemented |
| Open new chat & put old text in composer, cursor at end, keyboard up | `mobile/src/screens/thread/MessageList.tsx#L77-L82`, `mobile/src/screens/thread/Composer.tsx#L89-L107`, `L478-L483` | Implemented |
| Toast "Gli allegati vanno riaggiunti" if message had attachments | `mobile/src/screens/thread/MessageList.tsx#L70-L80` | Implemented |
| Original chat stays in list, new chat title is `original + " (modificata)"` | `mobile/src/screens/thread/MessageList.tsx#L67-L68`, `L76` | Implemented |
| Full history count (page older if not in loaded pages) | `mobile/src/screens/thread/MessageList.tsx#L55-L65` | Implemented |
| Disabled while bot is running with short reason | `mobile/src/screens/thread/MessageList.tsx#L146-L149` | Implemented |
| Temporary chats: hide Modifica | `mobile/src/screens/thread/MessageList.tsx#L49`, `L144` | Implemented |
| Fork error: show `common.error` and leave composer untouched | `mobile/src/screens/thread/MessageList.tsx#L83-L85` | Implemented |

---

## Added Dependencies

None.

---

## Deviations or Doubts

None. All behaviors and constraints adhere strictly to the brief and README rules.

---

## What Could Not Be Verified

- Touch long-press feel and physical keyboard pop-up behavior on a physical Android handset (verified in Jest integration tests and via Metro/Expo Android release bundle export).

---

## Raw Verification Outputs

### Jest
```text
PASS test/screens/thread-edit-message.test.tsx
  ED-A: edit a message you already sent
    ✓ long-press menu on a user message shows Modifica and Copy, but not Fork (226 ms)
    ✓ long-press menu on an assistant message shows Copy and Fork, but not Modifica (79 ms)
    ✓ Modifica is disabled when the bot is running (61 ms)
    ✓ temporary chat hides Modifica (68 ms)
    ✓ Modifica calls forkChat with the right before_user_index, appends (modificata) to title, navigates, and prefills composer (107 ms)
    ✓ Modifica for first user message calls fork with before_user_index 0 (77 ms)
    ✓ a message with attachments shows toast 'Gli allegati vanno riaggiunti' (73 ms)
    ✓ fork error shows common.error and leaves composer untouched (73 ms)
    ✓ loads older pages before computing before_user_index when hasMoreBefore is true (112 ms)

Test Suites: 123 passed, 123 total
Tests:       971 passed, 971 total
Snapshots:   0 total
Time:        11.215 s, estimated 32 s
Ran all test suites.
```

### TSC
```text
$ npx tsc --noEmit
(exit code: 0, no output)
```

### Expo Export
```text
$ EXPO_NO_TELEMETRY=1 EXPO_HOME=/tmp/.expo npx expo export --platform android --output-dir /tmp/nb-export
Android Bundled 17239ms index.js (2536 modules)
› android bundles (1):
_expo/static/js/android/index-2004caaed3836c816fe3f9d108e29fa6.hbc (7.9MB)
› Files (1):
metadata.json (4.6KB)
Exported: /tmp/nb-export
(exit code: 0)
```
