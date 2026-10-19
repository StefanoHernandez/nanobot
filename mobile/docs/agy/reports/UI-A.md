# UI-A report

Branch `agy/UI-A`, base `origin/main`. No server changes (`mobile/vendor/**` untouched).

## Kanban on phone

- `KanbanScreen.tsx`: below 768 px (`NARROW_WIDTH`) the board shows a status chip row with counts and a horizontally paging `ScrollView` (`pagingEnabled`, `decelerationRate="fast"`) with one full-width column per status. Chips and swipe stay in sync. Wide screens keep the multi-column board.
- `KanbanCard.tsx` (new): card with long-press handler, a pulsing `brand` border while the task is running (static when `AccessibilityInfo.isReduceMotionEnabled()` is true) and a "Watch the bot" button that does `router.push` to the session `kanban:<task_id>:<bot_id>`.
- `taskActions.ts` (new): resolves the quick actions for a status and runs them through `saveKanbanTask`, `moveKanbanTask` and `reviewKanbanTask`. Ready: Start now. Review: Approve, Send back (with feedback). Any status: Move to Done, Block.
- `TaskActionSheet.tsx` (new): the long-press action sheet.
- `TaskEditorSheet.tsx`: picking a status chip while the form is dirty saves the form fields first, then moves the task, so unsaved edits are no longer dropped.
- Tests: `test/screens/kanban-phone.test.tsx`.

## Composer bars

- `OutboxBar.tsx`: now exports `useOutboxFlush(chatKey, sessionState, profileId)` (delivery logic) and the list component.
- `PendingBar.tsx` (new): one collapsed line for outbox plus queued messages ("{n} messages waiting — tap to manage"). Tapping expands both lists with their actions. Hidden when both queues are empty, collapsed by default.
- `Composer.tsx`: mounts `useOutboxFlush` and renders `PendingBar` in place of `QueuedMessages`.
- `ThreadScreen.tsx`: the `<OutboxBar>` line is removed, plus its now-unused import line (required for a clean typecheck). Nothing else changed.
- Tests: `test/screens/pending-bar.test.tsx`; `thread-queue.test.tsx` and `outbox.test.tsx` now expand the bar before asserting on cards.

## Small fixes

- `NewAutomationSheet.tsx`: the existing-chat picker is a `ScrollView` with `nestedScrollEnabled` and `keyboardShouldPersistTaps="handled"`. Test added in `new-automation.test.tsx`.
- `SegmentedTabs.tsx` (new, `borderRadius: 999`, 48 px touch target) replaces the tab bars in `KanbanScreen`, `AppsScreen`, `GalleryScreen` and `MemoryScreen`. `MemoryScreen` still reads and writes the `tab` and `date` params (covered in `ecosystem-memory.test.tsx`). Component test: `test/ui/segmented-tabs.test.tsx`.

## i18n

New keys in `en.json` and `it.json` for quick actions, card hint, watch bot, invalid move and the pending bar titles.

## Forbidden files

None touched: `src/ui/markdown/**`, `src/screens/viewer/**`, `src/artifacts/**`, `ChatDrawer.tsx`, `src/screens/ecosystem/skills/**`, `ModelsSection.tsx`, `ToolActivitySheet.tsx`, `keepAliveWiring.ts`.

## Verification

- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`: Test Suites 134 passed, 134 total; Tests 1082 passed, 1082 total.
- `npx tsc --noEmit`: clean.
- `npx expo export --platform android --output-dir /tmp/nb-export-ui`: exported.

Note: `origin/main` has one newer docs-only commit (`f5a74deef`) that is not merged into this branch.
