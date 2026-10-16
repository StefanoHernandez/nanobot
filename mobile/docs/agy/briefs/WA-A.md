# WA-A: secure browser login (owner: agy)

Branch `agy/WA-A`, from `origin/main` (see the README: no rebase).

User decisions:
- in the browser, **our app** is the default web client, served by the gateway;
- the legacy WebUI stays as a server-side switch (`nanobot ui legacy`);
- login in the browser works **with a pairing code or with the server secret**. In both cases the browser **never keeps** a credential: the server gives it an HttpOnly cookie.

**Web only.** Android does not change: it keeps the device_token in SecureStore exactly as now. Put web-only code in `*.web.ts` files or behind `Platform.OS === "web"`.

## Read first
- `nanobot/ext/devices.py`, in particular `_web_login`, `_web_logout`, `_cookie_token` and `COOKIE_AUTH_HEADER` (read-only for you).
- `nanobot/webui/ws_http.py` `_handle_bootstrap` (read-only).
- `src/core/profiles.ts`, `src/core/session.ts`, `src/core/pairing.ts`, `src/screens/connect/ConnectScreen.tsx`.
- `src/platform/secretStore.web.ts`, `secretStoreShared.ts`.
- `mobile/docs/agy/README.md`.

## Server API (already built)
- `POST /api/ext/devices/web-login` with `credentials: "same-origin"`.
  - Body: `{ code, name }` or `{ secret, name }`. The name comes from the browser, e.g. "Browser – Firefox su Linux" (at most 40 chars, no control characters).
  - 201 `{ id, name }` plus `Set-Cookie: nb_device=…; HttpOnly; SameSite=Strict; Path=/` (and `Secure` on https). The token **is not** in the body.
  - Errors: 401 `unauthorized`, 403 `cross_origin` (always use the page's same origin), 429 `too_many_attempts` or `too_many_devices`, 400 `invalid_name`.
- `GET /webui/bootstrap` with header **`X-Nanobot-Cookie-Auth: 1`** and `credentials: "same-origin"`, **without** `X-Nanobot-Auth`. It returns the same JSON as now (`token`, `api_token`, `expires_in`, …). Without that header the cookie is ignored.
- `POST /api/ext/devices/web-logout` with the header `X-Nanobot-Cookie-Auth: 1`. It revokes this browser and clears the cookie.

## Build
1. **Cookie mode for profiles (web).**
   - On web, a profile has `auth: "cookie"` and no secret.
   - Its `baseUrl` is **`window.location.origin`**, and there is no URL field on web. The page is served by the gateway, and the cookie only works on the same origin.
   - `secretStore.web.ts` no longer saves secrets. `set` is a no-op and `get` returns `null`.
   - **At startup, delete** every leftover `localStorage` key that starts with `nanobot.secret.` (migration from the old builds). Test it.
2. **Bootstrap (web):**
   - in `src/core/` add a `fetchCookieBootstrap(baseUrl, timeoutMs)` that does the GET above with the cookie header. Do not edit `vendor/`; if it helps, wrap the vendor `fetchBootstrap`, otherwise write a minimal fetch with the same response type;
   - `session.ts` uses it when the profile is `auth: "cookie"`. Refresh at `expires_in - 30` as it does now;
   - a 401/403 means the session is over (revoked or the cookie is gone): go back to the login screen with `connect.webSessionEnded`.
3. **Web login screen** (`ConnectScreen`, web variant):
   - two tabs, **Codice di abbinamento** (the default) and **Secret del server**. One field each, plus the name, prefilled with the browser and OS and editable;
   - submitting posts `web-login`. On 201: save the profile (`auth: "cookie"`, `baseUrl = location.origin`) and save the `id` with `pairedDevice.set` (it is not a secret), then connect;
   - after the call, the secret field is cleared from state. It is **never** written to storage, the URL or logs;
   - map errors to i18n: `connect.badCode` / `connect.badSecret` (401), `connect.tooManyAttempts` (429), `common.operationFailed` for anything else.
4. **Logout (web):** "Esci da questo browser" in Settings → Devices (or wherever the active profile's delete lives). It posts `web-logout` and then removes the local profile. The browser shows up in Devices as "questo browser" (via `pairedDevice.get`, as for the phone).
5. **Pairing codes from the browser:** a token minted from the cookie **cannot** create pairing codes; the server answers 403 `device_cannot_pair`. On web, hide or disable "Abbina un telefono" with the hint `devices.pairFromServer` ("Genera il codice dal telefono già abbinato o dal server").
6. i18n keys go in it and en. Use theme tokens, no `fontWeight`, touch targets ≥ 48dp.

## Tests (write first)
- `secretStore.web`: `set` saves nothing. Startup removes the old `nanobot.secret.*` keys and leaves the other kv keys alone.
- Web login with a code: it posts the right body with `credentials: "same-origin"`, saves the profile with `auth: "cookie"` and `baseUrl = location.origin`, and **no** `localStorage` key contains the secret or a token (scan every key and value).
- Web login with the secret: same checks. The secret is no longer in any state after the call.
- The bootstrap in cookie mode sends `X-Nanobot-Cookie-Auth: 1` and not `X-Nanobot-Auth`. A 401 goes back to login with `connect.webSessionEnded`.
- 401 / 429 / network failure map to the right i18n keys.
- Logout posts `web-logout` and removes the profile.
- On native (Platform.OS = android) nothing changes: the existing pairing and profile tests stay green.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- `bash scripts/build-web.sh` completes (the web export must still build).
- No edits to `mobile/vendor/**` or to server Python.
- Commit `feat(mobile): browser login without storing secrets`.
- Report in `mobile/docs/agy/reports/WA-A.md`. Say nothing was tested in a real browser against the gateway: Claude does that afterwards.
