# nanobot mobile, Phase 3 (settings) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WebUI parity for Settings: Overview, Appearance, Models and presets (with providers), Capabilities, System, Advanced, About, plus restart handling.

**Architecture:**
- One settings store holds the latest `SettingsPayload`. Every mutation replaces it, the same way upstream `applyPayload` does.
- Pure logic modules (validation, call order, runtime-config field catalogue, OAuth flow) sit under `src/settings/`. Screens sit under `src/screens/settings/`.
- Everything is reached through `session.get` and `session.mutate`, and through vendor wrappers only for the 150 s package mutations.
- API facts, with file:line references: `.superpowers/sdd/phase3-vendor-map.md`. Every task reads its sections.

**Tech Stack:** Expo SDK 57, TypeScript strict, Zustand, expo-router, jest-expo. `expo-web-browser` is used for the OAuth authorization URL.

**Spec:** `mobile/docs/superpowers/specs/2026-10-13-nanobot-mobile-design.md` (Fase 3, Sicurezza)

## Global Constraints
- Never modify the nanobot server, and never edit `mobile/vendor/**`. Types come from `@/lib/types` (`SettingsPayload`, etc.); do not duplicate them.
- **Secrets are write-only.**
  - Provider, web-search and other API keys are sent only when the user typed one. The UI shows only `api_key_hint`.
  - The draft is cleared after save.
  - Settings payloads and secrets are never logged.
  - The masked `••••••••` values of extra_headers/extra_query are sent back unchanged to keep the stored values.
- Dangerous changes need a confirm `Dialog` that explains the risk:
  - `webui_default_access_mode: "full"`
  - `tools.exec.enable` on
  - `tools.restrict_to_workspace` off
  - `tools.ssrf_whitelist` edits
  - `settings.feature.enable`, which installs packages on the host
- Out of scope: the API service start/stop (it exposes a network service from the host), native-only rows (logs, diagnostics), star prompt, provider logos.
- The mobile client is the browser surface. It never auto-restarts the engine. Restart is the manual `/restart` command.
- UI rules (agy README): i18n for every string (it and en), theme colors only, targets of at least 48 dp, safe area, keyboard.
- Autosave: toggles and selects save immediately. Text and number fields save on an explicit Save per card. Fields marked `manual:true` are always explicit.

## Review Focus
1. **Concurrent saves:** one card is saving while the user edits another. The payload replacement must not wipe the other card's unsaved draft. Test: P3-C1.
2. **API key field round-trip:** a saved key is never shown again, the hint appears, an empty key field doesn't clear the stored key, and a mask sent back for extra_headers keeps the value. Test: P3-C2.
3. **Restart:** pending after a save. Restart sends `/restart`, waits for the socket to go down and back up, refetches, and clears the notice. A timeout gives a clear message. Test: P3-C1.
4. **Model call order edits:** remove the last, delete the primary, reorder with duplicates, and the no-op save are all refused or handled. Test: P3-C2.
5. **Runtime-config field errors:** a server 400 whose message starts with the field path marks that field. Other fields are unaffected. Test: P3-C3.

## Execution waves
| Wave | Logic (Claude) | UI |
|---|---|---|
| 1 | P3-C1 settings store, restart, local prefs | — |
| 2 | P3-C2 models, providers, OAuth logic | P3-U1 settings shell, Overview, Appearance, About |
| 3 | P3-C3 runtime-config catalogue + capability validators | P3-U2 Models + Providers UI |
| 4 | — | P3-U3 Capabilities + Advanced network safety; P3-U4 System + Advanced runtime config |

The UI tasks are assigned at dispatch time, to agy or to Claude subagents, depending on the queue.

---

### Task P3-C1 [Claude]: Settings store, restart, local prefs
**Files:**
- Create `mobile/src/settings/store.ts`, `mobile/src/settings/prefs.ts`
- Modify `mobile/src/core/session.ts` (`get` parses `{error}` into the message), `mobile/src/i18n/index.ts` (language override), `mobile/src/extras/notifications.ts` (sound pref)
- Test `mobile/test/settings/store.test.ts`

**Interfaces (produces):**
- `useSettings(): { data: SettingsPayload | null; loading: boolean; error: string | null; refresh(): Promise<void>; mutate<T = SettingsPayload>(action: string, payload: object, opts?: { timeoutMs?: number }): Promise<T> }`
  - `mutate` applies any returned `SettingsPayload`, and throws `SettingsError { status, message, field?: string }`.
- `restart: { pending: boolean; sections: string[]; state: "idle" | "restarting" | "done" | "timeout"; run(): Promise<void> }`, from `useRestart()`.
  - `run` sends `/restart` via `client.sendSystemCommand(chatId, "/restart")`, using `client.defaultChatId`, or the first websocket chat, or a new chat. It waits for the status to go non-open and then open (or 1.5 s elapsed), with a 60 s timeout, then refreshes.
- `useDraft<T>(cardId, initial: T): [draft, setDraft, { dirty, reset }]`. Drafts live in the store, keyed by card, so a payload replacement never clobbers a dirty draft.
- `prefs`: `language: "system" | "it" | "en"`, and `notificationSound: boolean`, both kv-backed. `setLanguage` switches i18next live. The notification handler reads the sound pref.

- [ ] **Step 1, failing tests:**
  - A mutate result replaces `data`.
  - A 400 with message `tools.exec.timeout: ...` gives `field === "tools.exec.timeout"`.
  - A dirty draft survives a payload replacement from another card's save.
  - `restart.run` sends `/restart`, ends in `done` after a simulated close→open, and refreshes.
  - With no reopen within 60 s, the state is `timeout`.
  - `setLanguage("en")` changes `i18n.language` and persists.
  - The sound pref is false by default, and the notification handler uses it.
  - `session.get` on `{"error":"x"}` with 400 throws message `x`.
- [ ] **Steps 2–4:** watch the tests fail, implement, then run `npx jest && npx tsc --noEmit` until both pass.
- [ ] **Step 5:** commit `feat(mobile): settings store, restart flow, language and sound prefs`.

### Task P3-C2 [Claude]: Models, providers, OAuth logic
**Files:**
- Create `mobile/src/settings/models.ts`, `mobile/src/settings/providers.ts`, `mobile/src/settings/oauth.ts`
- Test `mobile/test/settings/models-providers.test.ts`

**Interfaces (produces):**
- **Models (`models.ts`):**
  - `parseContextWindowTokens(s): number | null`, which accepts `128k`, `1m` and digits
  - `validatePreset(form, existingNames): { ok: true } | { ok: false; field; code }`
  - `presetUpdateDiff(original, form): object`, which returns only the changed fields, with `reasoning_effort: ""` to clear
  - `suggestPresetName(model)`
  - `visiblePresets(payload)`, which hides `is_default` and groups the effort-derived `<base>·<level>` presets under their base (see `basePresetName` in `src/extras/logic.ts`)
  - `callOrderOps`: `moveUp`, `moveDown`, `remove` (refused at length 1), `add`
  - `canSaveOrder(prev, next)`: refuses empty and no-op orders
  - `canDelete(name, order)`: refuses `order[0]`
  - `createPresetAndOrder(mutate, form, order)`: create, then call order
  - `useProviderModels(provider)`: catalogue fetch with `refresh`, cached per provider, keeping the old list when a refresh fails
- **Providers (`providers.ts`):**
  - `providerUpdatePayload(provider, form)`: only the `advanced_fields` plus `api_base`; `api_key` only if non-empty; `display_name` only if custom; `api` only if configurable; masks passed through unchanged
  - `requiredFeature(provider)`: `bedrock`→`bedrock`, `azure_openai`→`azure`, else null
  - `validateProviderForm`
  - `parseJsonObject(text, { stringValues })`
- **OAuth (`oauth.ts`):**
  - `useOAuthFlow(provider)` returns `{ state: "idle" | "awaiting_user" | "polling" | "done" | "error"; authUrl?; userCode?; completionInput?; start(); submit(response); cancel() }`
  - `start` calls `oauth_login` with `remote_browser: true`, then polls `oauth_complete` every 1 s while it is pending.
  - `cancel` sends `cancel: true` only for `device_code`.
  - On unmount, polling stops.

- [ ] **Step 1, failing tests:**
  - `"128k"`→128000, `"1m"`→1000000.
  - temperature 2.1 is invalid.
  - A duplicate name is invalid, case-insensitively.
  - The diff sends only changed fields, plus `""` for a cleared effort.
  - remove at length 1 is refused.
  - Delete of the primary is refused.
  - A no-op order is refused.
  - `visiblePresets` hides `is_default` and groups `gpt·low`/`gpt·max` under `gpt`.
  - The provider payload omits an empty `api_key` and keeps `••••••••` header values.
  - azure_openai requires the `azure` feature.
  - OAuth: `authorization_required` → `awaiting_user`; submit → polling; pending → pending → payload gives `done`; cancel on device_code sends `cancel: true`.
  - A failed catalogue refresh keeps the previous models.
- [ ] **Steps 2–5:** watch the tests fail, implement, run them until they pass, and commit `feat(mobile): model, provider and OAuth settings logic`.

### Task P3-C3 [Claude]: Runtime-config catalogue + capability validators
**Files:**
- Create `mobile/src/settings/runtimeFields.ts` (a hand port of upstream `US/system/runtime-config-fields.ts` for the runtime, advanced and memory pages; the upstream file is in the scratchpad nanobot-src checkout, otherwise use the vendor map §7) and `mobile/src/settings/capabilities.ts`
- Test `mobile/test/settings/runtime-capabilities.test.ts`

**Interfaces (produces):**
- `RUNTIME_FIELDS: RuntimeField[]`, where `RuntimeField = { path; page: "runtime" | "advanced" | "memory"; group; kind: "toggle" | "boolean" | "text" | "nullable" | "number" | "select" | "list" | "preset"; min?; max?; float?; options?; manual?; when?; enabledBy?; danger?: boolean }`
- `coerceRuntimeValue(field, input): { ok: true; value } | { ok: false; code }`
- `visibleFields(page, values)`, which applies `when` and `enabledBy`
- `fieldFromError(message, fields)`
- `isDangerous(field, nextValue)`:
  - exec enable on
  - restrict_to_workspace off
  - ssrf_whitelist any change
  - remote package install
- `imageGenPayload(form)`, `webSearchPayload(form, current)`, `transcriptionPayload(form)` and `networkSafetyPayload(form)`, each with validation:
  - image max 1–8
  - web results 1–10, timeout 1–120
  - transcription 1–600 / 1–100
  - an api_key is required unless a hint exists
  - `optional_api_key` sends `""` when editing and cleared
- `ASPECT_RATIOS`, `IMAGE_SIZES`

- [ ] **Step 1, failing tests:**
  - A number below min is refused.
  - `api.timeout` accepts a float.
  - list `"a\n\n b "` gives `["a","b"]`.
  - nullable `""` gives null.
  - A `when` hides a field until its dependency matches.
  - A `tools.exec.timeout: ...` message maps to that field.
  - `isDangerous` flags exec enable.
  - The web payload refuses a missing key without a hint.
  - Changing the image provider resets the model to `default_model`.
  - `networkSafetyPayload` always sends both fields.
- [ ] **Steps 2–5:** watch the tests fail, implement, run them until they pass, and commit `feat(mobile): runtime config catalogue and capability validators`.

### Task P3-U1: Settings shell, Overview, Appearance, About
- **Routes:**
  - `app/settings.tsx` becomes the section list: Overview, Appearance, Models, Capabilities, System, Advanced, About, plus the existing Biometric lock and Server rows moved into Appearance and About.
  - `app/settings/[section].tsx` renders the sections.
- **Global restart notice:** "Salvato. Riavvia per applicare" / "Saved. Restart to apply", with a Restart button that calls `useRestart().run`, a progress state and a timeout message. It is shown at the top of every section while pending. Leaving Settings with a restart pending shows a confirm dialog.
- **Overview:**
  - usage card: 30-day bars from `/api/settings/usage`, the total, and the peak;
  - current model and provider;
  - web, image and voice statuses, each linking to its section.
- **Appearance:** theme (system, light, dark), language (system, it, en) via `prefs`, notification sound, and the biometric lock (moved from today's screen, keeping the auth-to-disable behaviour).
- **About:** app version, vendor commit, server version and commit, environment, a "Check for updates" button (`version-check`), links to the repo and the docs, and the MIT attribution.
- **Tests:** section nav; the restart notice shows and Restart calls `run`; the language switch calls `setLanguage`; the version check shows "update available vX".

### Task P3-U2: Models + Providers UI
- **Models:**
  - The call-order list shows the primary badge, up/down buttons, and remove (disabled at length 1).
  - A "Disabled" section lists presets that are not in the order, each with "Add to order".
  - Effort-derived presets are collapsed under their base.
  - **Preset editor sheet** fields:
    - name (suggested)
    - provider picker (configured providers only)
    - model picker (catalogue via `useProviderModels`, with a refresh button and free-form text; for deferred providers, search after 2 characters)
    - reasoning effort (from the catalogue or the preset values)
    - context window (accepts `128k`)
    - max tokens
    - temperature
    - request API, only when there is more than one choice, showing the "Auto (X)" label
    - JSON overrides for extra headers, query and body, only if supported
  - Save uses create+order or the update diff. Delete (refused for the primary) goes through a confirm. Migrate is shown if migratable.
- **Providers panel:**
  - a configured list and an "Add provider" picker;
  - **provider form:**
    - the API key shows its hint, read-only, with a pencil button to edit; editing switches to a password field with show/hide;
    - api_base and the advanced fields;
    - feature enable runs behind a confirm when required;
  - a custom provider create form;
  - **OAuth:**
    - Login opens `authUrl` with expo-web-browser;
    - depending on `completionInput`, it shows a code input (for authorization_code or callback_url) or the `userCode` with a copy button (for device_code);
    - it shows the polling state;
    - Logout.
- **Tests:** reorder calls `model_call_order.update` with the new order; remove is disabled at length 1; save of an edited preset sends only the diff; delete of the primary is disabled; the provider key field shows the hint and Save omits `api_key` when it is untouched; OAuth device_code shows the user code.

### Task P3-U3: Capabilities + network safety
- **Image generation card:** enable toggle (blocked with "Configure provider" if the provider is unconfigured), provider, model, aspect ratio, size, and max images.
- **Web card:** on/off via the runtime config `tools.web.enable`; provider; key (hint pattern); base URL; results; timeout; Jina reader; proxy; user agent.
- **Transcription card:** enabled, provider, model, language (empty = auto), max duration, max upload.
- **Memory card:** the dream toggle.
- **Network safety card** (on the Advanced page): local service access, and default access mode. "full" needs a confirm with a risk explanation.
- **Tests:** enabling the image toggle with an unconfigured provider shows the hint and sends nothing; a web save without a key and without a hint shows the error; choosing full access asks for confirmation and cancel sends nothing.

### Task P3-U4: System + Advanced runtime config
- **Renderer:** a generic `RuntimeFieldRow` for every kind, rendered from `RUNTIME_FIELDS` per page and group, with `visibleFields`.
  - Toggles save immediately; dangerous ones confirm first.
  - Other fields save on the card's Save. `manual` fields need an explicit Save.
  - A field error is shown under the field it belongs to.
- **System page:** config path, apply state, the Restart row, the runtime fields, and a Features list (`/api/settings/nanobot-features`) with enable/disable buttons behind a confirm ("installs packages on the host").
- **Advanced page:** the advanced runtime fields, plus the network-safety card from P3-U3.
- **Tests:** a number out of range shows the inline error and sends nothing; enabling a dangerous toggle needs a confirm; a server field error lands under the right row; a list field sends trimmed lines.
