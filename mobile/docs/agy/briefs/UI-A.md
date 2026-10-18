# UI-A: kanban on the phone, compact composer bars, shared tabs (owner: agy)

Branch `agy/UI-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires. **App only.** Six other agy sessions run in parallel: **do not touch** `src/screens/viewer/**`, `src/artifacts/**`, `src/ui/markdown/**` (AR-A), `src/screens/chats/ChatDrawer.tsx` (SR-A), `src/screens/ecosystem/skills/**` (SK-A), `src/screens/settings/ModelsSection.tsx` (MI-A), `ToolActivitySheet.tsx` and `src/extras/keepAliveWiring.ts` (FX-B). In `src/screens/thread/ThreadScreen.tsx` change at most the `<OutboxBar>` line (SK-A edits its menu).

Keep the current look (`src/ui/theme.ts`, fonts, bezel). This is about fewer taps and more room, not a restyle.

## 1. Kanban on the phone (`src/screens/ecosystem/kanban/**`)
Today 6-7 columns scroll sideways on a 390 px screen, and moving a card means opening it and tapping the status chip (which also drops unsaved edits in the form).
1. **Narrow screens (< 768 px):** a row of status chips at the top (with counts) selects one column, shown full width; horizontal swipe between columns snaps (`pagingEnabled` or `snapToInterval`) and keeps the chip in sync. Wide screens keep today's board.
2. **Quick actions:** long-press on a card opens a small action sheet with the moves that make sense for its status (e.g. ready → "Avvia ora", review → "Approva" / "Rimanda indietro", any → "Sposta in Done", "Blocca"). Use the same API calls the editor uses. No swipe gestures, no new dependency.
3. **Status chip in the editor:** changing the status must not discard unsaved edits (save the form fields with the move, or keep them in state). Test.
4. **Running cards:** a pulsing `brand` border (static when `isReduceMotionEnabled`, like `BotFace`) and a button "Guarda il bot" that opens the task's session (`kanban:<task_id>:<bot_id>`; check how the app opens other internal sessions read-only, e.g. the dream/journal ones, and do the same).
- Tests: chip selects the column; long-press shows the right actions per status and calls the API; editor status change keeps edits; running card shows the button and navigates.

## 2. Composer bars (`src/screens/thread/Composer.tsx`, `QueuedMessages.tsx`, `src/extras/OutboxBar.tsx`)
With the keyboard open, `OutboxBar` + `QueuedMessages` + reply/attachment/voice bars leave a few lines of chat.
- Merge outbox (not sent yet) and queued (sent while the bot is busy) into **one collapsed line**: "{n} messaggi in attesa — tocca per gestire"; tapping expands today's lists with their actions. Collapsed by default; hidden when both are empty. Keep the two states distinguishable inside the expanded view.
- Move `<OutboxBar>` into the composer area accordingly (the one-line change allowed in `ThreadScreen.tsx`).
- Tests: collapsed line counts both kinds; expand shows both; empty hides.

## 3. Small fixes
1. **`NewAutomationSheet.tsx`:** the chat picker (`styles.pickerBox`, `maxHeight: 180`) is a plain `View`, so from the 4th chat on nothing can be reached. Make it a nested scroll (`ScrollView` with `nestedScrollEnabled`). Test that all chats render.
2. **`SegmentedTabs`:** the pill tab bar (`borderRadius: 999`) is copied by hand in `KanbanScreen`, `AppsScreen`, `GalleryScreen`, `MemoryScreen` (check). Make one `src/ui/components/SegmentedTabs.tsx` and use it in those screens only (not `FileViewer`, not the skills screens: other sessions own them; list them in the report for later). Same look as today; one test for the component.

## Checks
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export-ui`

## Do not
- Edit server files or `mobile/vendor/**`. Add dependencies. Import `@react-navigation/*`. Restyle the theme.

## Report
`mobile/docs/agy/reports/UI-A.md`: files, tests, deviations, the screens left on the old tab bar, what needs a phone to check (snap feel, long-press, keyboard room).

Commit, push `agy/UI-A`, and give the last hash. Do not merge.
