# WA-A Report: Secure Browser Login (Web Only)

- **Branch:** `agy/WA-A`
- **Brief:** `mobile/docs/agy/briefs/WA-A.md`
- **Commit Message:** `feat(mobile): browser login without storing secrets`
- **Verification:**
  - `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`: PASS (95 test suites, 778 passed, 0 failed)
  - `npx tsc --noEmit`: PASS (0 errors)
  - `bash mobile/scripts/build-web.sh`: PASS (expo export web completed successfully, 20M dist-web output)
- **Focused Test Suites:**
  - `mobile/test/platform/secretStore.web.test.ts` (2 passed)
  - `mobile/test/core/cookieBootstrap.test.ts` (5 passed)
  - `mobile/test/screens/web-auth.test.tsx` (7 passed)
  - `mobile/test/screens/web-devices.test.tsx` (2 passed)
- **Note on Browser Testing:** As requested in the brief, **nothing was tested in a real browser against the gateway**: Claude does that afterwards.

---

## Summary of Implementation

### 1. Cookie Mode for Profiles (`mobile/src/core/profiles.ts` & `mobile/src/platform/secretStore.web.ts`)
- Added optional `auth?: "cookie" | "secret" | "none"` to `Profile` in `mobile/src/core/profiles.ts`.
- `profiles.save(p, secret = "")`: When `auth: "cookie"`, `secret` is not provided and `hasSecret` is `false`.
- In `mobile/src/platform/secretStore.web.ts`:
  - `set` is a no-op (`Promise.resolve()`).
  - `get` always returns `Promise.resolve(null)`.
  - `del` removes leftover `nanobot.secret.${key}` from `localStorage` if present.
  - `sweepOldSecrets()` runs at startup to purge any leftover `nanobot.secret.*` keys from older builds, preserving other keys (`nanobot.kv.*`).

### 2. Cookie Bootstrap (`mobile/src/core/cookieBootstrap.ts` & `mobile/src/core/session.ts`)
- Implemented `fetchCookieBootstrap(baseUrl, timeoutMs)`:
  - Issues `GET ${baseUrl}/webui/bootstrap` with header `X-Nanobot-Cookie-Auth: 1` and `credentials: "same-origin"`.
  - Does NOT send `X-Nanobot-Auth` or `Authorization` headers.
  - Maps HTTP 401 and 403 to `BootstrapAuthRequiredError`.
- Updated `NanobotSession` in `mobile/src/core/session.ts`:
  - Retains `this.profile`.
  - In `refresh()`, calls `fetchCookieBootstrap` when `this.profile.auth === "cookie"`.
  - Proactive background timer refreshes at `expires_in - 30` seconds.
  - On 401/403, transitions session state to `auth_error`.
- Updated `mobile/src/state/SessionProvider.tsx`:
  - When `state === "auth_error"` and profile is a cookie profile, redirects to `/connect?reason=web_session_ended`.

### 3. Web Login Screen (`mobile/src/screens/connect/ConnectScreen.web.tsx`)
- Web-specific login screen variant automatically loaded by Expo/Metro on web.
- Two tabs:
  - **Codice di abbinamento** (default): pairing code input + device name input.
  - **Secret del server**: server secret input with visibility toggle + device name input.
- Prefills device name using `defaultWebDeviceName()` based on browser and OS (e.g. `Browser – Chrome su Linux` / `Browser – Chrome on Linux`), capped at 40 characters without control characters.
- Base URL is derived directly from `window.location.origin` (no URL input field on web).
- On submit, posts to `/api/ext/devices/web-login` with `credentials: "same-origin"`.
- On 201:
  - Saves profile (`auth: "cookie"`, `baseUrl = location.origin`).
  - Saves device id using `pairedDevice.set(id, data.id)`.
  - Clears secret from state immediately. No secrets or tokens are stored in `localStorage`, URL, or logs.
  - Activates profile and opens session.
- Error handling with i18n mapping:
  - 401 on Code tab: `connect.badCode` ("Codice non valido o scaduto").
  - 401 on Secret tab: `connect.badSecret` ("Segreto del server errato").
  - 429: `connect.tooManyAttempts` ("Troppi tentativi. Riprova tra poco.").
  - Other errors / network failures: `common.operationFailed`.
- Displays `connect.webSessionEnded` banner when redirected due to an expired/revoked session.

### 4. Web Logout (`mobile/src/screens/settings/DevicesCard.tsx` & `cookieBootstrap.ts`)
- Implemented `webLogout(baseUrl)`: posts `POST /api/ext/devices/web-logout` with `X-Nanobot-Cookie-Auth: 1` and `credentials: "same-origin"`.
- In `DevicesCard.tsx`:
  - Identifies the current browser using `pairedDevice.get(activeProfileId)`.
  - Shows current device as `d.name (questo browser)`.
  - On web, replaces the self-revoke button with `t("devices.logoutBrowser")` ("Esci da questo browser").
  - When confirmed, calls `webLogout(session.baseUrl)`, removes the local profile, clears `pairedDevice`, closes session, and redirects to `/connect`.

### 5. Pairing Code Restriction on Web (`mobile/src/screens/settings/AboutSection.tsx`)
- On web (`Platform.OS === "web"`), disables the "Abbina un telefono" button and displays the hint `t("devices.pairFromServer")` ("Genera il codice dal telefono già abbinato o dal server").

### 6. i18n Localization (`it.json` & `en.json`)
- Added keys for `connect.badCode`, `connect.badSecret`, `connect.tooManyAttempts`, `connect.webSessionEnded`, `connect.pairingCodeTab`, `connect.serverSecretTab`, `connect.pairingCode`, `connect.pairingCodeHelp`.
- Added keys for `devices.pairFromServer`, `devices.thisBrowser`, `devices.logoutBrowser`, `devices.logoutConfirm`.

---

## Files Changed and Created

### Created
1. `mobile/src/core/cookieBootstrap.ts` — `fetchCookieBootstrap` and `webLogout` implementation.
2. `mobile/src/screens/connect/ConnectScreen.web.tsx` — Web login screen with tabs, device name prefilling, and credential-less session establishment.
3. `mobile/test/core/cookieBootstrap.test.ts` — TDD tests for `fetchCookieBootstrap`, `webLogout`, and session cookie bootstrap mode.
4. `mobile/test/platform/secretStore.web.test.ts` — TDD tests for `secretStore.web` set no-op and startup leftover cleanup.
5. `mobile/test/screens/web-auth.test.tsx` — TDD tests for web login flow, localStorage audit, secret clearing, error mappings, and session ended redirect.
6. `mobile/test/screens/web-devices.test.tsx` — TDD tests for web logout in `DevicesCard` and pairing button restriction in `AboutSection`.
7. `mobile/docs/agy/reports/WA-A.md` — This report.

### Modified
1. `mobile/src/core/profiles.ts` — Added `auth?: "cookie" | "secret" | "none"` to `Profile` and defaulted secret to empty string.
2. `mobile/src/core/session.ts` — Integrated `fetchCookieBootstrap` for `auth === "cookie"` profiles.
3. `mobile/src/platform/secretStore.web.ts` — Made set a no-op, get return null, and added `sweepOldSecrets` migration.
4. `mobile/src/screens/settings/AboutSection.tsx` — Disabled "Abbina un telefono" on web with `devices.pairFromServer` hint.
5. `mobile/src/screens/settings/DevicesCard.tsx` — Added "questo browser" label, "Esci da questo browser" button, and `webLogout` execution.
6. `mobile/src/state/SessionProvider.tsx` — Redirects cookie sessions to `/connect?reason=web_session_ended` on auth error.
7. `mobile/src/i18n/it.json` — Italian translations.
8. `mobile/src/i18n/en.json` — English translations.
