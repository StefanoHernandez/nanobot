# BK-A: backup and export, app side (owner: agy)

Branch `agy/BK-A`, from `main`. Start it when a worktree is free (after MD-A, CO-A or PL-A merges).

User decision (option A):
- the phone gets **chats and projects only**, as MD or PDF;
- the full `~/.nanobot` backup **stays on the server** and is started and restored from the app;
- the app never downloads server archives, which hold API keys.

## Read first
- `nanobot/ext/backup.py`: the server API (read-only for you).
- `mobile/docs/agy/README.md` and `mobile/docs/design/companion.md`.
- `src/screens/viewer/exportArtifact.ts`, which has `printDocument`, and `src/screens/viewer/readingPages.ts`, which has `markdownToPrintHtml`. Reuse both. Do not write a new print or sanitize path.
- `src/screens/thread/media/media.ts` (`Sharing.shareAsync`).
- `src/state/threadStore.ts`: the loaded `messages` and `hydrate`.

## Server API (already built)
- `GET /api/ext/backup` returns `{ backups: [{ name, size, created_at }], max_backups, dir, disk_free, workspace_included }`, newest first.
- `POST /api/ext/backup/create` (empty body) returns `{ backup }`. It can take tens of seconds on the Arduino, so show progress and do not time out under 120 s.
- `POST /api/ext/backup/delete` takes `{ name }`.
- `POST /api/ext/backup/restore` takes `{ name, confirm: true }` and returns `{ ok, restored, previous, restart_required: true }`. The current home is kept as `previous`.
- Errors are `{ error }`:
  - `invalid_name`, `not_found`, `unsafe_archive`, `not_a_nanobot_backup`, `confirm_required`: 400 or 404;
  - `backup_in_progress`: 409;
  - `backup_failed`: 500.

## Build
1. **Chat export (`src/extras/exportChat.ts`):**
   - a pure `chatToMarkdown(title, messages, opts)`:
     - a `# title` heading plus the export date;
     - each user and assistant message under a `**Tu** / **nanobot**` label with its time;
     - code blocks kept intact;
     - attachments as a `[file: name]` line, with no binary data;
     - tool traces and thinking left out by default (`opts.includeTools` adds them as a collapsed `> tool: name` line).
   - Then share, through the thread header menu (`ThreadScreen.tsx` `menu`), with the entries "Esporta come Markdown" and "Esporta come PDF":
     - Markdown: write `<slug>-<date>.md` to the cache dir, then `Sharing.shareAsync`;
     - PDF: `markdownToPrintHtml(md)`, then `expo-print` `printToFileAsync`, then share.
   - Use the messages already loaded in `threadStore`. If the thread is not loaded yet, call `hydrate` first.
2. **Project export:** in `ProjectDetailScreen.tsx`, add "Esporta progetto" (MD or PDF). The document holds:
   - the name, description and instructions;
   - the file list (path, size; no contents);
   - one section per project chat (the same match by `workspaceScope.project_path`) with `chatToMarkdown`.

   Hydrate the chats one at a time, at most 30, with a progress line "Chat 3/12". Cancelling stops the work and shares nothing.
3. **Server backup** (new settings section `backup` ("Backup"), after `system`, icon `backup-restore`):
   - the list of backups: date (from `created_at`), human-readable size, and a "più recente" badge on the first one;
   - the free disk space, plus a warning card when `workspace_included` is false ("La cartella di lavoro è fuori da ~/.nanobot e non è nel backup");
   - **"Crea backup ora"**, with a spinner and the long timeout; on success, refresh;
   - per row:
     - **Elimina**, behind a confirm `Dialog`;
     - **Ripristina**, behind a strong confirm `Dialog` that names the date and explains that the current data is kept on the server as a copy, that the gateway restarts, and that chats in progress stop. Confirm posts `confirm: true`, then calls the existing `useRestart().run` from `src/settings/store.ts`. Do not build a new restart path.
   - map the errors to i18n (`backup.inProgress`, `backup.notNanobot`, `backup.unsafe`, else `common.operationFailed`). Never show raw `err.message`.
   - **no download button**, and nothing that saves a server archive on the phone.
4. i18n keys go in both `it.json` and `en.json`. Use theme tokens and `th.font.*`, no `fontWeight`, touch targets ≥ 48dp.

## Tests (write first, no mocking of the export helpers or the section)
- `chatToMarkdown`:
  - user and assistant labels and order;
  - a fenced code block survives intact;
  - attachments become `[file: name]`;
  - tools are excluded by default and included with `includeTools`;
  - an empty chat still has a title.
- Chat export MD writes a `.md` and calls share. PDF goes through `markdownToPrintHtml` and print, then share.
- Project export:
  - includes the instructions, the file list and only that project's chats;
  - stops at 30 chats;
  - cancel shares nothing.
- Backup section:
  - the list renders newest first;
  - create shows a spinner, then refreshes;
  - a 409 shows `backup.inProgress`;
  - delete asks for confirm;
  - restore asks for a strong confirm, posts `confirm: true`, then calls the existing restart;
  - `workspace_included: false` shows the warning;
  - there is no element that downloads an archive.
- A profile switch mid-request drops the stale result.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- No edits to `mobile/vendor/**` or to server Python.
- Commit `feat(mobile): chat and project export, server backups`.
- Report in `mobile/docs/agy/reports/BK-A.md`. Say nothing was run on a device or against a live server.
