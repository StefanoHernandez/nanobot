# P-A: Projects screens (owner: agy)

Branch `agy/P-A`, created from `claude/projects`. Worktree `../nanobot-agy`.

## Read first
1. `mobile/docs/agy/README.md`: the rules.
2. `mobile/docs/superpowers/specs/2026-10-15-projects-design.md`: **the spec**. Use the exact API routes and types.
3. `mobile/docs/design/companion.md`: the design. Use tokens and `th.font.*` only, no `fontWeight`, and touch targets ≥ 48 dp.
4. Reference code:
   - `src/core/upload.ts` `uploadFiles`: how to POST a local file as a raw body with a Bearer token;
   - `src/screens/thread/media/media.ts` `downloadMedia`, and `MediaViews.tsx` `FileCard`: download, then open in `/viewer`;
   - `src/state/chatsStore.ts` `newChat(scope)`;
   - `src/screens/settings/SettingsShell.tsx`: header style.

## Scope (only these files)
- New: `src/projects/api.ts`, `src/projects/store.ts`, `src/screens/projects/**`, `app/projects/index.tsx`, `app/projects/[id].tsx`
- Edit: `src/screens/chats/ChatDrawer.tsx` (one entry), `src/screens/chats/ChatRow.tsx` (project label)
- `src/i18n/it.json` and `src/i18n/en.json`
- New tests under `test/`

Never edit `src/state/**`, `src/core/**`, `src/platform/**` or `vendor/**`: read only.

## 1. `src/projects/api.ts`: a typed client, no UI
- **Types:** `Project` and `FileEntry`, exactly as in the spec.
- **GET:**
  - `listProjects(session)` → `session.get("/api/ext/projects")`;
  - `getProject(session, id)` → `{ project, instructions, files, truncated }`.
- **POST:** use `fetch(\`${session.baseUrl}${path}\`, { method: "POST", headers: { Authorization: \`Bearer ${session.apiToken()}\` } })`, with `redirect: "error"` and `credentials: "omit"`.
  - `createProject(session, { name, description?, instructions? })`, `updateProject(session, id, patch)`, `archiveProject(session, id)`, `deleteProjectFile(session, id, path)`: JSON body, `Content-Type: application/json`.
  - `uploadProjectFile(session, id, relPath, localFile: { uri, name, mime })`: raw body `new File(uri)`, as in `uploadFiles`; query `?path=${encodeURIComponent(relPath)}`; header `X-Overwrite: 1` only when asked. Timeout 5 min with `AbortController`.
- **Errors:** throw `new Error(code)`, using the server's `{ error }` code. Never put the URL, token or path in the message.
- `downloadProjectFile(session, id, file: FileEntry)`:
  - refuses `file.size > 32 * 1024 * 1024` with `Error("too_large")`;
  - otherwise uses `File.downloadFileAsync(url, dest, { headers: { Authorization: Bearer… }, idempotent: true })` into `Paths.cache/projects/<id>/` and returns the local URI.

## 2. `src/projects/store.ts`: a Zustand store
- `projects`, `loading`, `error`, `refresh()`, and `byPath(path)` (map from the project's absolute path to the project, for the chat label).
- Clear on profile switch: subscribe to `sessionStore` profile id changes, read-only, the same pattern as other stores.

## 3. Screens
- **Drawer (`ChatDrawer.tsx`):** a row "Progetti" with a `folder-outline` icon, between the buttons and the search; it navigates to `/projects`.
- **`/projects` (list):**
  - header in the `SettingsShell` style, title "Progetti";
  - cards in the companion style with name, description (2 lines) and "N file · M chat". Count the chats from `chatsStore` sessions whose `workspaceScope.project_path` equals `project.path`;
  - a "Nuovo progetto" primary button opens a `Sheet` with name (required) and description; it creates the project and navigates to it;
  - empty state: `BotFace` idle plus an invitation text.
- **`/projects/[id]` (detail):** one scroll with these sections, each with a Bricolage title.
  1. **Header:** name in the display font and the description. Tap "Modifica" for a sheet that edits name and description.
  2. **Istruzioni:** the first ~6 lines of `instructions`, muted. Tap opens a full-screen editor: a multiline `TextInput` with `KeyboardAvoidingView behavior="padding"`, Save calls `updateProject({ instructions })`, and leaving with unsaved changes asks for confirmation through a `Dialog`.
  3. **File:**
     - a list with an icon by type, name (the relative path), size and date;
     - tap downloads, then opens `/viewer` when `viewerKind(name)` is not null, or system open/share otherwise (as in `FileCard`);
     - long-press, then "Elimina" behind a confirm `Dialog`;
     - "Carica file" uses `expo-document-picker`, multiple; upload one by one, with a progress row "Caricamento 2/3…". If the name exists, ask "Sostituisci?", then retry with overwrite;
     - files over 100 MB: refuse before uploading, with a toast.
  4. **Chat:**
     - the chats whose `workspaceScope.project_path === project.path`, newest first, rendered with `ChatRow`;
     - "Nuova chat nel progetto" calls `chatsStore.getState().newChat({ project_path: project.path, access_mode: "restricted" })` and navigates to the chat.
  5. **Archivia progetto:** a ghost destructive button at the bottom, behind a confirm `Dialog` ("Il progetto viene spostato in archivio sul server; i file non vengono cancellati"). Then go back to `/projects`.
- **`ChatRow.tsx`:** when `chat.workspaceScope?.project_path` matches a project in `projectsStore.byPath`, show a small pill with the project name (`brandSoft`/`brandSoftForeground`, max 1 line).

## 4. Rules
- All strings through i18n (it and en).
- Errors map to i18n by code (`project_not_found`, `file_exists`, `file_too_large`, `disk_full`, `invalid_path`, `too_large`, a generic fallback). Never show raw server text or paths.
- No `console.*`.
- Pull to refresh on both screens. Refresh the detail on focus.

## Tests (write first)
- **api:**
  - `createProject` sends POST JSON with the Bearer header;
  - `uploadProjectFile` sends the raw body with `?path=` encoded and `X-Overwrite` only when asked;
  - a server `{error:"file_exists"}` 409 → `Error("file_exists")`;
  - `downloadProjectFile` refuses over 32 MB.

  Mock `fetch` and `File.downloadFileAsync`, not the api module.
- **List screen:** renders the projects from a fake session; "Nuovo progetto" plus a name → POST, then navigation.
- **Detail screen:**
  - shows the instructions preview, the files and only the matching chats;
  - "Nuova chat nel progetto" calls `newChat` with the right `workspace_scope`;
  - deleting a file asks for confirmation first.
- **ChatRow:** shows the project pill only for a matching path.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- Commit `feat(mobile): projects screens (instructions, files, project chats)`.
- Report in `mobile/docs/agy/reports/P-A.md`, per README "Before you say done". Say nothing was run on a device or against a real server.
