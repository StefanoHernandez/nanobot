# FX-2 Report: Review Fixes for BK-A and PL-A

- **Branch:** `agy/FX-2`
- **Brief:** `mobile/docs/agy/briefs/FX-2.md`
- **Commit Message:** `fix(mobile): export, backup and prompt library review fixes`
- **Verification:**
  - `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`: PASS (91 test suites, 772 passed, 0 failed)
  - `npx tsc --noEmit`: PASS (0 errors)

---

## Summary of Changes

### Backup & Export (BK-A)
1. **`backupStore.create` lifecycle & race condition (Item 1):** In `mobile/src/extras/backup.ts`, decoupled `create()` from `generation` so background or unmount `refresh()` calls do not abandon pending creations. Cleans up `creating: false` in a `finally` block and guards solely against profile changes.
2. **`backupStore.restore` restart guarantee (Item 2):** In `mobile/src/extras/backup.ts`, decoupled `restore()` from `generation`. When the server accepts the restore (HTTP 200), `restore()` returns the response so caller triggers `useRestart().run()`, even if `refresh()` completed in between.
3. **Strict PDF export HTML sanitization & CSP (Item 3):** In `mobile/src/extras/exportChat.ts`, introduced `exportMarkdownToHtml` dedicated to PDF export. Uses a custom Marked renderer to escape raw HTML block/inline tokens, replaces remote images with `[image: <alt>]` (while preserving `data:` images), and injects a strict CSP `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">`. Preserved existing `readingPages.ts` behaviour for the artifact viewer.
4. **ThreadScreen export busy state & error toast (Item 4):** In `mobile/src/screens/thread/ThreadScreen.tsx`, added `exporting` state. Wrapped `exportChat` with `try / catch / finally`, presenting `toast.show(t("common.operationFailed"))` on errors and reflecting loading/disabled state on the more button and export list items.
5. **Abort project export on chat load failure (Item 5):** In `mobile/src/extras/exportChat.ts`, `ensureChatMessages` now checks `!thread?.loaded || thread.loadError` and throws an error if loading failed, aborting export before generating corrupted/empty data.
6. **ProjectDetailScreen sanitize export error message (Item 6):** In `mobile/src/screens/projects/ProjectDetailScreen.tsx`, changed error toast to `toast.show(t("common.operationFailed"))`, preventing backend or JavaScript exception leaks.
7. **Remove phantom spinner in BackupSection (Item 7):** In `mobile/src/screens/settings/BackupSection.tsx`, removed invisible `<View testID="backup-creating-spinner">`. Button uses standard `loading={creating}` and accessibility busy state.

### Prompt Library (PL-A)
8. **Scope delete confirmation button in tests (Item 8):** In `mobile/test/extras/prompts.test.tsx`, scoped the confirmation button to the Dialog card (`within(dialogCard).getByRole(...)`), making the test resilient against Sheet/Dialog hierarchy order.
9. **Isolate prompts by project in picker (Item 9):** In `mobile/src/extras/PromptPickerSheet.tsx`, filtered `visiblePrompts` by `p.project_id == null || p.project_id === currentProjectId` before applying search filters, preventing prompts belonging to other projects from leaking into global chats.
10. **`maxLength` and length error handling (Item 10):**
    - In `mobile/src/extras/PromptEditorSheet.tsx`, added `maxLength={120}` on title and `maxLength={20000}` on body `TextField`. Added `maxLength` to `TextFieldProps` in `mobile/src/ui/components/TextField.tsx`.
    - Handled `invalid_title` and `invalid_body` errors by showing `toast.show(t("prompts.tooLong"))`.
    - Added translations for `prompts.tooLong` in `mobile/src/i18n/en.json` ("Title or body is too long") and `mobile/src/i18n/it.json` ("Titolo o testo troppo lungo").
11. **Trim whitespace in prompt search (Item 11):** In `mobile/src/extras/PromptPickerSheet.tsx`, normalized search input with `search.trim().toLowerCase()`.
12. **Correct empty prompt library message (Item 12):** In `mobile/src/extras/PromptPickerSheet.tsx`, displays `prompts.empty` whenever `visiblePrompts.length === 0`, regardless of whether a search query is typed.

---

## Files Changed

### Source Code
- `mobile/src/extras/backup.ts` (Items 1, 2)
- `mobile/src/extras/exportChat.ts` (Items 3, 5)
- `mobile/src/screens/thread/ThreadScreen.tsx` (Item 4)
- `mobile/src/screens/projects/ProjectDetailScreen.tsx` (Item 6)
- `mobile/src/screens/settings/BackupSection.tsx` (Item 7)
- `mobile/src/extras/PromptPickerSheet.tsx` (Items 9, 11, 12)
- `mobile/src/extras/PromptEditorSheet.tsx` (Item 10)
- `mobile/src/ui/components/TextField.tsx` (Item 10)
- `mobile/src/ui/components/ListItem.tsx` (Item 4)
- `mobile/src/i18n/en.json` (Item 10)
- `mobile/src/i18n/it.json` (Item 10)

### Tests
- `mobile/test/extras/backup-export.test.tsx` (Items 1, 2, 3, 5, 6, 7)
- `mobile/test/screens/thread.test.tsx` (Item 4)
- `mobile/test/extras/prompts.test.tsx` (Items 8, 9, 10, 11, 12)

### Reports
- `mobile/docs/agy/reports/FX-2.md`
