# P-A Report: Projects Screens (Instructions, Files, Project Chats)

- **Branch:** `agy/P-A`
- **Verification:**
  - `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`: PASS (64 test suites, 559 passed, 0 failed)
  - `npx tsc --noEmit`: PASS (0 errors)
- **Focused Test Suite:** `mobile/test/projects/projects.test.tsx` (11 passed) and `mobile/test/screens/chats.test.tsx` (6 passed)

---

## Files Changed and Created

### Created
1. `mobile/src/projects/api.ts` — Typed API client (`Project`, `FileEntry`, `ProjectDetail`, `CreateProjectInput`, `UpdateProjectInput`, `listProjects`, `getProject`, `createProject`, `updateProject`, `archiveProject`, `deleteProjectFile`, `uploadProjectFile`, `downloadProjectFile`).
2. `mobile/src/projects/store.ts` — Zustand store (`projectsStore`, `useProjects`) managing `projects`, `loading`, `error`, `refresh()`, `reset()`, and `byPath` lookup (both callable and property-indexed), with profile-switch reset listener.
3. `mobile/src/screens/projects/ProjectsScreen.tsx` — Projects list screen with `SettingsShell`-styled header, companion cards ("N file · M chat"), create project `Sheet`, pull-to-refresh, focus listener, and `BotFace` empty state.
4. `mobile/src/screens/projects/ProjectDetailScreen.tsx` — Project detail screen with 5 sections: Header (name/description with edit sheet), Istruzioni (preview + modal editor with dirty discard confirmation), File (type icons, size/date, tap to view/open, long-press destructive delete confirm, upload with conflict replace dialog and 100MB limit), Chat (filtered project chats with `ChatRow` + "Nuova chat nel progetto"), and Archivia progetto (destructive confirmation dialog).
5. `mobile/app/projects/index.tsx` — Expo Router route for `/projects`.
6. `mobile/app/projects/[id].tsx` — Expo Router route for `/projects/[id]`.
7. `mobile/test/projects/projects.test.tsx` — Test suite covering API client, List screen, Detail screen, and ChatRow project pill.
8. `mobile/docs/agy/reports/P-A.md` — This report.

### Modified
1. `mobile/src/screens/chats/ChatDrawer.tsx` — Added "Progetti" navigation entry with `folder-outline` icon between top buttons and search input.
2. `mobile/src/screens/chats/ChatRow.tsx` — Added reactive project pill badge (`brandSoft`/`brandSoftForeground`) when `chat.workspaceScope?.project_path` matches `projectsStore.byPath`.
3. `mobile/src/i18n/it.json` — Added all localized strings under `"projects"`, including error messages.
4. `mobile/src/i18n/en.json` — Added all localized strings under `"projects"`, including error messages.
5. `mobile/test/screens/chats.test.tsx` — Added test verifying drawer row navigates to `/projects`.

---

## Brief Items Implementation Details

| Item | Requirement | Implementation Details | File:Line |
|---|---|---|---|
| **1. API Types & Client** | `Project`, `FileEntry`, `ProjectDetail` types matching spec | Types defined with exact spec fields; error parser extracts `{ error }` code without leaking URLs or paths | `mobile/src/projects/api.ts:4-52` |
| **1. GET Endpoints** | `listProjects` → `session.get("/api/ext/projects")`; `getProject` → `session.get("/api/ext/projects/<id>")` | Implemented via typed `session.get` calls | `mobile/src/projects/api.ts:77-83` |
| **1. POST Endpoints** | JSON POST with Bearer token for `createProject`, `updateProject`, `archiveProject`, `deleteProjectFile` | `postJson` helper with `redirect: "error"`, `credentials: "omit"`, `Authorization: Bearer <token>`, and JSON body | `mobile/src/projects/api.ts:54-75,85-114` |
| **1. Raw File Upload** | `uploadProjectFile` with `new File(uri)`, `?path=`, `X-Overwrite: 1` when asked, 5m timeout via `AbortController` | Sets timeout abort, query parameter encoding, raw File body, and conditional overwrite header | `mobile/src/projects/api.ts:116-163` |
| **1. File Download** | `downloadProjectFile`: refuse > 32 MB with `Error("too_large")`, else download to `Paths.cache/projects/<id>/` | Size check before fetch; uses `File.downloadFileAsync` into project cache directory and returns file URI | `mobile/src/projects/api.ts:165-196` |
| **2. Projects Store** | Zustand store with `projects`, `loading`, `error`, `refresh()`, `byPath(path)`, clear on profile switch | `projectsStore` with dual-access `byPath` (callable function and object map); subscribed to `sessionStore` profile changes | `mobile/src/projects/store.ts:7-78` |
| **3. Drawer Navigation** | Row "Progetti" with `folder-outline` icon navigating to `/projects` | Inserted between quick buttons and search bar in `ChatDrawer` | `mobile/src/screens/chats/ChatDrawer.tsx:116-131` |
| **3. List Screen** | Header in `SettingsShell` style; companion cards with name, description (2 lines), file & chat counts; "Nuovo progetto" sheet; empty state | `ProjectsScreen` with `IconButton` back, card layout, `countChats` matching `workspaceScope.project_path`, create project `Sheet` with validation, and `BotFace` empty state | `mobile/src/screens/projects/ProjectsScreen.tsx:22-214` |
| **3. Detail: Header** | Display font name, description, "Modifica" button opening sheet | Section 1 in `ProjectDetailScreen` with edit sheet updating name and description | `mobile/src/screens/projects/ProjectDetailScreen.tsx:137-160,391-406,540-552` |
| **3. Detail: Istruzioni** | First ~6 lines preview; tap opens full-screen editor with `KeyboardAvoidingView`, save, and dirty discard confirm dialog | Section 2 with `numberOfLines={6}`, modal editor with `TextInput`, `KeyboardAvoidingView`, and discard confirmation dialog | `mobile/src/screens/projects/ProjectDetailScreen.tsx:162-191,408-438,554-603` |
| **3. Detail: File** | List with icon by extension, name, size, date; tap downloads and opens in `/viewer` or external; long-press destructive delete dialog; upload with progress, replace conflict dialog, >100MB limit | Section 3 with `fileIcon` mapping, `formatBytes`, `downloadProjectFile`, `openLocal` / `/viewer` routing, long-press delete `Dialog`, `DocumentPicker` upload queue with progress indicator, replace confirmation dialog, and 100MB size check | `mobile/src/screens/projects/ProjectDetailScreen.tsx:43-76,193-286,288-318,440-498,605-626` |
| **3. Detail: Chat** | Filter chats by `workspaceScope.project_path === project.path`, newest first with `ChatRow`; "Nuova chat nel progetto" calls `chatsStore.newChat({ project_path, access_mode: "restricted" })` | Section 4 filtering session chats, rendering `ChatRow`, and creating new chats scoped to project path with restricted access mode | `mobile/src/screens/projects/ProjectDetailScreen.tsx:320-332,363-365,500-526` |
| **3. Detail: Archivia** | Ghost destructive button behind confirmation `Dialog`; navigates back to `/projects` | Section 5 calling `archiveProject`, refreshing store, and replacing route to `/projects` | `mobile/src/screens/projects/ProjectDetailScreen.tsx:334-348,528-536,628-638` |
| **3. ChatRow Pill** | Small pill with project name (`brandSoft`/`brandSoftForeground`) when matching project path | Reactive `useProjects` selector checking `chat.workspaceScope?.project_path` against `byPath` | `mobile/src/screens/chats/ChatRow.tsx:27-33,45-60` |
| **4. Rules** | i18n everywhere (it & en), error mapping by code, no `console.*`, pull-to-refresh and focus refresh on both screens | Localized text and error codes; `RefreshControl` and `navigation.addListener("focus")` on both screens; no console statements | `mobile/src/screens/projects/ProjectsScreen.tsx:39-48,121`<br>`mobile/src/screens/projects/ProjectDetailScreen.tsx:125-134,389` |

---

## What Could Not Be Verified

- **Physical Device & Real Server Execution:** As required by the guidelines, nothing was run on a physical iOS/Android device or connected to a live nanobot server.
- File system interactions (`File.downloadFileAsync`) and document picker (`DocumentPicker.getDocumentAsync`) rely on Expo native modules mocked in the Jest environment.
- Verified in testing environment via:
  - 11 automated unit/integration tests in `mobile/test/projects/projects.test.tsx` covering the client API, List screen, Detail screen, and ChatRow project pill.
  - Complete Jest suite passing: 64 test suites, 559 tests passed, 0 failed.
  - TypeScript strict typecheck passing with 0 errors (`npx tsc --noEmit`).

---

## Raw Output of Verification Tools

### `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`

```text
Test Suites: 64 passed, 64 total
Tests:       559 passed, 559 total
Snapshots:   0 total
Time:        9.145 s
Ran all test suites.
```

### `npx tsc --noEmit`

```text
(exited with code 0, no output)
```
