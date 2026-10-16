# BK-A Report: Chat and Project Export, Server Backups

- **Branch:** `agy/BK-A`
- **Brief:** `mobile/docs/agy/briefs/BK-A.md`
- **Commit Message:** `feat(mobile): chat and project export, server backups`
- **Verification:**
  - `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`: PASS (90 test suites, 753 passed, 0 failed)
  - `npx tsc --noEmit`: PASS (0 errors)
- **Focused Test Suite:** `mobile/test/extras/backup-export.test.tsx` (16 passed, 0 failed)

---

## Summary of Changes

### Part 1: Chat Export (`mobile/src/extras/exportChat.ts` & `ThreadScreen.tsx`)
1. **Markdown Formatting (`chatToMarkdown`):**
   - Implemented pure function `chatToMarkdown(title, messages, opts)`.
   - Generates `# <title>` heading and export date (`_Esportato il YYYY-MM-DD_` / `_Exported on YYYY-MM-DD_`).
   - Renders each `user` and `assistant` message under `**Tu**` / `**nanobot**` with timestamp when available (`(HH:MM)`).
   - Preserves fenced code blocks (` ```...``` `) intact.
   - Converts attachments to `[file: <name>]` without raw binary or URL payload.
   - Omit tool traces and reasoning/thinking by default; when `opts.includeTools` is true, renders tool traces as collapsed `> tool: <name>` lines.
   - Retains chat title even if the chat is empty.
2. **Export Actions (`exportChat` & `shareMarkdown`):**
   - Markdown: Writes `<slug>-<date>.md` to `Paths.cache/exports`, and shares via `Sharing.shareAsync` with `text/markdown`.
   - PDF: Generates HTML via `markdownToPrintHtml(md)` and prints via `Print.printToFileAsync({ html })`, then shares the PDF via `Sharing.shareAsync` with `application/pdf`.
   - Added "Esporta come Markdown" and "Esporta come PDF" options to the thread menu sheet in `mobile/src/screens/thread/ThreadScreen.tsx`.

### Part 2: Project Export (`ProjectDetailScreen.tsx` & `exportChat.ts`)
3. **Project to Markdown (`projectToMarkdown` & `exportProject`):**
   - Implemented `projectToMarkdown` containing project name, export date, description, instructions, and file list (path and human-readable byte size, without file contents).
   - Appends project chats (each formatted with `chatToMarkdown` at heading level 2).
   - Filters chats matching the project's workspace path, capping hydration to at most 30 chats (`MAX_PROJECT_EXPORT_CHATS = 30`).
   - Displays progress `Chat X/Y` (`projects.exportProgress`).
   - Supports cancellation (`isCancelled`), immediately stopping hydration and sharing nothing.
   - Added "Esporta progetto" button and sheet (Markdown or PDF) to `mobile/src/screens/projects/ProjectDetailScreen.tsx`.

### Part 3: Server Backup (`BackupSection.tsx`, `backup.ts`, `SettingsScreen.tsx`, `SettingsSection.tsx`)
4. **Backup API Client & Store (`mobile/src/extras/backup.ts`):**
   - `fetchBackups`: Calls `GET /api/ext/backup`.
   - `createBackupRequest`: Calls `POST /api/ext/backup/create` with a 120-second timeout (`CREATE_BACKUP_TIMEOUT_MS`).
   - `deleteBackupRequest`: Calls `POST /api/ext/backup/delete` with `{ name }`.
   - `restoreBackupRequest`: Calls `POST /api/ext/backup/restore` with `{ name, confirm: true }`.
   - Zustand `backupStore` handles loading, creating, acting, generation counter, and clears on profile switch.
   - Maps errors to translation keys: `backup_in_progress` -> `backup.inProgress`, `not_a_nanobot_backup` -> `backup.notNanobot`, `unsafe_archive` -> `backup.unsafe`, otherwise `common.operationFailed`. Raw error messages are never displayed.
5. **Backup Settings Section (`BackupSection.tsx`):**
   - Placed after `system` in `SECTIONS` with icon `backup-restore`.
   - Displays free disk space (`disk_free`) and warning banner if `workspace_included === false`.
   - "Crea backup ora" button with spinner while pending; refreshes the list on completion.
   - Backups list ordered newest first, with a `"più recente"` badge on the first item.
   - Delete action guarded by confirmation dialog (`backup.deleteConfirmTitle`).
   - Restore action guarded by strong confirmation dialog (`backup.restoreConfirmTitle`), posts `confirm: true`, and triggers `useRestart().run()`.
   - Strictly read-only on the phone: no download button or archive saving to device.

---

## Files Changed and Created

### Created
1. `mobile/src/extras/exportChat.ts` — Chat and project export to Markdown and PDF.
2. `mobile/src/extras/backup.ts` — Server backup API client and Zustand store.
3. `mobile/src/screens/settings/BackupSection.tsx` — Backup management settings section.
4. `mobile/test/extras/backup-export.test.tsx` — Complete TDD test suite for BK-A.
5. `mobile/docs/agy/reports/BK-A.md` — This report.

### Modified
1. `mobile/src/screens/thread/ThreadScreen.tsx` — Added Markdown and PDF export options to thread menu.
2. `mobile/src/screens/projects/ProjectDetailScreen.tsx` — Added project export action, cancellation, and progress.
3. `mobile/src/screens/settings/SettingsScreen.tsx` — Registered `backup` in `SECTIONS` and `SECTION_ICONS`.
4. `mobile/src/screens/settings/SettingsSection.tsx` — Routed `backup` section to `BackupSection`.
5. `mobile/src/i18n/it.json` — Italian translations for backup and export strings.
6. `mobile/src/i18n/en.json` — English translations for backup and export strings.

---

## Verification

### Focused Test Suite: `mobile/test/extras/backup-export.test.tsx`
```text
PASS test/extras/backup-export.test.tsx
  BK-A: Backup and Export
    chatToMarkdown
      ✓ user and assistant messages are rendered in order with their labels; fenced code block stays intact; attachments become [file: name] (12 ms)
      ✓ tool traces are excluded by default and included when includeTools is true (4 ms)
      ✓ empty chat still has the title (1 ms)
    Chat export (MD and PDF)
      ✓ Chat export MD writes a .md file to cache and calls Sharing.shareAsync with its URI (1 ms)
      ✓ Chat export PDF goes through markdownToPrintHtml and Print.printToFileAsync, then shares the PDF URI (15 ms)
    Project export
      ✓ includes instructions, file list, and only that project's chats; stops at 30 chats (6 ms)
      ✓ cancelling project export stops hydration and does not call Sharing.shareAsync (1 ms)
    BackupSection
      ✓ SettingsScreen includes backup section after system (1 ms)
      ✓ Backup list renders newest first with the 'più recente' badge on the first item (176 ms)
      ✓ Create backup button shows spinner while pending, then refreshes the list (17 ms)
      ✓ Create backup returning 409 backup_in_progress shows the localized message (12 ms)
      ✓ Delete asks for confirm before posting /api/ext/backup/delete (19 ms)
      ✓ Restore asks for the strong confirm dialog, sends confirm: true, and triggers useRestart().run (14 ms)
      ✓ workspace_included: false renders the workspace warning card (7 ms)
      ✓ No download button or element exists in the backup section (6 ms)
      ✓ Profile switch mid-request drops the stale result (1 ms)

Test Suites: 1 passed, 1 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Time:        1.21 s
Ran all test suites matching /test\/extras\/backup-export.test.tsx/i.
```

### Full Test Suite: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`
```text
Test Suites: 90 passed, 90 total
Tests:       753 passed, 753 total
Snapshots:   0 total
Time:        13.307 s
Ran all test suites.
```

### TypeScript Compiler Check: `npx tsc --noEmit`
```text
(Clean exit with code 0 - no errors reported)
```

---

## What Could Not Be Verified

- **Physical Device & Real Server Execution:** All features and scenarios were verified through Jest component tests and TypeScript compile checks. Nothing was run on a physical mobile device or against a real live nanobot server.
