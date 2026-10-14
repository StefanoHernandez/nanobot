# Known issues and shims
Shims (vendor files are never edited):
- `installPolyfills()` (`src/platform/polyfills.ts`): `window = globalThis`, `localStorage` (MMKV-backed), `crypto.randomUUID` (expo-crypto), inert `location`/`history` stubs (bootstrap.ts browser helpers).
- `src/platform/babel-import-meta.js`: replaces `import.meta` with `{env:{MODE,PROD,DEV}}` (nanobot-client.ts debug flag). Types in `src/platform/vite-env.d.ts`.
- `src/platform/storage.ts`: MMKV required lazily; in-memory fallback only under jest (throws otherwise).
- `runtime.ts` host bridge (`window.nanobotHost`) is simply absent; client uses default `WebSocket` (RN global) or an injected `socketFactory`.
Issues:
- `HostWebSocket`/`isNativeRuntime` in vendor are unused on mobile.
- Jest on Node 26 prints an ExperimentalWarning about `localStorage`; harmless.
- NEVER call vendor `saveSecret`/`loadSavedSecret` (bootstrap.ts): secrets go through `src/core/profiles` (SecureStore). The localStorage shim drops the key `nanobot-webui.bootstrap-secret` (kv is unencrypted MMKV).
- Polyfill ordering: Babel hoists `import`s, so `installPolyfills()` called after imports runs too late. Polyfills are installed by side-effect module `src/platform/install.ts`, imported first by `mobile/index.js` (the `main` entry, before expo-router) and by `app/_layout.tsx` and tests. Always import it first; never call `installPolyfills()` after imports.
- `storage.ts` throws in production if MMKV is unavailable (Expo Go); the in-memory fallback is jest-only.
- Vendor limitation: NanobotClient.connect() after close() (pending reconnect timer / onReauth race) reopens a socket and resets intentionallyClosed. NanobotSession wraps socketFactory to return a closed fake after stop() and makes onReauth return null when stopped.
- Thread reconnect (mobile deviation from WebUI): WebUI settles the streaming bubble on run-status null (useNanobotStream.ts:490-510) and the next delta starts a new segment. Mobile deliberately reopens the bubble after a drop ONLY if its answer segment was still open (no stream_end) and it is the last message, so resumed deltas continue it instead of splitting mid-sentence. See mobile/src/state/threadStore.ts (hydrate keep-live path, reopenId).
- Rule: never subscribe `client.onChat` outside the thread store — the vendor flushes its pending replay buffer into the FIRST subscriber (bit T11 notifications and useEffort). Use `onRunStatus` / store state instead.
- Formulas render as raw TeX (no KaTeX) until Phase 2.
- Android edge-to-edge (SDK 57): the window no longer resizes for the keyboard; use `KeyboardAvoidingView behavior="padding"` on Android too.
- Agent media URLs (`/api/media/...`) are non-expiring capabilities: never log, toast or share them.
- Settings mutations go through `session.mutate` RAW: payloads must be wire snake_case (vendor api.ts wrappers do camel→snake; we don't use them). Builders in `src/settings/*` already emit snake_case — keep it that way.
- Dangerous settings (exec, workspace restriction off, SSRF whitelist, remote package install, sandbox off, full access mode, feature installs) always go behind a confirm with a specific risk text; feature-install checks fail closed.
