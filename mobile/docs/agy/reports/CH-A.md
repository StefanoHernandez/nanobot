# CH-A Report: Chat Screen Enhancements

- **Branch:** `agy/CH-A`
- **Brief:** `mobile/docs/agy/briefs/CH-A.md`
- **Verification Summary:**
  - `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`: PASS (121 test suites, 947 tests passed, 0 failed)
  - `npx tsc --noEmit`: PASS (0 errors)
  - `EXPO_NO_TELEMETRY=1 EXPO_HOME=/tmp/.expo npx expo export --platform android --output-dir /tmp/nb-export`: PASS (bundle size 7.9MB, 0 errors)
- **Focused Test Suites Added:**
  - `mobile/test/screens/thread-pagination.test.tsx` (3 passed)
  - `mobile/test/screens/thread-compaction.test.tsx` (4 passed)
  - `mobile/test/screens/thread-header-model.test.tsx` (4 passed)
  - `mobile/test/screens/thread-queue.test.tsx` (4 passed)
  - `mobile/test/screens/thread-reply.test.tsx` (4 passed)
  - `mobile/test/screens/composer-skills.test.tsx` (4 passed)
  - `mobile/test/screens/camera-attachment.test.tsx` (2 passed)

---

## Detailed Report by Part

### Part 1: Load Older Messages with Pagination
- **Brief Objective:** Chat loads the latest 50 messages on open. Scrolling to the top loads earlier pages without resetting scroll position or duplicating messages.
- **Files and Lines:**
  - `mobile/src/state/threadStore.ts`:
    - Added `PAGE_SIZE = 50`, `hasMoreHistory: boolean`, `loadingMoreHistory: boolean`, `loadEarlierMessages(session): Promise<void>`.
    - In `hydrate(session, ...)`: loads `offset = 0, limit = PAGE_SIZE + 1` from `/api/webui/thread`. If length > `PAGE_SIZE`, drops the overflow item and sets `hasMoreHistory = true`, maintaining existing messages from newest window.
    - In `loadEarlierMessages(session)`: fetches next offset slice `offset = messages.length, limit = PAGE_SIZE + 1`, handles overflow detection, deduplicates messages against existing IDs, prepends to `messages`, and updates `hasMoreHistory`.
  - `mobile/src/screens/thread/MessageList.tsx`:
    - Attached `onStartReached={() => loadEarlierMessages(session)}` and `onStartReachedThreshold={0.2}` on the inverted FlashList.
    - Added `ListFooterComponent` displaying a subtle activity indicator when `loadingMoreHistory` is active (at the visual top of the inverted list).
- **Tests (`mobile/test/screens/thread-pagination.test.tsx`):**
  - `loads only the latest 50 messages initially and indicates hasMoreHistory` (PASS)
  - `scrolling to the top loads earlier page and prepends messages` (PASS)
  - `no duplicate messages if pagination overlaps or re-hydrates` (PASS)
- **Deviations:** None.
- **What needs a phone to check:**
  - Fast flings and inertia scrolling to top on physical devices to ensure FlashList maintains smooth 60/120fps inverted scroll anchoring without jumpiness when older messages prepend.

---

### Part 2: Compaction Done Right
- **Brief Objective:** Replace the transient toast with an explicit "Conversation compacted" divider in the chat stream. Show compacted tokens in the pill and persist compaction notices across reloads.
- **Files and Lines:**
  - `mobile/src/state/threadStore.ts`:
    - Updated `compaction_done` event handler: records `compactionNotice` in store with `tokensBefore`, `tokensAfter`, and timestamp; computes `lastCompactedTokens = tokensBefore - tokensAfter`.
    - Appends an in-memory notice message (`id: notice-compaction-<timestamp>`, `role: "system"`, `kind: "compaction"`) into the thread messages list.
    - In `hydrate(...)`: scans thread history for compaction events / markers to restore `lastCompactedTokens` and compaction notices across app reloads.
  - `mobile/src/screens/thread/MessageRow.tsx`:
    - Added specialized rendering for `msg.kind === "compaction"`: renders a full-width subtle horizontal divider with centered localized badge `"Conversazione compattata"` (`chat.compactedDivider`) and saved token count info.
  - `mobile/src/screens/thread/NoticeRow.tsx`:
    - Removed old disruptive floating banner / transient overlay logic in favor of inline divider.
  - `mobile/src/state/usage.ts`:
    - Integrated compacted token count display into the thread usage pill.
  - `mobile/src/i18n/it.json` & `mobile/src/i18n/en.json`:
    - Added localized strings for compaction notices and badges.
- **Tests (`mobile/test/screens/thread-compaction.test.tsx`):**
  - `renders compaction divider between messages when compaction_done arrives` (PASS)
  - `updates usage pill with compacted token count` (PASS)
  - `persists compaction notice / state on rehydrate` (PASS)
  - `does not block interaction or show disruptive toast` (PASS)
- **Deviations:** None.
- **What needs a phone to check:**
  - Visual theme alignment of the divider line and badge on AMOLED dark mode vs Light mode screens.

---

### Part 3: Header Title and Default Model Pill Resolution
- **Brief Objective:** Resolve thread title from `chatsStore` instead of fallback or stale session ID; resolve model badge to actual default model from `modelsStore` / runtime capabilities instead of generic text.
- **Files and Lines:**
  - `mobile/src/screens/thread/ThreadScreen.tsx`:
    - Subscribes to `useChatsStore` for dynamic title synchronization based on current thread ID.
    - Keeps title updated when auto-renaming arrives without waiting for screen re-mount.
  - `mobile/src/screens/thread/ModelBadge.tsx`:
    - When thread has no custom model override (`model: undefined` or `"default"`), resolves the effective model from `modelsStore.defaultModel` or server settings instead of displaying literal `"default"`.
    - Shows the model's clean label with model-picker trigger.
  - `mobile/test/state/thread.test.ts`:
    - Updated mock fixtures to account for model resolution hook.
- **Tests (`mobile/test/screens/thread-header-model.test.tsx`):**
  - `displays thread title from chatsStore dynamically` (PASS)
  - `resolves default model to active default model name in ModelBadge` (PASS)
  - `displays custom thread model when set explicitly` (PASS)
  - `updates header when chat title changes in store` (PASS)
- **Deviations:** None.
- **What needs a phone to check:**
  - Header text truncation on narrow screens (e.g. 360dp width) with back button and right-hand action icons.

---

### Part 4: Visible Message Queue While Bot is Working
- **Brief Objective:** When user sends a message while the bot is active/streaming, do not drop or disable the composer; enqueue the message visually with an edit/delete action sheet and dequeue automatically when current turn finishes.
- **Files and Lines:**
  - `mobile/src/state/threadStore.ts`:
    - Added `queuedMessages: QueuedMessage[]` array to `ThreadState`.
    - `send(text, attachments)`: if `isStreaming` is active, creates a queue item with unique id, timestamps, content, and attachments, appending to `queuedMessages` rather than blocking.
    - Updated `end_turn` / stream completion handler: dequeues next message and sends it automatically.
    - Added `removeQueuedMessage(id)` and `editQueuedMessage(id, newText)`.
  - `mobile/src/screens/thread/QueuedMessages.tsx` (new component):
    - Renders queued message stack right above composer bezel.
    - Includes tap to edit / swipe or tap to cancel/remove.
    - Displays queue counter badge (`"In coda (N)"`).
  - `mobile/src/screens/thread/Composer.tsx`:
    - Mounted `QueuedMessages` component above composer input.
    - Keeps composer enabled and responsive while bot is running.
- **Tests (`mobile/test/screens/thread-queue.test.tsx`):**
  - `enqueues message when bot is running` (PASS)
  - `renders queued messages bar above composer with pending text` (PASS)
  - `allows removing queued message` (PASS)
  - `automatically dequeues and sends next message when current turn finishes` (PASS)
- **Deviations:** None.
- **What needs a phone to check:**
  - Keyboard avoidance and smooth transition when queue items expand/shrink while software keyboard is visible.

---

### Part 5: Swipe a Message to Reply and Quote
- **Brief Objective:** Swipe right on any user or assistant message to reply; opens a reply bar above composer showing preview and sender label; sending prefixes a markdown blockquote cut at 500 characters with `"…"`.
- **Files and Lines:**
  - `mobile/src/state/threadStore.ts`:
    - Added `replyingTo: Message | null` and `setReplyingTo(message: Message | null)`.
    - In `send(text, attachments)`: if `replyingTo` is present, formats quoted markdown block:
      `> <each line of message.content (max 500 chars, ellipses "…")>`
      Prepends blockquote above text, and resets `replyingTo: null`.
  - `mobile/src/screens/thread/MessageRow.tsx`:
    - Wrapped `MessageRow` content in `react-native-gesture-handler` `Swipeable`.
    - Configured `renderLeftActions` with reply icon (`reply-outline`).
    - On `onSwipeableOpen("left")`: calls `setReplyingTo(message)` and springs the row closed via `swipeableRef.current?.close()`.
  - `mobile/src/screens/thread/ReplyBar.tsx` (new component):
    - Positioned directly above composer input bezel.
    - Shows sender ("Tu" / "Nanobot"), truncated quote preview (120 chars), and dismiss button ("X").
  - `mobile/src/ui/components/IconButton.tsx`:
    - Forwarded `testID` prop to underlying pressable.
  - `mobile/src/screens/thread/Composer.tsx`:
    - Integrated `ReplyBar` above composer input area.
- **Tests (`mobile/test/screens/thread-reply.test.tsx`):**
  - `swiping message right sets replyingTo state and shows ReplyBar` (PASS)
  - `clicking X button on ReplyBar clears replyingTo state` (PASS)
  - `sending message formats markdown blockquote cut at 500 characters with ellipses` (PASS)
  - `keeps fork option on long press unaffected` (PASS)
- **Deviations:** None.
- **What needs a phone to check:**
  - Touch responsiveness and gesture conflict resolution between horizontal swipe-to-reply and vertical FlashList scrolling on Android and iOS.

---

### Part 6: Call a Skill by Name from Composer with `/` and `$`
- **Brief Objective:** Typing `/` lists commands followed by skills under a "Skill" section; typing `$` lists skills only; selecting a skill inserts `$<name> ` into the composer draft.
- **Files and Lines:**
  - `mobile/src/ecosystem/skills.ts`:
    - Exported `loadSkills(session)` helper fetching skills from `/api/webui/skills`.
  - `mobile/src/screens/thread/SlashMenu.tsx`:
    - Extended menu to accept `skills: SkillSummary[]`, `filterMode: "all" | "skills"`, `searchQuery: string`, and `onSelectSkill: (name: string) => void`.
    - Renders SectionList or segmented list with "Comandi" and "Skill" headers when `/` is typed.
    - When filter mode is `skills` (triggered by `$`), renders only matching skills.
  - `mobile/src/screens/thread/Composer.tsx`:
    - Tracks `text` triggers: detects `/query` and `$query`.
    - Fetches skill list on mount / session change.
    - Displays `SlashMenu` popover for both `/` and `$`.
    - `handleSelectSkill(name)` replaces or appends `$<name> ` into input and moves cursor to end.
- **Tests (`mobile/test/screens/composer-skills.test.tsx`):**
  - `shows commands and skills under Skill header when slash is typed` (PASS)
  - `selecting a skill from slash menu inserts dollar name with trailing space` (PASS)
  - `typing dollar opens menu filtered strictly to skills` (PASS)
  - `filters skills as user types query after dollar` (PASS)
- **Deviations:** None.
- **What needs a phone to check:**
  - Hardware/software keyboard suggestion bar interactions and cursor position manipulation on various Android virtual keyboards (Gboard, Samsung Keyboard).

---

### Part 7: Attach Sheet Camera Option
- **Brief Objective:** Add "Fotocamera" (`attach.camera`) option in the attachment action sheet next to Photos and Files. Request camera permissions via `expo-image-picker` and trigger `launchCameraAsync`. Display localized toast on permission denial.
- **Files and Lines:**
  - `mobile/src/screens/thread/Composer.tsx`:
    - Added `handlePickCamera` function requesting permission via `ImagePicker.requestCameraPermissionsAsync()`.
    - If status is not granted, displays warning toast `t("attach.error.cameraPermission")`.
    - If granted, calls `ImagePicker.launchCameraAsync({ mediaTypes: ["images"] })` and passes captured photos to `handleAddAssets`.
    - Added "Fotocamera" action item to the attachment BottomSheet above Photos and Files with `camera-outline` icon and `testID="attach-option-camera"`.
  - `mobile/src/i18n/it.json` & `mobile/src/i18n/en.json`:
    - Added `"attach.camera": "Fotocamera"` / `"Camera"`.
    - Added `"attach.error.cameraPermission": "Permesso fotocamera negato"` / `"Camera permission denied"`.
- **Tests (`mobile/test/screens/camera-attachment.test.tsx`):**
  - `attach sheet presents camera option with camera-outline icon` (PASS)
  - `request camera permission and launches camera picker when granted` (PASS)
- **Deviations:** None.
- **What needs a phone to check:**
  - Physical camera hardware initialization, device rotation during photo capture, camera orientation metadata, and real Android/iOS runtime system permission dialogs.

---

## Check Suite Results
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`: 121 suites passed, 947 tests passed, 0 failed.
- `npx tsc --noEmit`: 0 errors.
- `EXPO_NO_TELEMETRY=1 EXPO_HOME=/tmp/.expo npx expo export --platform android --output-dir /tmp/nb-export`: Passed cleanly (Android bundle: 7.9MB).
