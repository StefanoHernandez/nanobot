# Nanodroid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Android APK that wraps the WebUI served by an unmodified nanobot gateway and adds a per-chat reasoning-effort slider, a command drawer, a status panel, notifications, sharing, biometric lock and a theme.

**Architecture:** Native Kotlin shell (3 Activities, View system) hosts a WebView pointed at `{baseUrl}/`. On every page load it injects `theme.css` and `extras.js` from APK assets. `extras.js` (TypeScript, esbuild IIFE) renders its own UI inside a Shadow DOM and talks to nanobot through its own bootstrap + WebSocket connection, using only public endpoints.

**Tech Stack:** Kotlin 2.0.21, AGP 8.7.3, Gradle 8.10.2, compileSdk/targetSdk 35, minSdk 26, AndroidX (appcompat 1.7.0, webkit 1.12.1, security-crypto 1.1.0-alpha06, biometric 1.1.0), material 1.12.0, JUnit 4.13.2, org.json 20240303 (test only). extras: TypeScript 5.6, esbuild 0.24, vitest 2.1, Node from host.

**Spec:** `mobile/docs/superpowers/specs/2026-10-13-nanodroid-design.md`

## Global Constraints

- Never modify nanobot. Only use `/webui/bootstrap`, `/api/*`, documented WS frames and the WebUI hash routing.
- Any extra whose capability check fails hides itself; the WebUI keeps working.
- Package / applicationId: `dev.nanodroid`. App name: `Nanodroid`. License: MIT. Description says "unofficial client for nanobot".
- minSdk 26, targetSdk 35.
- Secret is optional. When present it is stored in EncryptedSharedPreferences, never in logs or URLs other than the one-time `#/?bootstrapSecret=` first load.
- extras UI lives in one Shadow DOM host `#nanodroid-root`; it never writes to the WebUI DOM except the composer fill for sharing (Task 6).
- extras strings in Italian and English, chosen from `getConfig().lang` (`it*` → Italian, else English).
- Toolchain: always `source env.sh` before gradle/sdk commands. Nothing installed outside `.toolchain/`.
- WS client id for extras: `nanodroid-extras`.
- Effort canonical order: `none, low, medium, high, xhigh, max, adaptive`. Derived preset name: `<base>·<level>` (U+00B7).
- Reconnect backoff: 1 s doubling to max 30 s; re-bootstrap on every reconnect (WS token single-use, TTL 300 s).
- Biometric relock after > 5 min in background.

## Review Focus

1. Secret containing `&`, `#`, `=`, spaces → must be `encodeURIComponent`-encoded in `#/?bootstrapSecret=` and sent raw in `X-Nanobot-Auth`. (Test in Task 4 `firstLoadUrl`.)
2. `baseUrl` entered with trailing slash, path, or `https://` → normalized without trailing slash; WS URL uses `wss://` for https. (Tests in Task 2 `wsUrl` and Task 4 `normalizeBaseUrl`.)
3. Preset already derived (`gpt·high`) or base name containing `·` that is not an effort suffix (`a·b`) → base strips only a trailing `·<known level>`. (Tests in Task 1.)
4. Chat key not from websocket (`telegram:123`) or hash `#/settings` → per-chat extras disabled, no frames sent. (Tests in Task 1 `parseRoute`, Task 3 `applyEffort`.)
5. App backgrounded then network drops/returns → client re-bootstraps, does not reuse an expired token, and fires at most one notification per `turn_end`. (Test in Task 2 reconnect test and Task 3 notifier test.)

---

### Task 1: extras scaffold + pure logic

**Files:**
- Create: `extras/package.json`, `extras/tsconfig.json`, `extras/src/logic.ts`
- Test: `extras/test/logic.test.ts`

**Interfaces:**
- Produces (all in `extras/src/logic.ts`):
  - `EFFORT_ORDER: readonly string[]`
  - `basePresetName(name: string): string` — strips trailing `·<level in EFFORT_ORDER>`
  - `derivedPresetName(base: string, level: string): string`
  - `sortEfforts(values: string[]): string[]` — keeps only known levels, canonical order, deduped
  - `type Route = { sessionKey: string | null; chatId: string | null }`
  - `parseRoute(hash: string): Route` — `#/chat/<enc key>` → key decoded; chatId = part after `websocket:` else null. `#/temporary/<id>` → key `websocket:<id>`, chatId id. Anything else / decode error → both null.
  - `type Cmd = { command: string; title: string; description: string; argHint?: string; acceptsArgs: boolean }`
  - `groupCommands(cmds: Cmd[]): Array<{ group: "session"|"memory"|"agent"|"other"; items: Cmd[] }>` — session: `/status /compact /history /stop /new`; memory: `/dream /dream-log /dream-restore`; agent: `/goal /restart /help`; rest → other. Empty groups omitted, order session, memory, agent, other.
  - `t(key: string, lang: string): string` with keys used by later tasks (`effort`, `commands`, `status`, `connected`, `reconnecting`, `error`, `run_status`, `paste_hint`, `attach_hint`, `update_available`, `args`) in `it` and `en`.

- [ ] **Step 1:** `extras/package.json` with scripts `"build": "esbuild src/main.ts --bundle --format=iife --target=es2020 --outfile=dist/extras.js"`, `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`; devDeps typescript ^5.6, esbuild ^0.24, vitest ^2.1. tsconfig strict, `lib: ["ES2020","DOM"]`. Run `cd extras && npm install`.
- [ ] **Step 2: Write failing tests** in `extras/test/logic.test.ts`:

```ts
expect(basePresetName("gpt·high")).toBe("gpt");
expect(basePresetName("a·b")).toBe("a·b");
expect(basePresetName("gpt")).toBe("gpt");
expect(derivedPresetName(basePresetName("gpt·low"), "max")).toBe("gpt·max");
expect(sortEfforts(["high","bogus","low","high","none"])).toEqual(["none","low","high"]);
expect(parseRoute("#/chat/websocket%3Aabc")).toEqual({ sessionKey: "websocket:abc", chatId: "abc" });
expect(parseRoute("#/temporary/xyz")).toEqual({ sessionKey: "websocket:xyz", chatId: "xyz" });
expect(parseRoute("#/chat/telegram%3A1")).toEqual({ sessionKey: "telegram:1", chatId: null });
expect(parseRoute("#/settings?section=models")).toEqual({ sessionKey: null, chatId: null });
expect(parseRoute("#/chat/%E0%A4")).toEqual({ sessionKey: null, chatId: null });
expect(groupCommands([c("/status"), c("/dream"), c("/foo")]).map(g => g.group)).toEqual(["session","memory","other"]);
expect(t("effort","it-IT")).not.toBe(t("effort","en"));
```
- [ ] **Step 3:** `npm test` → FAIL (module missing).
- [ ] **Step 4:** Implement `extras/src/logic.ts`.
- [ ] **Step 5:** `npm test && npm run typecheck` → PASS.
- [ ] **Step 6:** Commit `feat(extras): pure logic for effort, routes, commands`.

### Task 2: extras connection client

**Files:**
- Create: `extras/src/client.ts`
- Test: `extras/test/client.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces (`extras/src/client.ts`):
  - `wsUrl(baseUrl: string, wsPath: string, token: string, clientId: string): string` — `http→ws`, `https→wss`, path kept literally, query `token` and `client_id` URI-encoded.
  - `type ClientState = "connecting" | "open" | "reconnecting" | "auth_error"`
  - `class NanobotClient` constructor `(opts: { baseUrl: string; secret: string; fetch?: typeof fetch; WebSocket?: typeof WebSocket; setTimeout?: typeof setTimeout; random?: () => string })`
    - `start(): void`, `stop(): void`
    - `state: ClientState`, `onState(cb: (s: ClientState) => void): void`
    - `onEvent(cb: (ev: any) => void): void` — every parsed inbound frame except `webui_response`
    - `get<T>(path: string): Promise<T>` — `fetch(baseUrl+path, { headers: { Authorization: "Bearer " + apiToken } })`, throws `Error("HTTP <status>")` if not ok
    - `send(frame: object): void` — queues while not open, flushes on open
    - `request<T>(action: string, payload: object): Promise<T>` — sends `{type:"webui_request", request_id, action, payload}`, resolves on matching `{event:"webui_response", ok:true, result}`, rejects `Error(error)` on `ok:false`, rejects after 15 s
  - Bootstrap: `GET {baseUrl}/webui/bootstrap` with `X-Nanobot-Auth: secret` only if secret non-empty. 401/403 → state `auth_error`, no retry. Other failure or WS close → state `reconnecting`, retry after backoff 1,2,4,…,30 s; success resets backoff. Every reconnect calls bootstrap again.
  - Remembers attached chat ids and re-sends `{type:"attach", chat_id}` for each after reconnect; `attach(chatId: string): void` public.

- [ ] **Step 1: Write failing tests** using fake fetch/WebSocket/setTimeout:
  - `wsUrl("https://h:1/", "/", "t k", "nanodroid-extras")` → `"wss://h:1/?token=t%20k&client_id=nanodroid-extras"`
  - bootstrap sends header only when secret set; 403 → `state === "auth_error"` and no second fetch after timers flush
  - WS close → bootstrap called twice total, second WS URL uses the new token, delays observed `[1000, 2000]` on two consecutive failures
  - `request("x", {})` resolves with `result` for matching `request_id`, rejects with message on `ok:false`
  - frames sent before open are delivered after open; `attach("c1")` re-sent after reconnect
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `client.ts`.
- [ ] **Step 4:** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(extras): bootstrap/ws client with reconnect`.

### Task 3: extras features (controllers + Shadow DOM UI + entry)

**Files:**
- Create: `extras/src/features.ts` (controllers, DOM-free), `extras/src/ui.ts` (Shadow DOM rendering), `extras/src/main.ts` (entry)
- Test: `extras/test/features.test.ts`

**Interfaces:**
- Consumes: Task 1 `basePresetName, derivedPresetName, sortEfforts, parseRoute, groupCommands, t`; Task 2 `NanobotClient`.
- Produces:
  - `type Bridge = { getConfig(): string; notify(title: string, body: string): void; haptic(): void; log(level: string, msg: string): void }` (JSON from `getConfig`: `{baseUrl, secret, themeEnabled, lang, pendingText?}`)
  - `type Preset = { name: string; provider: string; model: string; max_tokens: number; context_window_tokens: number; temperature: number; reasoning_effort: string | null; reasoning_effort_values?: string[]; is_default: boolean; active: boolean }`
  - `async function loadEffortState(client, sessionKey: string): Promise<{ base: Preset; current: string | null; levels: string[] } | null>` — `GET /api/settings` → `model_presets`; `GET /api/sessions` → session `model_preset`; preset = session preset ?? active preset ?? default; base = preset named `basePresetName(preset.name)` (fallback preset itself); levels = `sortEfforts(base.reasoning_effort_values ?? [])`; null if levels empty or session not found.
  - `async function applyEffort(client, route: Route, state, level: string): Promise<string>` — returns new preset name. If `route.chatId` null → throws `Error("no_chat")` and sends nothing. If derived preset absent in latest `/api/settings`, `client.request("settings.model_configuration.create", { name, provider, model, max_tokens, context_window_tokens, temperature, reasoning_effort: level })`. Then `client.attach(chatId)`; `client.send({ type:"message", chat_id, content: "/model " + name, webui: true })`.
  - `async function runCommand(client, route: Route, text: string, navigate: (hash: string) => void): Promise<void>` — with chatId: attach + message. Without: `send({type:"new_chat"})`, wait for event `attached` (5 s timeout → throw), then message to its `chat_id`, then `navigate("#/chat/" + encodeURIComponent("websocket:" + chat_id))`.
  - `class TurnNotifier` `(bridge: Bridge, isForeground: () => boolean)` with `handle(ev: any): void` — on `event:"turn_end"` with `outcome` `completed` or absent and not foreground → `bridge.notify(title, preview)` once per `(chat_id, turn)`; preview = last `delta`/`message` text accumulated for that chat, trimmed to 120 chars.
  - `ui.ts`: `mountUi(root: ShadowRoot, deps)` renders: effort pill `⚡ <level>` bottom-right above composer area (`bottom: 88px`) + bottom sheet slider; FAB opening command drawer (args prompt when `acceptsArgs`); status dot (green open / yellow connecting|reconnecting / red auth_error) opening panel with version (`/api/settings/version-check`), active preset, usage (`/api/settings/usage`), "Run /status" button; toast. Hides pill when `loadEffortState` null or route has no chatId. All `hidden` on capability failure with `bridge.log("warn", …)`.
  - `main.ts`: idempotent (exits if `#nanodroid-root` exists); reads `window.Nanodroid` (absent → do nothing); creates client, mounts UI, listens `hashchange` → `parseRoute` → attach chat + refresh effort; feeds events to `TurnNotifier` with `isForeground = () => document.visibilityState === "visible"`; on `runtime_model_updated` / `turn_model_updated` refresh effort state; if config `pendingText` set → fill composer (Task 6 helper).

- [ ] **Step 1: Write failing tests** with a fake client recording `request/send/attach/get`:
  - `loadEffortState` with session preset `gpt·high`, presets `gpt` (values `["low","high","bogus"]`) and `gpt·high` → `{ base.name: "gpt", current: "high", levels: ["low","high"] }`
  - `applyEffort(..., "low")` when `gpt·low` missing → one `settings.model_configuration.create` with `name:"gpt·low"`, `reasoning_effort:"low"`, then `attach("abc")` then message `/model gpt·low`; when present → no create
  - `applyEffort` with `route.chatId === null` → rejects `no_chat`, zero calls
  - create rejects → `applyEffort` rejects and no message sent
  - `TurnNotifier`: two identical `turn_end` → one notify; foreground → none; `outcome:"cancelled"` → none
  - `runCommand` without chat → `new_chat`, then message to attached chat_id, `navigate("#/chat/websocket%3Anew1")`
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `features.ts`, `ui.ts`, `main.ts`. UI styles inline in the shadow root; respect `prefers-color-scheme`; touch targets ≥ 44 px.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run build` → PASS, `extras/dist/extras.js` exists.
- [ ] **Step 5:** Commit `feat(extras): effort slider, commands, status, notifications`.

### Task 4: Android project + profiles + ConnectActivity

**Files:**
- Create: `settings.gradle.kts`, `build.gradle.kts`, `gradle.properties`, `gradle/wrapper/*`, `gradlew`, `app/build.gradle.kts`, `app/src/main/AndroidManifest.xml`, `app/src/main/java/dev/nanodroid/Profiles.kt`, `app/src/main/java/dev/nanodroid/ConnectActivity.kt`, `app/src/main/res/layout/activity_connect.xml`, `app/src/main/res/values/strings.xml`, `app/src/main/res/values-it/strings.xml`, `app/src/main/res/values/themes.xml`, launcher icon (adaptive vector), `LICENSE` (MIT), `README.md`
- Test: `app/src/test/java/dev/nanodroid/ProfilesTest.kt`

**Interfaces:**
- Produces (`Profiles.kt`):
  - `data class Profile(val id: String, val name: String, val baseUrl: String, val secret: String, val secretSeeded: Boolean = false)`
  - `fun normalizeBaseUrl(input: String): String?` — trim; prepend `http://` if no scheme; only http/https; drop trailing `/`; null if no host
  - `fun firstLoadUrl(p: Profile): String` — if `secret` non-empty and `!secretSeeded`: `"${p.baseUrl}/#/?bootstrapSecret=" + Uri-encoded secret`; else `"${p.baseUrl}/"`
  - `fun encodeProfiles(list: List<Profile>): String` / `fun decodeProfiles(json: String): List<Profile>` (org.json; corrupt JSON → empty list)
  - `class ProfileStore(context)` over EncryptedSharedPreferences file `nanodroid_secure`: `all()`, `save(p)`, `delete(id)`, `active(): Profile?`, `setActive(id)`, `markSeeded(id)`; plus plain prefs `themeEnabled: Boolean` (default true), `biometricEnabled: Boolean` (default false)
  - `suspend`-free `fun testConnection(p: Profile): Result` on a background thread via `HttpURLConnection` GET `${baseUrl}/webui/bootstrap` (+ `X-Nanobot-Auth` if secret), 8 s timeout: `Ok`, `AuthError`, `Unreachable(message)` — sealed class `ConnResult`
- ConnectActivity: list of profiles + form (name, URL, secret with show/hide, helper text from spec), "Test & save", "Open". On `Ok` → save, set active, start `MainActivity`. Launcher activity is `MainActivity`; it redirects to ConnectActivity when no active profile.
- Manifest: `INTERNET`, `RECORD_AUDIO`, `POST_NOTIFICATIONS`, `USE_BIOMETRIC`, `VIBRATE`; `android:usesCleartextTraffic="true"` (Tailscale/LAN use plain http).

- [ ] **Step 1:** Generate the wrapper: download `gradle-8.10.2-bin.zip` from services.gradle.org into `.toolchain/`, unzip, run `.toolchain/gradle-8.10.2/bin/gradle wrapper --gradle-version 8.10.2` in repo root. Write Gradle files with the versions in Tech Stack.
- [ ] **Step 2: Write failing test** `ProfilesTest`:

```kotlin
assertEquals("http://100.64.0.1:8765", normalizeBaseUrl(" 100.64.0.1:8765/ "))
assertEquals("https://box.ts.net", normalizeBaseUrl("https://box.ts.net/"))
assertNull(normalizeBaseUrl("ftp://x"))
assertNull(normalizeBaseUrl(""))
assertEquals("http://h/#/?bootstrapSecret=a%26b%23c%3Dd%20e",
  firstLoadUrl(Profile("1","n","http://h","a&b#c=d e")))
assertEquals("http://h/", firstLoadUrl(Profile("1","n","http://h","s", secretSeeded = true)))
assertEquals("http://h/", firstLoadUrl(Profile("1","n","http://h","")))
val l = listOf(Profile("1","a","http://h","s"))
assertEquals(l, decodeProfiles(encodeProfiles(l)))
assertEquals(emptyList<Profile>(), decodeProfiles("{oops"))
```
  (Use `java.net.URLEncoder` + replace `+` with `%20` so the JVM test runs without Android `Uri`.)
- [ ] **Step 3:** `source env.sh && ./gradlew :app:testDebugUnitTest` → FAIL.
- [ ] **Step 4:** Implement `Profiles.kt`, `ConnectActivity.kt`, layouts, strings (it + en), manifest, a stub `MainActivity` that only redirects to ConnectActivity when no profile.
- [ ] **Step 5:** `./gradlew :app:testDebugUnitTest :app:assembleDebug` → BUILD SUCCESSFUL.
- [ ] **Step 6:** Commit `feat(android): project, profiles, connect screen`.

### Task 5: MainActivity WebView, injection, bridge

**Files:**
- Create/modify: `app/src/main/java/dev/nanodroid/MainActivity.kt`, `app/src/main/java/dev/nanodroid/Bridge.kt`, `app/src/main/res/layout/activity_main.xml` (WebView + error view), `app/build.gradle.kts` (extras build hook)

**Interfaces:**
- Consumes: Task 4 `ProfileStore`, `firstLoadUrl`; Task 3 `extras/dist/extras.js`; Task 7 `app/src/main/assets/theme.css` (load only if file exists in assets).
- Produces:
  - `class Bridge(activity: MainActivity)` exposed as `window.Nanodroid` with `@JavascriptInterface` methods exactly `getConfig(): String`, `notify(title: String, body: String)`, `haptic()`, `log(level: String, msg: String)`. `getConfig` JSON: `{baseUrl, secret, themeEnabled, lang: Locale.getDefault().toLanguageTag(), pendingText}`; `pendingText` returned once then cleared.
  - Notification channel `turns` ("Risposte"/"Replies"); `notify` only if `!isResumed`; tap opens MainActivity. Request `POST_NOTIFICATIONS` on first launch (API 33+).
  - `MainActivity.debugLog: ArrayDeque<String>` (max 200 lines) shared with settings screen (Task 6).
  - `MainActivity.pendingAttachment: Uri?` consumed by `onShowFileChooser` (set by Task 6).
- Behaviour (from spec): JS/DOM storage/cookies on; addJavascriptInterface only after the page origin equals profile origin (check in `onPageFinished` before injecting; never inject on other origins); inject `theme.css` as `<style id="nanodroid-theme">` when `themeEnabled`, then `extras.js` via `evaluateJavascript`; `onShowFileChooser` → pending attachment or `ACTION_GET_CONTENT` launcher; `onPermissionRequest` grants `RESOURCE_AUDIO_CAPTURE` after `RECORD_AUDIO` runtime grant; DownloadManager for downloads; other-origin links → `ACTION_VIEW`; back → `goBack()` else default; main-frame `onReceivedError` → show error view with "Riprova"/"Cambia server"; after first successful load with seeded secret → `ProfileStore.markSeeded`; HTTP 401/403 on main frame → ConnectActivity.
  - Gradle: task `buildExtras` (Exec `npm run build` in `extras/`, skipped if `npm` missing and `extras/dist/extras.js` exists) + `copyExtras` into `app/src/main/assets/`; `preBuild` dependsOn `copyExtras`. Add `app/src/main/assets/extras.js` to `.gitignore`.

- [ ] **Step 1:** Implement `Bridge.kt`, `MainActivity.kt`, layout, Gradle hook.
- [ ] **Step 2:** `./gradlew :app:assembleDebug` → BUILD SUCCESSFUL and `unzip -l app/build/outputs/apk/debug/app-debug.apk | grep assets/extras.js` prints a line.
- [ ] **Step 3:** Smoke test on phone: `adb install -r app/build/outputs/apk/debug/app-debug.apk`; connect profile to the Arduino; WebUI loads logged in; status dot visible; `chrome://inspect` console shows no errors from extras.
- [ ] **Step 4:** Commit `feat(android): webview shell with extras injection and bridge`.

### Task 6: Share, biometric lock, app settings

**Files:**
- Create: `app/src/main/java/dev/nanodroid/ShareActivity.kt`, `app/src/main/java/dev/nanodroid/SettingsActivity.kt`, `app/src/main/res/layout/activity_settings.xml`
- Modify: `MainActivity.kt` (lock, menu entry), `AndroidManifest.xml`, `extras/src/features.ts` (`fillComposer`)
- Test: `extras/test/features.test.ts` (add case)

**Interfaces:**
- Consumes: Task 5 `pendingAttachment`, `debugLog`, Bridge `pendingText`; Task 4 `ProfileStore`.
- Produces:
  - ShareActivity (exported, `ACTION_SEND` `text/plain` and `image/*`, no UI): text → stored as pending text; image → `pendingAttachment` + toast `attach_hint`; then start MainActivity with hash `#/new` (`singleTask`, `onNewIntent` loads `${baseUrl}/#/new`).
  - `fillComposer(doc: Document, text: string): boolean` in `features.ts` — finds first `textarea` inside `form` or `[contenteditable=true]` in main content, sets value with native setter + dispatches `input`; returns false if not found (caller then copies to clipboard via `navigator.clipboard.writeText` and toasts `paste_hint`).
  - Biometric: if `biometricEnabled`, show BiometricPrompt (BIOMETRIC_WEAK or DEVICE_CREDENTIAL) on cold start and on `onStart` when last `onStop` was > 5 min ago; WebView hidden until success; cancel → `finish()`.
  - SettingsActivity (opened from a small native overflow button over the WebView top-right, 32 dp, semi-transparent): toggles theme / biometric, "Change server" (→ ConnectActivity), read-only debug log list.

- [ ] **Step 1: Write failing test** (vitest, `// @vitest-environment jsdom`, add devDep jsdom ^25): `fillComposer` sets `textarea.value === "hi"` and an `input` listener fires once; returns false on empty document.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `fillComposer`, ShareActivity, SettingsActivity, lock in MainActivity.
- [ ] **Step 4:** `npm test && ./gradlew :app:testDebugUnitTest :app:assembleDebug` → PASS / BUILD SUCCESSFUL.
- [ ] **Step 5:** Commit `feat: share target, biometric lock, settings`.

### Task 7: Theme

**Files:**
- Create: `app/src/main/assets/theme.css`

**Interfaces:**
- Consumes: Task 5 injection (`<style id="nanodroid-theme">`).
- Produces: CSS that only overrides the WebUI's CSS custom properties and surface rules (radius, font stack, spacing, accent palette), separate light and dark (`prefers-color-scheme` and the WebUI's `.dark` class). No `display`/`position` rules on WebUI elements.

- [ ] **Step 1:** Read the WebUI variable names from the cloned repo `webui/src/index.css` (or `globals.css`) and override them.
- [ ] **Step 2:** Rebuild, install, compare on phone with theme on/off in Settings (both light and dark); verify nothing overlaps or disappears.
- [ ] **Step 3:** Commit `feat: nanodroid theme`.

### Task 8: Acceptance on device

- [ ] **Step 1:** `extras: npm test`, `./gradlew :app:testDebugUnitTest :app:assembleDebug` all green.
- [ ] **Step 2:** On the phone against the Arduino, check every item of the spec "Accettazione manuale" list: auto login; streaming chat; slider change persists after app restart (reopen chat, pill shows same level); command drawer `/status`; notification while app in background; text share lands in composer; image share attaches via 📎; biometric lock; theme toggle; wrong secret → connect screen; Tailscale off → error view with retry.
- [ ] **Step 3:** Write `README.md` sections: what it is (unofficial client), install APK, where to find the secret (`channels.websocket.tokenIssueSecret` in `~/.nanobot/config.json` or WebUI login password), build (`source env.sh`, `./gradlew assembleDebug`), known limits (notifications only while process alive; no gateway logs/plugins).
- [ ] **Step 4:** Commit `docs: readme and acceptance`.
