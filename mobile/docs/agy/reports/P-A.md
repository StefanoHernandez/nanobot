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

---

## fix1 Review Fixes

- **Verification:**
  - `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`: PASS (64 test suites, 568 passed, 0 failed)
  - `npx tsc --noEmit`: PASS (0 errors)
- **Focused Test Suite:** `mobile/test/projects/projects.test.tsx` (20 passed)

### Files Touched in fix1
1. `mobile/src/projects/api.ts` — Centralized `projectErrorText(t, code)` helper and `KNOWN_PROJECT_ERRORS` set.
2. `mobile/src/projects/store.ts` — Added `generation` counter for cross-profile race prevention, `lastRefreshedAt` with `opts?.ifStaleMs` throttle, safe `sessionStore` access, and subscription on `sessionStore` `state === "open"`.
3. `mobile/src/screens/chats/ChatDrawer.tsx` — Added mount `useEffect` refreshing projects when stale (`ifStaleMs: 60_000`).
4. `mobile/src/screens/projects/ProjectsScreen.tsx` — Replaced raw error strings with centralized `projectErrorText(t, error)`.
5. `mobile/src/screens/projects/ProjectDetailScreen.tsx` — Handled blank detail error state with `BotFace state="error"` + retry; inline instructions error banner; discard dialog mounted inside modal; fixed `behavior="padding"` on `KeyboardAvoidingView`; upload 409 conflict handling; upload progress preservation during overwrite; `File` stat fallback for undefined size; empty description sent as `""`; archive navigation via `canGoBack()`; ghost destructive archive button; deduped mount `loadData()`; removed duplicate title in Section 1.
6. `mobile/src/ui/components/Button.tsx` — Added optional `color?: string` prop to allow custom foreground color overrides (e.g. destructive ghost button).
7. `mobile/src/i18n/it.json` — Added error codes (`upload_timed_out`, `unauthorized`, `reserved_path`, `path_too_deep`, `file_not_found`, `invalid_name`, `missing_name`, `too_many_projects_with_this_name`, `length_required`, `io_error`, `network`, `generic`) and `noDescription`.
8. `mobile/src/i18n/en.json` — Added error codes and `noDescription`.
9. `mobile/test/projects/projects.test.tsx` — Added tests for cross-profile race, session open refresh, `projectErrorText`, blank detail error state, inline instructions error, description clearing, archive navigation, and unconfirmed delete assertion.

### Implementation Matrix

| Item | Description | Implementation Details | File:Line |
|---|---|---|---|
| **1** | Cross-profile race condition | `generation` counter incremented on `reset()`; if generation changed before fetch resolves, results are discarded | `mobile/src/projects/store.ts:8,48-69,78` |
| **2** | Sincronizzazione con sessionStore | `lastRefreshedAt` + `ifStaleMs` throttle; `sessionStore.subscribe` triggers refresh on `state === "open"`; `ChatDrawer` refreshes with `ifStaleMs: 60_000` | `mobile/src/projects/store.ts:9,44,95-97`<br>`mobile/src/screens/chats/ChatDrawer.tsx:63-65` |
| **3** | Blank detail screen on network error | Dedicated error state when `error && !detail` with `BotFace state="error"`, localized message, and `common.retry` button; actions hidden | `mobile/src/screens/projects/ProjectDetailScreen.tsx:382-411` |
| **4** | Codici errore API non mappati | Added all missing error keys to `it.json` and `en.json` | `mobile/src/i18n/it.json:808,814-826`<br>`mobile/src/i18n/en.json:808,814-826` |
| **5** | Centralizzare mapping errori API | Centralized helper `projectErrorText(t, code)` with known codes set, regex network fallback, and generic fallback | `mobile/src/projects/api.ts:54-75`<br>`mobile/src/screens/projects/ProjectsScreen.tsx:78,110`<br>`mobile/src/screens/projects/ProjectDetailScreen.tsx:156,182,212,238,287,302,321,344,376,403` |
| **6** | Modal di scarto istruzioni occluso | Discard `Dialog` moved inside `<Modal visible={editorOpen}>`; instructions save failure displays inline error banner below header with destructive text | `mobile/src/screens/projects/ProjectDetailScreen.tsx:101,173-194,632-638,649-662` |
| **7** | KeyboardAvoidingView behavior "padding" | Set `behavior="padding"` unconditionally on editor `KeyboardAvoidingView` | `mobile/src/screens/projects/ProjectDetailScreen.tsx:640` |
| **8** | Riconoscere errore 409 file_exists su upload | Catch `file_exists` error during upload to trigger conflict replace dialog | `mobile/src/screens/projects/ProjectDetailScreen.tsx:232-237` |
| **9** | Upload progress con overwrite | Preserved original `total` and `currentIndex` across conflict states; progress shows during overwrite upload | `mobile/src/screens/projects/ProjectDetailScreen.tsx:105-115,221-224,254-275` |
| **10** | Dimensione file indefinita | Fallback stat check via `new File(currentAsset.uri).size` before 100MB check | `mobile/src/screens/projects/ProjectDetailScreen.tsx:202-215` |
| **11** | Svuotamento descrizione in edit sheet | Send empty string `""` (`editDescription.trim()`) instead of `undefined` in patch payload | `mobile/src/screens/projects/ProjectDetailScreen.tsx:149` |
| **12** | Navigazione post-archiviazione | Uses `router.canGoBack() ? router.back() : router.replace("/projects")` | `mobile/src/screens/projects/ProjectDetailScreen.tsx:327-331` |
| **13** | Stile pulsante 'Archivia progetto' | Changed to `variant="ghost"` with `color={th.colors.destructive}`; added `color` prop to `ButtonProps` | `mobile/src/ui/components/Button.tsx:22,39`<br>`mobile/src/screens/projects/ProjectDetailScreen.tsx:595-596` |
| **14** | Doppia invocazione di loadData() | Added `setLoading(true)` in `loadData()`; guarded focus listener with `isFirstRender` ref | `mobile/src/screens/projects/ProjectDetailScreen.tsx:91,115,131-135` |
| **15** | Header dettaglio senza nome duplicato | Removed duplicate title from Section 1; shows description or `projects.noDescription` ("Nessuna descrizione") in muted italic style | `mobile/src/screens/projects/ProjectDetailScreen.tsx:453-471` |
| **16** | Test eliminazione file prima di conferma | Asserted `expect(fetch).not.toHaveBeenCalled()` prior to dialog confirmation | `mobile/test/projects/projects.test.tsx:452` |

### What Could Not Be Verified
- Physical mobile device interaction (gestures, hardware back button, native keyboard animations).
- Real remote backend network timeouts and server responses.
- Verified in Jest environment (SDK 57 components and hooks mocked) with complete test suite passing (64 test suites, 568 tests) and TypeScript typecheck (0 errors).

### Raw Output of Verification Tools

#### `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`

```text
PASS test/fixes/fix-a.test.tsx
PASS test/screens/ecosystem-channels.test.tsx
PASS test/screens/settings.test.tsx
PASS test/screens/models-settings.test.tsx
PASS test/screens/attachments.test.tsx
PASS test/screens/ecosystem-automations.test.tsx
PASS test/screens/capabilities-settings.test.tsx
PASS test/fixes/m-a.test.tsx
PASS test/fixes/fix-a-fix1.test.tsx
PASS test/screens/media.test.tsx (5.139 s)
PASS test/extras/speech.test.tsx (5.211 s)
PASS test/ui/components.test.tsx
PASS test/state/fork-temp-workspace.test.ts
PASS test/screens/artifacts.test.tsx
PASS test/ecosystem/apps-skills-automations.test.ts
PASS test/screens/ecosystem-skills.test.tsx
PASS test/settings/store.test.ts
PASS test/extras/widget.test.tsx
PASS test/ecosystem/channels.test.ts
PASS test/screens/history-error.test.tsx (5.467 s)
PASS test/extras/voice.test.ts
PASS test/screens/connect.test.tsx
PASS test/extras/useEffort.test.tsx
PASS test/extras/native.test.tsx
PASS test/state/chats.test.ts
PASS test/screens/composer.test.tsx
PASS test/settings/models-providers.test.ts
PASS test/core/session.test.ts
PASS test/state/thread.test.ts
PASS test/ui/math.test.tsx
PASS test/core/upload.test.ts
PASS test/core/profiles.test.ts
PASS test/state/thread.integration.test.ts
PASS test/state/sessionStore.test.ts
PASS test/state/subagents.test.ts
PASS test/vendor-smoke.test.ts
PASS test/extras/notifier.test.ts
PASS test/ui/theme.test.ts
PASS test/state/usage.test.ts
PASS test/settings/runtime-capabilities.test.ts
PASS test/platform.test.ts
PASS test/extras/logic.test.ts
PASS test/ui/botface.test.tsx
PASS test/vendorVersion.test.ts
PASS test/ui/anyimage.test.tsx
PASS test/extras/effort.test.ts
PASS test/screens/thread.test.tsx (6.06 s)
PASS test/screens/mainLayout.test.tsx (6.086 s)
PASS test/extras/outbox.test.tsx (6.088 s)
PASS test/projects/projects.test.tsx

Test Suites: 64 passed, 64 total
Tests:       568 passed, 568 total
Snapshots:   0 total
Time:        7.319 s
Ran all test suites.
```

#### `npx tsc --noEmit`

```text
(exited with code 0, no output)
```

