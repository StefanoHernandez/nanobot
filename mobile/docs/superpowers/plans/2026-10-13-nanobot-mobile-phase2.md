# nanobot mobile, Phase 2 (advanced chat) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the app to WebUI parity for the chat itself: attachments, voice input, subagents, file-edit diffs, previews and gallery, fork, complete temporary chats, `@` mentions, MCP presets and CLI apps in the composer, workspace and access mode, the context popover, KaTeX, and the in-app file viewer.

**Architecture:**
- **Claude** extends the core (`src/core`, `src/state`) with the protocol pieces: upload capability, uploader, `send` options, voice, the subagents store, fork and temporary chats, workspace, and usage selectors. Every capability is reached through the vendored client.
- **agy** builds the screens and components on top of those interfaces.
- `mobile/vendor/**` is never edited.
- Detailed API map, with file:line references: `.superpowers/sdd/phase2-vendor-map.md`. Every task reads its section.

**Tech Stack:** Expo SDK 57, TypeScript strict, Zustand, expo-router, jest-expo + @testing-library/react-native, plus these new Expo modules:
- expo-document-picker
- expo-image-picker
- expo-image-manipulator
- expo-audio (recording)
- react-native-webview (KaTeX only)
- katex

**Spec:** `mobile/docs/superpowers/specs/2026-10-13-nanobot-mobile-design.md` (Fase 2, security, error table)

## Global Constraints
- Never modify the nanobot server, and never edit `mobile/vendor/**`. Browser-vs-RN gaps go in `src/platform/`.
- Secrets live only in SecureStore. Media and upload URLs and tokens are never logged, toasted, or put in share text.
- WebView is used only for formulas and web previews: isolated JS, no bridge to secrets, no file access (spec, Sicurezza).
- Upload limits come from bootstrap `limits.attachments`. Fallback: 4 files, 6 MiB each, 24 MiB total.
- Voice recordings: minimum 650 ms, maximum 120 s. Show the mic only when `settings.transcription.enabled && provider_configured`.
- At most 8 session mentions per message, deduped by `session_key`.
- Temporary chats get no history fetch, no draft persistence, no workspace controls, and no subagents. Leaving one sends `discardTemporaryChat`.
- UI rules (agy README): i18n for every string (it and en), theme colors only, touch targets of at least 48 dp, safe-area insets, keyboard handling.
- Dependencies are added with `npx expo install` only.
- Local builds only: `mobile/scripts/build-apk.sh`, no EAS.

## Review Focus
1. **Attachment over a limit** (count, file size, total), or a MIME type outside the whitelist: rejected before upload with a clear message, and the draft is kept. Tests: P2-A2.
2. **Socket reconnect between picking files and sending:** the upload capability changes on every `ready`. The upload must use the current token. If there is none, the send fails cleanly with the draft kept and no stale token. Test: P2-C1.
3. **Leaving a temporary chat** (back, drawer, app killed): it is discarded on the server, never listed, and never reattached. Test: P2-C4.
4. **Microphone permission denied,** or a recording shorter than 650 ms or longer than 120 s: a clear error, nothing sent. Test: P2-C2.
5. **`subagent_task` events for a chat that is not open:** not lost, and visible when the chat opens. They must not drain the vendor replay buffer; see known-issues: only threadStore subscribes `onChat`. Test: P2-C3.

## Execution waves
| Wave | Claude | agy |
|---|---|---|
| 1 | P2-C1 attachments core | P2-A1 file viewer (running) |
| 2 | P2-C2 voice core | P2-A3 diffs + gallery |
| 3 | P2-C3 subagents core | P2-A2 attachments UI (needs C1) |
| 4 | P2-C4 fork, temporary chats, workspace core | P2-A4 mentions, apps and presets picker (needs C1) |
| 5 | P2-C5 usage selectors + KaTeX | P2-A5 voice + subagents UI (needs C2, C3) |
| 6 | final review + fixes + APK | P2-A6 context popover, workspace, fork UI (needs C4, C5) |

agy tasks start only after the interfaces they consume are merged into `dev`.

---

### Task P2-C1 [Claude]: Attachments core (capability, uploader, `send` options)

**Files:**
- Modify: `mobile/src/core/session.ts` (expose `limits`, `capabilities`, `uploadCapability`), `mobile/src/platform/polyfills.ts` (`location.href`), `mobile/src/state/threadStore.ts` (`send` options)
- Create: `mobile/src/core/upload.ts`
- Test: `mobile/test/core/upload.test.ts`, extend `mobile/test/state/thread.test.ts`

**Interfaces:**
- Consumes: the vendor `AttachmentReference` and `uploadCapability` from `packages/client-events/attachments.ts`, `client.sendMessage(chatId, content, media?, options?)`, and the types `WebUIIngressLimits` and `SessionMention`.
- Produces:
  - `type LocalFile = { uri: string; name: string; mime: string; size: number }`
  - `NanobotSession.limits: WebUIIngressLimits["attachments"]`, with the fallback `{max_count:4, max_file_bytes:6*2**20, max_total_bytes:24*2**20}`
  - `NanobotSession.capabilities: ReadonlySet<string>`
  - `NanobotSession.uploadCapability: UploadCapability | null`, captured by the session's own `socketFactory` wrapper from every `ready` frame's `upload` field and cleared on close
  - `validateFiles(files: LocalFile[], limits): { ok: true } | { ok: false; reason: "count" | "file_size" | "total_size" | "type"; name?: string }`, using a MIME whitelist copied from the vendor map §1
  - `prepareImage(file: LocalFile, maxBytes: number): Promise<LocalFile>`, which re-encodes JPEG via expo-image-manipulator when over budget
  - `uploadFiles(session, files): Promise<AttachmentReference[]>`, which POSTs `${baseUrl}/api/attachments` sequentially with the upload token and a raw-file body
  - `threadStore.send(session, key, text, opts?: SendOpts): boolean`, with `SendOpts = { files?: LocalFile[]; cliApps?; mcpPresets?; sessionMentions?: SessionMention[]; workspaceScope? }`
  - `useThread`/`useThreadSlice().send(text, opts?)`
  - `ThreadSlice.sendError: string | null`
  - `ThreadSlice.pendingFiles: LocalFile[]` and `setPendingFiles(key, files)`. These are the composer's chips, kept in the store so share and navigation keep them. After a successful send they are cleared.
  - Image share: `app.json` share intent adds `image/*` (single and multiple). `share.ts` routes shared files to a new chat via `setPendingFiles`, alongside any text.

- [ ] **Step 1: write the failing tests:**
  - `validateFiles` rejects a fifth file (`count`), a 7 MiB file (`file_size`), files totalling 25 MiB (`total_size`) and `image/svg+xml` (`type`).
  - `uploadFiles` uses the token from the **latest** `ready` frame after a simulated reconnect.
  - `uploadFiles` with no capability rejects with `"upload_unavailable"` and makes no fetch.
  - `send("hi", {files:[a]})` uploads, then sends a frame whose `media` holds the returned references, and the optimistic row carries the `media` previews.
  - An upload failure leaves the draft intact, sets `sendError`, and marks the optimistic row failed.
  - The upload URL and token never reach `console.*`.
  - A shared image intent creates a new chat with `pendingFiles` holding that image, and sends nothing.
- [ ] **Step 2:** run the tests and watch them fail.
- [ ] **Step 3:** implement.
  - Use the `ready`-frame capture in the existing `socketFactory` wrapper, never the private `client.upload`.
  - Do not call vendor `sendAttachments`; it reads `window.location`. Upload with `uploadFiles`, then `client.sendMessage(chatId, text, refs, {...})`.
  - Still set `location.href = baseUrl` in the polyfill stub for any other vendor reader.
- [ ] **Step 4:** run `npx jest && npx tsc --noEmit` and confirm both pass.
- [ ] **Step 5:** commit `feat(mobile): attachment upload core and send options`.

### Task P2-C2 [Claude]: Voice core

**Files:**
- Create: `mobile/src/extras/voice.ts`
- Modify: `mobile/app.json` (expo-audio `microphonePermission` with text "nanobot usa il microfono per i messaggi vocali")
- Test: `mobile/test/extras/voice.test.ts`

**Interfaces:**
- Consumes: `client.transcribeAudio(dataUrl, {durationMs})`, and `GET /api/settings` `transcription`.
- Produces:
  - `voiceAvailable(settings): boolean`
  - `useVoiceInput(): { state: "idle"|"recording"|"transcribing"|"error"; elapsedMs: number; error: string | null; start(): Promise<void>; stop(): Promise<string | null> /* transcript */; cancel(): void }`
  - Recording format: m4a (`audio/mp4`), sent as a base64 data URL.

- [ ] **Step 1: write the failing tests:**
  - Permission denied leads to `error`, and nothing is sent.
  - A 500 ms recording gives error `tooShort`, and no `transcribe_audio` frame is sent.
  - The recording auto-stops at 120 s.
  - A `transcription_result` returns its text.
  - A `transcription_error` sets `error`.
  - A base64 payload larger than `limits`/`max_frame_bytes` is rejected locally.
  - `voiceAvailable` is false when `provider_configured` is false.
- [ ] **Steps 2–4:** watch them fail, implement, then confirm `npx jest && npx tsc --noEmit` pass.
- [ ] **Step 5:** commit `feat(mobile): voice input core`.

Ruling (recorded in the ledger at execution): the `xiaomi_mimo` WAV conversion is not supported in v1. That provider gets an error toast; cost: one provider unsupported.

### Task P2-C3 [Claude]: Subagents core

**Files:**
- Create: `mobile/src/state/subagentsStore.ts`
- Modify: `mobile/src/state/threadStore.ts` (route `subagent_task` from its existing `onChat` handler; no new `onChat` subscriber anywhere)
- Test: `mobile/test/state/subagents.test.ts`

**Interfaces:**
- Consumes: the vendor `mergeSubagentTasks`, `isSubagentTask`, `fetchSubagentTasks`, `fetchSubagentThread`, `cancelSubagentTask` and `projectThreadEvents`, plus `session.capabilities`.
- Produces:
  - `subagentsAvailable(session, key): boolean`: the key is `websocket:`, it is not temporary, and the capabilities include `webui.subagents.v1`.
  - `useSubagents(key): { tasks: SubagentTaskSnapshot[]; refresh(): Promise<void>; cancel(taskId): Promise<void> }`
  - `loadSubagentThread(session, key, taskId): Promise<UIMessage[]>`, read-only.

- [ ] **Step 1: write the failing tests:**
  - A `subagent_task` event emitted while the thread is loaded updates `tasks`. Merge follows `mergeSubagentTasks`.
  - Tasks fetched on open, plus live updates, have no duplicates.
  - Events buffered by the vendor before the chat opens are still replayed into the thread and the subagent store, with the store never calling `onChat`.
  - `cancel` sends the `subagent.cancel` mutation.
  - A temporary chat or a missing capability makes `subagentsAvailable` false.
- [ ] **Steps 2–4:** watch them fail, implement, confirm the tests pass.
- [ ] **Step 5:** commit `feat(mobile): subagents store`.

### Task P2-C4 [Claude]: Fork, temporary chats, workspace core

**Files:**
- Modify: `mobile/src/state/chatsStore.ts`, `mobile/src/state/threadStore.ts`
- Create: `mobile/src/state/workspace.ts`
- Test: `mobile/test/state/fork-temp-workspace.test.ts`

**Interfaces:**
- Consumes: `client.forkChat`, `client.discardTemporaryChat`, `client.newChat(timeout, scope)` and `client.setWorkspaceScope`, the `session_updated` event, `fetchWorkspaces`, `fetchWorkspaceDirectories` and `WebuiThreadPersistedPayload.fork_boundary_event_index`.
- Produces:
  - Forking and temporary chats:
    - `chatsStore.fork(key, beforeUserIndex, title?): Promise<string /*new key*/>`
    - `ThreadSlice.forkBoundary: number | null` (a message count)
    - `ThreadSlice.temporary: boolean`
    - `chatsStore.isTemporary(key)`
    - `threadStore.leave(session, key)`, which discards temporary chats; ThreadScreen calls it on unmount.
    - Temporary chats are kept in a local list with `deriveTemporaryChatTitle` (inlined) and never fetched.
  - Workspace:
    - `useWorkspace(key): { scope: WorkspaceScopePayload | null; info: WorkspacesPayload | null; browse(path, q?): Promise<WorkspaceDirectoriesPayload>; setScope(scope): Promise<void> }`
    - `withAccessMode(scope, mode)`
    - `chatsStore.newChat(scope?)`

- [ ] **Step 1: write the failing tests:**
  - Fork resolves to the new key, lists it, and computes `forkBoundary` from `events.slice(0, idx)`.
  - A temporary chat performs no `/webui-thread` fetch.
  - `leave` on a temporary chat sends `discard_temporary_chat` exactly once.
  - A temporary chat is not reattached after reconnect.
  - `setScope` sends `set_workspace_scope`, and `session_updated` updates `scope`.
  - A `workspace_scope_rejected` error leaves the old scope in place and sets an error.
- [ ] **Steps 2–4:** watch them fail, implement, confirm the tests pass.
- [ ] **Step 5:** commit `feat(mobile): fork, temporary chats, workspace scope`.

### Task P2-C5 [Claude]: Usage selectors + KaTeX

**Files:**
- Create: `mobile/src/state/usage.ts`, `mobile/src/ui/markdown/katex.ts`
- Modify: `mobile/src/ui/markdown/MathBlock.tsx` (and the inline math path in `Markdown.tsx`)
- Test: `mobile/test/state/usage.test.ts`, `mobile/test/ui/math.test.tsx`

**Interfaces:**
- Produces:
  - `latestContextUsage(messages): { contextTokens: number; contextWindowTokens: number | null } | null`
  - `recentRoundUsage(messages, max = 8): Array<{ inputTokens; outputTokens; cachedTokens; estimated: boolean; generationMs: number | null }>`
  - Both are ports of the upstream `ThreadShell.tsx:115-175` described in vendor map §9.
  - `MathBlock({ tex, inline? })` renders KaTeX.

- [ ] **Step 1: write the failing tests:**
  - The usage selectors return the last finished assistant `context_tokens`.
  - They stop at a successful compaction row.
  - They return at most 8 rounds, newest first.
  - `katexHtml("x^2")` contains `katex` markup.
  - Invalid TeX falls back to the raw TeX text.
- [ ] **Steps 2–4:** watch them fail, implement, confirm the tests pass.
  - KaTeX: `katex.renderToString` (pure JS) feeds a `react-native-webview` with `javaScriptEnabled={false}`, `originWhitelist={[]}`, no `onMessage`, and the KaTeX CSS and fonts bundled locally.
  - Height uses a fixed estimate per line count (ponytail comment; upgrade path: an `onMessage` height bridge).
- [ ] **Step 5:** commit `feat(mobile): usage selectors and KaTeX formulas`.

### Task P2-A1 [agy]: In-app file viewer
Brief: `mobile/docs/agy/briefs/P2-A1.md`, already dispatched.

### Task P2-A2 [agy]: Attachments UI
- **Files:**
  - `mobile/src/screens/thread/AttachmentBar.tsx` (chips with thumbnail or icon, name, size and remove)
  - attach button in `Composer.tsx` opening a Sheet with "Foto" (expo-image-picker, multiple) / "File" (expo-document-picker, multiple)
  - test `mobile/test/screens/attachments.test.tsx`
- **Consumes** P2-C1: `LocalFile`, `validateFiles`, `prepareImage`, `session.limits`, `send(text, {files})`, `sendError`, and `pendingFiles`/`setPendingFiles` (the chips live in the store, not in local state).
- **Behaviour:**
  - Images go through `prepareImage(file, limits.max_file_bytes)`.
  - Validation errors show a toast with the i18n reason, and the file is not added.
  - Send passes `files`, and the chips clear only when `send` returns true and no `sendError` appears.
  - The attach button is hidden for read-only chats.
- **Tests:**
  - a fifth file is refused with a toast;
  - remove drops a chip;
  - send passes the files and clears them;
  - with `sendError` set, the chips are kept.

### Task P2-A3 [agy]: File-edit diffs + gallery
- **Files:**
  - `mobile/src/screens/thread/FileEditList.tsx` (renders `UIMessage.fileEdits` in activity rows)
  - `mobile/src/screens/thread/DiffView.tsx` (unified diff split by lines: `+` added, `-` deleted, `@@` hunk header, colored with theme tokens; collapsible; "troncato" when `truncated`)
  - `mobile/app/gallery/[key].tsx` (grid of every image in the thread, from `messages[].media` / `.images` via `classify`, with the full-screen lightbox and swipe)
  - a gallery `IconButton` in the thread header when the thread has images (only that one header addition)
  - test `mobile/test/screens/diffs-gallery.test.tsx`
- **Tests:**
  - the diff colors `+` and `-` lines and shows `path +added −deleted`;
  - status `error` shows the error text;
  - the gallery lists 3 images from 2 messages.

### Task P2-A4 [agy]: `@` mentions, CLI apps, MCP presets in the composer
- **Files:**
  - `mobile/src/screens/thread/MentionMenu.tsx`
  - `mobile/src/screens/thread/mentions.ts` (pure: candidates and payload builders)
  - Composer integration
  - test `mobile/test/screens/mentions.test.tsx`
- **Consumes:** `GET /api/sessions` rows with `handle`, `GET /api/settings/cli-apps?installed_only=1`, `GET /api/settings/mcp-presets` (filter: `source !== "agent-plugin" && (enabled ?? (installed && configured))`), the payload shapes in vendor map §6-7, and P2-C1 `send(text, {sessionMentions, cliApps, mcpPresets})`.
- **Behaviour:**
  - Typing `@` at a word start opens a menu with three sections; selecting inserts `@name `.
  - The structured lists are kept in sync with the text: an item is removed when its token is deleted.
  - At most 8 session mentions.
- **Tests:**
  - `@co` filters;
  - selecting a session builds a `SessionMention` with a `handle_` id;
  - a ninth mention is refused;
  - deleting the token drops it from the payload;
  - send passes all three lists.

### Task P2-A5 [agy]: Voice button + subagents UI
- **Files:**
  - `mobile/src/screens/thread/VoiceButton.tsx` (in the composer, shown when `voiceAvailable`; press to start, press to stop; shows the elapsed time; the transcript is appended to the draft, **not sent**)
  - `mobile/src/screens/thread/SubagentsSheet.tsx` (a header badge with the running count; the sheet lists the tasks with status, cancel and open)
  - `mobile/app/chat/[key]/subagent/[id].tsx` (a read-only thread, reusing `MessageList`)
  - test `mobile/test/screens/voice-subagents.test.tsx`
- **Consumes** P2-C2 `useVoiceInput`, `voiceAvailable`, and P2-C3 `useSubagents`, `loadSubagentThread`, `subagentsAvailable`.
- **Tests:**
  - stop appends the transcript to the draft and does not send;
  - an error shows a toast;
  - the badge count equals the running tasks;
  - cancel calls `cancel(id)`;
  - the subagent screen has no composer.

### Task P2-A6 [agy]: Context popover, workspace picker, fork UI, temporary-chat UI
- **Files:**
  - `mobile/src/screens/thread/ContextPopover.tsx` (a ring with % of the context window plus bars per round; opened from a small indicator next to the EffortPill)
  - `mobile/src/screens/thread/WorkspaceSheet.tsx` (current folder, recent and favourite folders, browse directories, access-mode toggle restricted/full; hidden for temporary chats or when `controls.can_change_project` is false)
  - fork: long-press on a finished assistant message gives "Crea fork da qui" and calls `fork(key, nextUserIndex)`, then navigates; a divider "Fork da qui" at `forkBoundary`
  - temporary chat: a header label "Temporanea" and no subagents/workspace buttons
  - test `mobile/test/screens/context-workspace-fork.test.tsx`
- **Consumes** P2-C4 and P2-C5.
- **Tests:**
  - the ring shows 50% for 64k/128k;
  - with no usage, it is hidden;
  - a fork long-press calls `fork` with the right index;
  - the divider renders at the boundary;
  - the workspace toggle calls `setScope(withAccessMode(scope,"full"))`;
  - the temporary chat hides the workspace button.
