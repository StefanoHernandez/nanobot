# FX-2: review fixes for BK-A and PL-A (owner: agy)

Branch `agy/FX-2`, from `origin/main` (see the README: no rebase). BK-A and PL-A are already merged; Claude resolved the i18n, `SECTIONS` and `ProjectDetailScreen` conflicts.

## Export and backup (BK-A)
1. 🟡 **A stale generation leaves the UI stuck.** In `src/extras/backup.ts` every op shares `generation`, and `refresh()` (run on mount of `BackupSection`) bumps it.
   - What goes wrong: leaving and re-entering Settings while `create`, `remove` or `restore` runs makes the op return early. `creating` / `acting` are never cleared, so the spinner sticks and the buttons stay disabled.
   - Fix: the ops must check only that the **profile** is unchanged, not the refresh generation. Always clear `creating` / `acting` in `finally`.
   - Test: start `create`, call `refresh()` before it resolves, and after it resolves `creating` is false.
2. 🟡 **Restore succeeds but the gateway never restarts.** Same cause: after a successful `restore` POST, a refresh bump skips `runRestart`.
   - Fix: once the server answered OK, always run the restart, unless the profile changed.
   - Test: restore OK plus a refresh in between, and restart is called once.
3. 🟡 **The PDF export renders untrusted HTML.** Chat content can carry raw HTML that came from web pages or tool output.
   - What goes wrong: the regex sanitizer misses `<img src=http…>`, `<style>`, `<meta>`, `<base>`, `<form>` and `<svg>`, so rendering the PDF can make remote requests (tracking, or leaking chat text in a URL).
   - Fix, in the export HTML only:
     - **escape raw HTML tokens** (a `marked` renderer whose `html` prints the escaped text);
     - render images whose `src` is not `data:` as a plain text link `[image: <alt>]`, so nothing is fetched;
     - add `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">` to the export page.
   - Do not change `readingPages.ts` behaviour for the viewer.
   - Test: a message containing `<img src="https://x/y?q=secret">`, `<style>` and `<meta http-equiv=refresh>` produces HTML with no `https://x`, no `<style` from the message and no `<meta http-equiv="refresh"`, and the CSP meta is present.
4. 🟡 `ThreadScreen`: `void exportChat(...)` has no `catch`. Add one that shows `common.operationFailed`, plus a busy state (the same `export.exporting` text that `ProjectDetailScreen` uses). Test the error toast.
5. 🟡 `ensureChatMessages`: if `threadStore.load` fails or the thread is not loaded, **throw** instead of returning `[]`, so the caller shows the error. This replaces sharing an empty chat. Test it.
6. 🔵 `ProjectDetailScreen` export error: show `common.operationFailed`, not the raw `e.message`.
7. 🔵 `BackupSection`: remove the invisible `backup-creating-spinner` that exists only for the test. Test the `Button` loading state instead.

## Prompt library (PL-A)
8. 🟡 **PL-A-fix1 item 6 was not done.** `test/extras/prompts.test.tsx` still picks the delete confirm with `deleteBtns[deleteBtns.length - 1]`. Scope the query to the Dialog (`within(dialog)`) or give the confirm button its own label. No "last match" queries.
9. 🟡 **The picker can show another project's prompts.** `PromptPickerSheet` renders the shared `promptsStore` before its own fetch finishes.
   - Fix: filter the shown list to `project_id == null || project_id === currentProjectId`.
   - Test: the store holds project A's prompts, and the picker opened in a chat with no project shows only the global ones.
10. 🟡 `PromptEditorSheet`: the server limits are title 120 and body 20 000 chars, so set `maxLength` on both fields. Also map a 400 `invalid_*` to a clear i18n message (`prompts.tooLong`, it + en) instead of `common.operationFailed`.
11. 🔵 Search: filter with the **trimmed** query, as `hasSearch` already does.
12. 🔵 With an empty library, show `prompts.empty` even while a search is typed. `noMatches` is only for a non-empty library.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green, and every existing test stays green.
- No edits to `mobile/vendor/**` or to server Python.
- Commit `fix(mobile): export, backup and prompt library review fixes`.
- Report in `mobile/docs/agy/reports/FX-2.md`.
