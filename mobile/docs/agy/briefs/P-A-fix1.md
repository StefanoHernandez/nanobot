# P-A-fix1: Projects screens, review fixes (owner: agy)

Same branch `agy/P-A`, same worktree `../nanobot-agy`. The review of commit `e89715f9` found the issues below. Fix all **Important** items and the listed **Minor** ones. Write the tests first.

## Important
1. **Cross-profile race (`src/projects/store.ts` ~43-52).** A `refresh()` in flight from the old profile overwrites the list after `reset()`. Add a generation counter: `reset()` increments it, `refresh()` captures it before the fetch and drops the result if it changed.
   **Test:** start `refresh` on profile A, switch to B before it resolves, resolve A → the store is still empty, or holds B's data.
2. **Project pills missing until Projects is opened (`store.ts`, `ChatRow.tsx`).**
   - Load projects once when a session opens: subscribe to `sessionStore` `state === "open"` for the active profile, read-only, and call `refresh()`.
   - Also refresh when the drawer opens, at most once every 60 s.

   **Test:** a session opening triggers `listProjects`.
3. **Blank detail page on load failure (`ProjectDetailScreen.tsx` ~87, 118-119).** Render the `error`: a `BotFace` in state `error`, the i18n message and a "Riprova" button. Hide Edit and Archive while there is no project.
   **Test:** `getProject` rejects with `project_not_found` → the message and Riprova are shown, and Archive is not.
4. **Missing i18n keys show as raw keys (~156, 187, 240, 280, 316, 344).**
   - Add one helper, `projectErrorText(t, code)`: a known code maps to `projects.err.<code>`, anything else to `projects.err.generic`. Use it everywhere.
   - Add keys (it and en) at least for: `upload_timed_out`, `unauthorized`, `reserved_path`, `path_too_deep`, `file_not_found`, `invalid_name`, `missing_name`, `too_many_projects_with_this_name`, `length_required`, `io_error`, `network`, `generic`.

   **Test:** an unknown code → the generic text, never a string that starts with `projects.err.`.
5. **Raw server or network text in the UI (`ProjectsScreen.tsx` ~111, `ProjectDetailScreen.tsx` ~330).** Never show `error.message` from `session.get` or `newChat`. Map to i18n through the helper above: network failures go to `network`, everything else to `generic`.
6. **Instructions editor: Dialog and toast hidden under the editor Modal (~555-603, 187).**
   - Render the discard-confirm `Dialog` **inside** the editor Modal tree, so it is a child of the Modal content.
   - Show save errors inline in the editor (a text under the header, `destructive` colour), not as a toast.

   **Test:** a failed save shows the inline error while the editor stays open.
7. **Keyboard on Android (~570).** Use `behavior="padding"` on all platforms (Expo SDK 57 edge-to-edge; see `docs/wiki/known-issues.md`).

## Minor (fix these)
8. **Replace flow (~217-221):** a server `409 file_exists` must also open the "Sostituisci?" confirm, then retry with `X-Overwrite`, not only when the cached list knows the file.
9. **Progress (~284, 266-278):** count correctly ("3/3", not "2/2"), and show the progress row during the overwrite upload too.
10. **Size unknown (~209):** when `asset.size` is undefined, stat the file (`new File(uri).size`) before the 100 MB check.
11. **Clearing the description (~150):** send `description: ""` when the user empties it, not `undefined`.
12. **After archive (~342):** use `router.back()` (or `canGoBack ? back : replace`), so `/projects` doesn't end up on the stack twice.
13. **Archive button:** `variant="ghost"` in destructive text colour, as the brief says.
14. **Loading:** `loadData` sets `loading=true` (pull-to-refresh spinner). Fetch once on mount, not twice (mount effect plus focus listener).
15. **The name is shown twice (~383, 396):** keep it in the header only.
16. **Delete test:** assert that `fetch` was **not** called before the confirm is pressed.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- Commit `fix(mobile): projects review fixes (profile race, errors, editor, keyboard)`.
- Append a "fix1" section to `mobile/docs/agy/reports/P-A.md`, with each item → file:line.
