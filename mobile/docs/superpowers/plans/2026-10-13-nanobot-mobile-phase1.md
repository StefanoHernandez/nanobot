# nanobot mobile — Phase 1 (core chat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native React Native (Expo) Android app that connects to an unmodified nanobot gateway and provides the core chat experience: profiles, chat list, streaming thread with reasoning and tools, composer with slash commands, and our extras (per-chat effort, command drawer, status, notifications, text share, biometric lock).

**Architecture:** `mobile/` is an Expo app. nanobot's own WebUI protocol/projection code is copied unmodified into `mobile/vendor/nanobot/` by `scripts/sync-nanobot.sh`. Path aliases and polyfills in `src/platform/` make it run on React Native. Our code adds the session layer (`src/core`), Zustand stores (`src/state`), native UI (`src/ui`, `app/` routes) and extras (`src/extras`).

**Tech Stack:** Expo SDK 57 (`npx create-expo-app` blank-typescript template, deps added with `npx expo install` so versions match the SDK), expo-router, TypeScript strict, Zustand 5, react-native-mmkv, expo-secure-store, expo-crypto, expo-notifications, expo-local-authentication, expo-clipboard, expo-share-intent, i18next + react-i18next, jest-expo + @testing-library/react-native. Android toolchain from `env.sh` (`.toolchain/`).

**Spec:** `mobile/docs/superpowers/specs/2026-10-13-nanobot-mobile-design.md`

## Global Constraints

- Never modify the nanobot server; only `/webui/bootstrap`, `/api/*`, documented WS frames and `webui_request` actions.
- Never edit files under `mobile/vendor/nanobot/`; adapt in `src/platform/`. Keep its MIT `LICENSE` and `VERSION`.
- Vendor source pin: nanobot commit `cd2a863710ed4be21ba5426e71321fef6c05ad3d`.
- Android first; iOS must still typecheck. Local build only (no EAS).
- Secret only in SecureStore; never in logs, toasts or URLs.
- Effort order `none, low, medium, high, xhigh, max, adaptive`; derived preset `<base>·<level>` (U+00B7); clone fields name/provider/model/max_tokens/context_window_tokens/temperature.
- API token: proactive refresh at `expires_in − 30 s` (min 30 s), one single-flight re-bootstrap on 401; WS reconnect backoff 1 → 30 s.
- Errors from `webui_response` show `error.message`.
- Visual identity: nanobot WebUI tokens (light/dark) from `webui/src/globals.css`, adapted to mobile; touch targets ≥ 48 dp; Enter inserts newline, send button sends.
- UI strings via i18next, `it` and `en` at minimum.
- Ownership: tasks marked **[Claude]** are implemented by Claude subagents; **[agy]** by Antigravity in worktree `../nanobot_androidapp-agy` on branch `agy/T<n>` (brief in `mobile/docs/agy/briefs/T<n>.md`, report in `mobile/docs/agy/reports/T<n>.md`); Claude reviews and merges everything into `dev`.
- Every task updates `mobile/docs/wiki/log.md` with one line (task, owner, commits, review result).

## Review Focus

1. Gateway reached through `tailscale serve` over `https://…ts.net` (default port, TLS) → bootstrap/WS URLs use `https`/`wss` without `:443`. (Test in Task 3 `wsUrlFor`.)
2. App resumed after > 5 min in background → expired api token refreshed before the next REST call, WS reconnected, no duplicate events in the open thread. (Tests in Task 3 refresh tests and Task 5 dedupe test.)
3. A streaming turn interrupted by a dropped connection → the thread shows the partial answer once, then reconciles with `/webui-thread` on reconnect without duplicating messages. (Test in Task 5.)
4. Chat list containing non-websocket sessions (e.g. `telegram:123`) → shown read-only; per-chat effort and sending disabled for them. (Tests in Task 5 and Task 9.)
5. Very long answers/code blocks → list stays smooth (virtualized list, memoized message rows); no full re-render per delta. (Test in Task 7: delta updates only the streaming row.)

---

### Task 1 [Claude]: Scaffold, vendor sync, platform layer, agy worktree, wiki

**Files:**
- Create: `mobile/` (Expo app), `mobile/scripts/sync-nanobot.sh`, `mobile/vendor/nanobot/**` (generated), `mobile/src/platform/polyfills.ts`, `mobile/src/platform/storage.ts`, `mobile/babel.config.js`/`metro.config.js` alias, `mobile/tsconfig.json` paths, `mobile/jest.config.js`, `wiki/**`, `mobile/docs/agy/README.md`
- Test: `mobile/test/vendor-smoke.test.ts`

**Interfaces:**
- Produces:
  - Alias `@/lib/*` → `vendor/nanobot/webui/src/lib/*` (tsconfig paths + babel module-resolver) so vendor files import each other unmodified.
  - `installPolyfills(): void` (`src/platform/polyfills.ts`): sets `globalThis.localStorage` (MMKV-backed sync Storage), `crypto.randomUUID` fallback (expo-crypto), no-op `window.location`/`history` shims needed by vendor modules. Called first in `app/_layout.tsx`.
  - `kv: { get(k): string|null; set(k,v): void; del(k): void }` (`src/platform/storage.ts`, MMKV).
  - `sync-nanobot.sh <nanobot-checkout-dir>`: copies the explicit file list below, writes `vendor/nanobot/VERSION` (commit, date), copies `LICENSE`. Fails if any listed file is missing.
  - Vendor list (initial): `webui/src/lib/{nanobot-client,api,types,bootstrap,runtime,http,subagent-tasks,thread-event-projection,activity-timeline,media,tool-traces,model-request-failure,user-message-quote}.ts`, `packages/client-events/{attachments,delivery,notifications}.ts`, `packages/client-events/fixtures.json`. Add any further file only if a listed file imports it (transitive closure); record additions in the script.
- Repo workflow: create `git worktree add ../nanobot_androidapp-agy dev`; `mobile/docs/agy/README.md` explains brief/report/branch rules for agy (from spec section "Collaborazione con Antigravity").
- Wiki: run skill `codebase-wiki-llm:wiki-init` targeting `wiki/` with pages: overview, architecture, decisions (ADR-001 RN+vendor, ADR-002 no server changes, ADR-003 effort via presets), nanobot-protocol, phases, log, known-issues, updating-nanobot.

- [ ] **Step 1:** `npx create-expo-app@latest mobile --template blank-typescript`; add expo-router; `npx expo install` the Tech Stack packages; TS strict.
- [ ] **Step 2:** Write `sync-nanobot.sh`, run it against the clone at `/private/tmp/claude-501/-Users-stefano-Documents-Progetti-personali-nanobot-androidapp/33962b7b-3235-465c-b815-c102571c7842/scratchpad/src/nanobot` (or re-clone at the pinned commit), commit the vendor output.
- [ ] **Step 3: Write failing test** `test/vendor-smoke.test.ts`:
```ts
import { installPolyfills } from "../src/platform/polyfills";
installPolyfills();
import { NanobotClient } from "@/lib/nanobot-client";
import { projectThreadEvents } from "@/lib/thread-event-projection";
test("vendor client constructs with injected socket", () => {
  const sockets: string[] = [];
  const c = new NanobotClient({ url: "wss://h/?token=t", socketFactory: (u) => { sockets.push(u); return fakeSocket(); } });
  c.connect();
  expect(sockets).toEqual(["wss://h/?token=t"]);
});
test("projection turns delta events into one assistant message", () => {
  const msgs = projectThreadEvents([/* user_message + delta x2 + stream_end + turn_end for chat "c" */]);
  expect(msgs.filter(m => m.role === "assistant")).toHaveLength(1);
});
test("crypto.randomUUID exists", () => expect(typeof crypto.randomUUID()).toBe("string"));
```
  (Build the event literals from `vendor/nanobot/webui/src/lib/types.ts` `ThreadProjectionEvent`; `fakeSocket` is a minimal in-test WebSocket stub.)
- [ ] **Step 4:** `cd mobile && npx jest test/vendor-smoke.test.ts` → FAIL, then implement polyfills/aliases → PASS. `npx tsc --noEmit` clean.
- [ ] **Step 5:** `source ./env.sh && npx expo prebuild -p android && cd android && ./gradlew assembleDebug` → BUILD SUCCESSFUL (blank screen app).
- [ ] **Step 6:** Worktree + `mobile/docs/agy/README.md` + wiki init; commit `chore(mobile): scaffold, vendor nanobot client, platform layer, wiki`.

### Task 2 [agy]: Theme and base UI kit

**Files:**
- Create: `mobile/src/ui/theme.ts`, `mobile/src/ui/ThemeProvider.tsx`, `mobile/src/ui/components/{Button,TextField,IconButton,Sheet,Toast,ListItem,Dialog}.tsx`, `mobile/src/i18n/{index.ts,it.json,en.json}`
- Test: `mobile/test/ui/theme.test.ts`, `mobile/test/ui/components.test.tsx`

**Interfaces:**
- Consumes: Task 1 scaffold.
- Produces:
  - `type Theme = { colors: {background, foreground, card, cardForeground, primary, primaryForeground, muted, mutedForeground, border, destructive, accent, ...}; radius: {sm, md, lg}; font: {...}; spacing(n: number): number }`
  - `lightTheme`, `darkTheme` derived by converting the HSL tokens in nanobot `webui/src/globals.css` (`:root` and `.dark`) to hex; `useTheme(): Theme`; `ThemeProvider` follows system scheme with override `"system"|"light"|"dark"` persisted in `kv` key `ui.theme`.
  - Components with props: `Button({title, onPress, variant: "primary"|"secondary"|"ghost"|"destructive", disabled?, loading?})`, `TextField({label, value, onChangeText, secureTextEntry?, helper?, error?})`, `IconButton({icon, onPress, accessibilityLabel})` (≥ 48 dp target), `Sheet({open, onClose, children})` (bottom sheet), `toast.show(message: string)` + `<ToastHost/>`, `ListItem({title, subtitle?, onPress?, onLongPress?, right?})`, `Dialog({open, title, message, confirmLabel, onConfirm, onCancel, destructive?})`.
  - i18n: `i18n.t(key)`; language from device, fallback `en`; files contain keys used by Tasks 4, 6, 8, 10.

- [ ] **Step 1: Write failing tests:** `hslToHex("222.2 84% 4.9%")` equals the hex computed from the formula (assert `"#020817"`); `lightTheme.colors.background` and `darkTheme.colors.background` differ; `IconButton` renders with min height 48; `Dialog` calls `onConfirm` on confirm press.
- [ ] **Step 2:** `npx jest test/ui` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx jest test/ui && npx tsc --noEmit` → PASS.
- [ ] **Step 5:** Commit `feat(mobile): nanobot theme, base UI kit, i18n` on `agy/T2`; write `mobile/docs/agy/reports/T2.md`.

### Task 3 [Claude]: Connection core (profiles, session, token refresh)

**Files:**
- Create: `mobile/src/core/profiles.ts`, `mobile/src/core/session.ts`
- Test: `mobile/test/core/profiles.test.ts`, `mobile/test/core/session.test.ts`

**Interfaces:**
- Consumes: Task 1 polyfills, `kv`; vendor `fetchBootstrap(baseUrl, secret)` from `@/lib/bootstrap`, `NanobotClient` from `@/lib/nanobot-client`, `WebUIMutationTransport` from `@/lib/api`.
- Produces:
  - `type Profile = { id: string; name: string; baseUrl: string; hasSecret: boolean }`
  - `normalizeBaseUrl(input: string): string | null` (trim; default `http://`; http/https only; drop query/fragment/trailing `/`).
  - `profiles: { list(): Profile[]; save(p: Omit<Profile,"hasSecret">, secret: string): Promise<void>; remove(id): Promise<void>; getSecret(id): Promise<string>; activeId(): string|null; setActive(id): void }` (secrets in expo-secure-store key `secret.<id>`, metadata in `kv`).
  - `type ConnResult = { ok: true } | { ok: false; kind: "auth" | "unreachable" | "http"; message: string }`; `testConnection(baseUrl, secret): Promise<ConnResult>` (10 s timeout).
  - `wsUrlFor(baseUrl: string, wsPath: string, token: string): string` (http→ws, https→wss, keeps explicit non-default port, omits default).
  - `class NanobotSession` — `constructor(profile: Profile, secret: string, deps?: {fetch?, now?, setTimeout?, clearTimeout?, socketFactory?})`; `start(): Promise<void>`; `stop(): void`; `client: NanobotClient`; `get<T>(path: string): Promise<T>` (Bearer api token, 401 → single-flight re-bootstrap + one retry; second 401 → `state="auth_error"`); `mutate<T>(action, payload): Promise<T>` (via `client` as `WebUIMutationTransport`; errors carry `error.message`); `apiToken(): string`; `baseUrl`; `state: "connecting"|"open"|"reconnecting"|"auth_error"|"offline"` + `onState(cb): () => void`; proactive refresh timer at `max(30, expires_in − 30)` s, one timer only; `onReauth` passed to `NanobotClient` returns a fresh `wsUrlFor(...)` via new bootstrap; `resume(): void` (called on app foreground: reconnect now if not open).
  - Ruling for implementers: use the vendor client's own reconnect/backoff (`maxBackoffMs: 30000`); do not reimplement WS lifecycle.

- [ ] **Step 1: Write failing tests:**
```ts
expect(normalizeBaseUrl(" myhost.example-tailnet.ts.net ")).toBe("http://myhost.example-tailnet.ts.net");
expect(normalizeBaseUrl("https://myhost.example-tailnet.ts.net/?x=1#f")).toBe("https://myhost.example-tailnet.ts.net");
expect(normalizeBaseUrl("ftp://x")).toBeNull();
expect(wsUrlFor("https://h", "/", "t k")).toBe("wss://h/?token=t%20k");
expect(wsUrlFor("http://h:8765", "/ws", "t")).toBe("ws://h:8765/ws?token=t");
expect(wsUrlFor("https://h:443", "/", "t")).toBe("wss://h/?token=t");
// session (fake fetch/socket/timers):
// - 401 on GET → exactly one extra bootstrap even with 3 concurrent get(), all retried and resolved
// - second 401 after refresh → rejects, state "auth_error"
// - refresh timer fires at (300-30)*1000 ms; stop() clears it
// - testConnection: 403 → kind "auth"; network error → kind "unreachable"; 500 → kind "http"
// - mutate rejection with {status:409,message:"exists"} → Error("exists")
```
- [ ] **Step 2:** `npx jest test/core` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx jest test/core && npx tsc --noEmit` → PASS.
- [ ] **Step 5:** Commit `feat(mobile): profiles and nanobot session with token refresh`.

### Task 4 [agy]: Connect screen

**Files:**
- Create: `mobile/app/connect.tsx`, `mobile/src/screens/connect/ProfileForm.tsx`
- Test: `mobile/test/screens/connect.test.tsx`

**Interfaces:**
- Consumes: Task 2 UI kit + i18n; Task 3 `profiles`, `normalizeBaseUrl`, `testConnection`.
- Produces: route `/connect`. Saved profiles list (tap = select + open `/`, long-press = `Dialog` delete confirm naming the profile); form name/URL/secret (show/hide toggle, helper text it: "È `channels.websocket.tokenIssueSecret` in `~/.nanobot/config.json`, oppure la password del login della WebUI" + en equivalent); "Test e salva": invalid URL → field error; `auth` → secret field error "Segreto richiesto o errato" (+ en); `unreachable` → error "Server non raggiungibile — Tailscale attivo?" (+ en); ok → save, setActive, `router.replace("/")`. Button shows loading and ignores taps while testing. Insets-safe layout.

- [ ] **Step 1: Write failing tests** (mock `testConnection`): invalid URL shows field error and does not call `testConnection`; `{ok:false,kind:"auth"}` shows the secret error; ok result calls `profiles.save` once even on double tap; long-press → confirm → `profiles.remove(id)`.
- [ ] **Step 2:** `npx jest test/screens/connect.test.tsx` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** tests + `npx tsc --noEmit` → PASS.
- [ ] **Step 5:** Commit `feat(mobile): connect screen` on `agy/T4`; report `mobile/docs/agy/reports/T4.md`.

### Task 5 [Claude]: Session, sessions-list and thread stores

**Files:**
- Create: `mobile/src/state/sessionStore.ts`, `mobile/src/state/chatsStore.ts`, `mobile/src/state/threadStore.ts`, `mobile/src/state/SessionProvider.tsx`
- Test: `mobile/test/state/chats.test.ts`, `mobile/test/state/thread.test.ts`

**Interfaces:**
- Consumes: Task 3 `NanobotSession`; vendor `listSessions`, `fetchWebuiThread`, `deleteSession` (and the rename action the WebUI uses — find it in vendor `api.ts`), `projectThreadEvent`, `createThreadProjectionState`, `UIMessage` types.
- Produces:
  - `useSession(): { session: NanobotSession | null; state; profile }`; `SessionProvider` starts the active profile's session, calls `session.resume()` on AppState `active`, redirects to `/connect` on `auth_error`.
  - `useChats` (Zustand): `{ chats: ChatSummary[]; loading; refresh(); newChat(): Promise<string /*key*/>; newTemporaryChat(); rename(key, title); remove(key); search(q): ChatSummary[] }`, updated on `session_updated`/`sidebar_state_updated`. `isWritable(key) = key.startsWith("websocket:")`.
  - `useThread(key)` (Zustand slice per key): `{ messages: UIMessage[]; running: boolean; model: string|null; preset: string|null; notices: Notice[]; load(); send(text); stop(); }` — `load` fetches `/webui-thread` then subscribes `client.onChat(chatId, …)` and feeds `projectThreadEvent`; `send` uses `client.sendMessage`; `stop` sends `/stop`; reconcile after reconnect by reloading `/webui-thread` and replacing messages (no duplicates); only the streaming message object changes identity on `delta`.
  - `type Notice = { kind: "compaction"|"recovery"|"fallback"|"stream_error"|"retry"; text: string }`.

- [ ] **Step 1: Write failing tests** with a fake session/client emitting recorded events:
  - chats: `refresh` maps `/api/sessions` rows; `session_updated` updates title; `isWritable("telegram:1") === false`.
  - thread: user_message + 3 deltas + stream_end + turn_end → one user + one assistant message with concatenated text; `reasoning_delta` populates the reasoning part; tool `message` kind `tool_hint` appears in the activity part.
  - dedupe: deltas, then simulated reconnect + `/webui-thread` returning the completed turn → still exactly one assistant message.
  - identity: after a `delta`, all non-streaming message objects are `===` to before.
- [ ] **Step 2:** `npx jest test/state` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** tests + typecheck → PASS.
- [ ] **Step 5:** Commit `feat(mobile): session, chats and thread stores`.

### Task 6 [agy]: Drawer and chat list

**Files:**
- Create: `mobile/app/_layout.tsx` (drawer), `mobile/src/screens/chats/ChatDrawer.tsx`
- Test: `mobile/test/screens/chats.test.tsx`

**Interfaces:**
- Consumes: Task 2 UI kit; Task 5 `useChats`, `useSession`.
- Produces: drawer with search field, "Nuova chat" and "Chat temporanea" buttons, list (title, preview, running indicator, read-only badge for non-writable), long-press menu Rinomina (text dialog) / Elimina (confirm `Dialog`), header shows profile name + connection dot slot `<StatusDot/>` (placeholder component exported from `src/extras/StatusDot.tsx`, implemented in Task 10). Tap navigates to `/chat/[key]` (key URI-encoded).

- [ ] **Step 1: Write failing tests:** search filters by title; delete asks confirmation then calls `remove`; non-writable chat shows the read-only badge; new chat navigates to the returned key.
- [ ] **Step 2–4:** FAIL → implement → PASS (+ typecheck).
- [ ] **Step 5:** Commit `feat(mobile): chat drawer` on `agy/T6`; report.

### Task 7 [Claude]: Thread screen (messages, reasoning, activity, Markdown)

**Files:**
- Create: `mobile/app/chat/[key].tsx`, `mobile/src/screens/thread/{MessageList,MessageRow,ReasoningBlock,ActivityRow,NoticeRow,ModelBadge}.tsx`, `mobile/src/ui/markdown/{Markdown,CodeBlock,MathBlock}.tsx`
- Test: `mobile/test/screens/thread.test.tsx`, `mobile/test/ui/markdown.test.tsx`

**Interfaces:**
- Consumes: Task 5 `useThread`, `useChats.isWritable`; Task 2 UI kit.
- Produces: inverted virtualized list (FlashList if installed via `npx expo install @shopify/flash-list`, else FlatList) of memoized `MessageRow`s; assistant rows render Markdown (GFM tables, lists, links open externally), `CodeBlock` with syntax highlighting + copy button, `MathBlock` (KaTeX in a minimal sandboxed WebView: JS on, no file access, no bridge, `originWhitelist={["about:blank"]}`); `ReasoningBlock` collapsed by default with "Ragionamento" label and streaming indicator; `ActivityRow` "Lavorato per Xs · N strumenti" expandable list; `NoticeRow` for `Notice`; `ModelBadge` in header showing preset/model; Stop button in header while `running`; composer slot `<ComposerSlot/>` placeholder (Task 8). Non-writable chats show a read-only footer instead of the composer slot.

- [ ] **Step 1: Write failing tests:** a delta re-render renders only the streaming row (render-count spy on `MessageRow`); reasoning block toggles; code block copy calls `Clipboard.setStringAsync` with the code; Stop visible only while running and calls `stop()`; non-writable chat has no composer slot.
- [ ] **Step 2–4:** FAIL → implement → PASS (+ typecheck).
- [ ] **Step 5:** Commit `feat(mobile): thread screen with streaming, reasoning, activity, markdown`.

### Task 8 [agy]: Composer and slash menu

**Files:**
- Create: `mobile/src/screens/thread/Composer.tsx`, `mobile/src/screens/thread/SlashMenu.tsx`
- Modify: `mobile/app/chat/[key].tsx` (replace `ComposerSlot`)
- Test: `mobile/test/screens/composer.test.tsx`

**Interfaces:**
- Consumes: Task 5 `useThread(key).send/running`; `session.get("/api/commands")` → `{commands:[{command,title,description,icon,arg_hint?,accepts_args?}]}`; Task 2 UI kit.
- Produces: multiline input (Enter = newline), send button (disabled when empty), while `running` the send button becomes "Guida" and sends as follow-up exactly like the WebUI (`send` handles it); typing `/` at start opens `SlashMenu` filtered by prefix, selecting inserts `"/cmd "`; left slot `<EffortPillSlot chatKey/>` (placeholder exported from `src/extras/EffortPill.tsx`, implemented in Task 10); keyboard-avoiding and insets-safe.

- [ ] **Step 1: Write failing tests:** Enter inserts newline and does not send; send trims and calls `send` once; `/co` filters to `/compact`; selecting inserts `"/compact "`; empty input disables send.
- [ ] **Step 2–4:** FAIL → implement → PASS (+ typecheck).
- [ ] **Step 5:** Commit `feat(mobile): composer and slash menu` on `agy/T8`; report.

### Task 9 [Claude]: Extras logic (effort, commands, notifier)

**Files:**
- Create: `mobile/src/extras/logic.ts`, `mobile/src/extras/effort.ts`, `mobile/src/extras/notifier.ts`
- Test: `mobile/test/extras/*.test.ts`

**Interfaces:**
- Consumes: Task 3 `NanobotSession.get/mutate/client`; Task 5 stores. Port (do not import) the tested logic from branch `feat/nanodroid` `extras/src/logic.ts` and `features.ts` (`basePresetName`, `derivedPresetName`, `sortEfforts`, `groupCommands`, `loadEffortState`, `applyEffort`, `RefreshGuard`, `TurnNotifier`) and its tests, adapting the client type to `NanobotSession`.
- Produces:
  - `loadEffortState(session, sessionKey): Promise<{ base: Preset; current: string|null; levels: string[] } | null>`
  - `applyEffort(session, sessionKey, state, level): Promise<string>` — rejects `no_chat` for non-writable keys; creates derived preset if missing (re-reads `/api/settings` first); sends `/model <name>` via `session.client.sendMessage(chatId, …)`.
  - `useEffort(chatKey)` hook with `RefreshGuard` (stale results dropped on chat switch).
  - `groupCommands(cmds)` → groups session/memory/agent/other (same lists as Nanodroid).
  - `TurnNotifier` (one notification per turn incl. tool-only turns; skips when app active; skips `cancelled`/`failed`).

- [ ] **Step 1:** Port tests first (they fail: modules missing); add: `applyEffort` on `telegram:1` rejects `no_chat` with zero calls; derived name from `gpt·low` + `max` is `gpt·max`.
- [ ] **Step 2–4:** FAIL → implement → PASS (+ typecheck).
- [ ] **Step 5:** Commit `feat(mobile): effort, commands and notifier logic`.

### Task 10 [agy]: Effort pill/sheet, command drawer, status dot/panel UI

**Files:**
- Create/replace: `mobile/src/extras/EffortPill.tsx`, `mobile/src/extras/EffortSheet.tsx`, `mobile/src/extras/CommandDrawer.tsx`, `mobile/src/extras/StatusDot.tsx`, `mobile/src/extras/StatusPanel.tsx`
- Test: `mobile/test/extras/ui.test.tsx`

**Interfaces:**
- Consumes: Task 9 `useEffort`, `applyEffort`, `groupCommands`; Task 3 `session.state/get`; Task 2 UI kit.
- Produces: `EffortPill` (`⚡ <level>`, hidden when `useEffort` returns null) opening `EffortSheet` (segmented slider of levels; Apply shows loading, on error toast `error.message` and keep previous level); `CommandDrawer` (button in thread header opening a `Sheet` with grouped commands; commands with `accepts_args` ask for args via `Dialog` with text field; runs via `useThread.send`); `StatusDot` (green open / yellow connecting|reconnecting / red auth_error|offline) opening `StatusPanel` (version from `/api/settings` `version.current`, update notice from `/api/settings/version-check`, active preset (model), token usage from `/api/settings/usage`, "Esegui /status"); `OfflineBanner` shown under the header while state is `reconnecting`/`offline` for > 3 s: "Non raggiungibile — Tailscale attivo?" + "Riprova" (calls `session.resume()`), cached content stays visible.

- [ ] **Step 1: Write failing tests:** banner appears after 3 s of `reconnecting` and Riprova calls `resume`; pill hidden when state null; apply error shows toast with message and keeps level; command with args opens dialog and sends `"/goal <args>"`; dot color maps each state.
- [ ] **Step 2–4:** FAIL → implement → PASS (+ typecheck).
- [ ] **Step 5:** Commit `feat(mobile): effort, commands and status UI` on `agy/T10`; report.

### Task 11 [Claude]: Native integrations (notifications, share, lock)

**Files:**
- Create: `mobile/src/extras/notifications.ts`, `mobile/src/extras/share.ts`, `mobile/src/extras/lock.tsx`
- Modify: `mobile/app.json` (Android: `usesCleartextTraffic`, share intent filter for `text/plain`, permissions POST_NOTIFICATIONS, USE_BIOMETRIC), `mobile/app/_layout.tsx`
- Test: `mobile/test/extras/native.test.ts`

**Interfaces:**
- Consumes: Task 9 `TurnNotifier`; Task 5 stores; Task 8 composer (prefill via `useThread(key).setDraft(text)` — add `draft`/`setDraft` to the thread store if Task 5 did not).
- Produces: notification channel "Risposte", permission request once, tap opens the chat; share: incoming `text/plain` → `newChat()` → navigate → `setDraft(text)`; images ignored in Phase 1 with toast "Le immagini arrivano nella prossima versione" (+ en); lock: setting `lock.enabled` in `kv`, `LocalAuthentication.authenticateAsync` on cold start and after > 300000 ms in background, content hidden (blank overlay) until success, FLAG_SECURE via `expo-screen-capture` `preventScreenCaptureAsync` while enabled; if no hardware/enrollment → lock skipped and setting shows a warning.

- [ ] **Step 1: Write failing tests:** notifier wiring calls `scheduleNotificationAsync` once per turn_end in background; share of text creates chat and sets draft; lock due logic (`isRelockDue(lastBackground, now)` true at 300001 ms, false at 299999).
- [ ] **Step 2–4:** FAIL → implement → PASS (+ typecheck).
- [ ] **Step 5:** Commit `feat(mobile): notifications, text share, biometric lock`.

### Task 12 [Claude]: Settings entry, build, acceptance, wiki

**Files:**
- Create: `mobile/app/settings.tsx` (Phase 1 minimal: theme system/light/dark, lock toggle, change server, about with vendor VERSION + MIT attribution), `mobile/scripts/build-apk.sh`, `mobile/README.md`
- Modify: `wiki/*`

- [ ] **Step 1:** `build-apk.sh`: `source ./env.sh && npx expo prebuild -p android --clean && (cd android && ./gradlew assembleRelease)` signed with a local debug keystore → copies APK to `mobile/dist/nanobot-mobile-<version>.apk` (gitignored).
- [ ] **Step 2:** `npx jest && npx tsc --noEmit && scripts/build-apk.sh` all green; APK in `mobile/dist/`.
- [ ] **Step 3:** Device acceptance with the user (spec "Accettazione manuale" list) against `https://myhost.example-tailnet.ts.net`.
- [ ] **Step 4:** Update wiki (phases status, log, known-issues), README (install, connect, build, update-nanobot procedure, attribution). Commit `docs(mobile): phase 1 readme, wiki, build script`.

## Execution order and parallelism
| Wave | Claude | agy |
|---|---|---|
| 1 | T1 | — |
| 2 | T3 | T2 |
| 3 | T5 | T4 |
| 4 | T7 | T6 |
| 5 | T9 | T8 |
| 6 | T11 | T10 |
| 7 | T12 (+ acceptance) | — |
agy tasks start only after their consumed interfaces are merged into `dev`; agy rebases `agy/T<n>` on `dev` before starting.
