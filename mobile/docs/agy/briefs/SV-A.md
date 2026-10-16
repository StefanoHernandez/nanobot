# SV-A: server mode, full power and "Elimina skill" (owner: agy)

Branch `agy/SV-A`, from `origin/main` (see the README: no rebase).

## What the user wants
- They open our web app **in a browser on the arduino itself** (via XRDP), at `http://127.0.0.1:<port>` or `http://localhost:<port>`.
- From there they pair the phone with a QR code.
- Then, for chosen devices, they turn on **"Pieni poteri"** (full power).
- A full-power device can then do from anywhere what is otherwise allowed only in a browser on the server:
  - install and delete skills;
  - install features/plugins;
  - the local-only settings, including the remote-install flag.

## The server side is done (Claude, on main)
- The device list `GET /api/ext/devices` now has `full_power: boolean` on each row. Revoking a device clears it.
- `POST /api/ext/devices/full-power`, body `{ "id": string, "enabled": boolean }`:
  - accepted **only** from a browser on the server itself;
  - otherwise it returns `403 {"error":"local_browser_only"}`;
  - the auth is the same as for revoke (`Authorization: Bearer <apiToken>`).
- `POST /api/ext/devices/codes`:
  - from a browser on the server it now works even when that browser logged in as a device (before, it returned `device_cannot_pair`);
  - from there it also takes an optional body `{ "url": "https://arduino.tail…ts.net" }`, which is the address the QR sends the phone to. Without it the QR would point at `127.0.0.1`, which the phone cannot reach;
  - a bad url returns `400 {"error":"invalid_url"}`.
- The server enforces all of this. The app only shows or hides the UI.

## 1. Server mode (web only)
- **Detect it:** `Platform.OS === "web"` and `location.hostname` is `localhost`, `127.0.0.1` or `[::1]`.
  - Put this in one helper, `isServerBrowser()` in `src/platform/`, with a test.
  - It is a UI hint only: never use it to skip auth.
- **Login does not change.** The server has a secret, so the first time the user logs in as today (cookie login, typing the secret).
- **In Settings → Informazioni, when in server mode:**
  - "Collega un dispositivo" is **enabled**, instead of the disabled button with `devices.pairFromServer`.
  - Above it is a text field "Indirizzo per il telefono" (`devices.phoneUrl`):
    - placeholder `https://arduino.tuo-tailnet.ts.net:8765`;
    - remembered in `localStorage` with a safe try/catch.
  - The button calls `mintPairingCode(session, url)`. Add the optional `url`: it is sent as a JSON body, only when set.
  - It shows the QR with the existing native pairing dialog/QR component. Reuse it; do not write a second one.
  - When the url field is empty, show the hint `devices.phoneUrlHint`: "Usa l'indirizzo Tailscale del server: il telefono non raggiunge 127.0.0.1".
  - Map `invalid_url` to a toast `devices.phoneUrlInvalid`.
- **Outside server mode, web keeps today's disabled button.** Native does not change.

## 2. "Pieni poteri" in Dispositivi (`DevicesCard.tsx`)
- In `src/core/pairing.ts`:
  - add `full_power: boolean` to `PairedDevice` (parse `rec.full_power === true`);
  - add `setFullPower(session, id, enabled)`, with the same fetch shape as `revokeDevice`, at `/api/ext/devices/full-power`.
- **In server mode:** each live device row has a switch "Pieni poteri" (`devices.fullPower`).
  - Turning it **on** asks for confirmation in a Dialog. The text, `devices.fullPowerConfirm`: "Questo dispositivo potrà installare ed eliminare skill e plugin e cambiare le impostazioni riservate al server. Concedi solo a dispositivi tuoi."
  - Turning it off needs no confirmation.
  - After either change, reload the list.
  - A `403 local_browser_only` gives the toast `devices.fullPowerLocalOnly`.
- **Everywhere else (phone, remote web):** show only a small badge "Pieni poteri" on rows with `full_power`. No switch.
- i18n it/en for every new key.

## 3. "Elimina skill"
- In `src/ecosystem/skills.ts`, add `remove(name)`: `mutate<SkillActionPayload>("skill.delete", { name })`. Then refresh, as `skill.update` does.
- In `src/screens/ecosystem/skills/SkillDetailSheet.tsx`, add a destructive "Elimina skill" button (`skills.delete`).
  - It opens a confirm Dialog: `skills.deleteConfirm`, "Eliminare {{name}}? I file della skill vengono cancellati dal server."
  - A 403 from the server ("remote skill deletion is disabled") gives the toast `skills.deleteNeedsFullPower`: "Serve un browser sul server o i Pieni poteri per questo dispositivo".
  - Other errors give `common.operationFailed`.
  - Show the button only for workspace skills (the ones the user installed), not built-in ones. Use the same field the sheet already uses for the source or "builtin". If there is none, read the skills payload and use what it gives.
- The install path already exists. Map its 403 to the same `deleteNeedsFullPower`-style text: add `skills.installNeedsFullPower`.

## Tests (write first)
- `isServerBrowser`: true for localhost / 127.0.0.1 / [::1] on web; false for other hosts and on android.
- Pairing in server mode:
  - the button is enabled;
  - the url is sent in the body;
  - it is persisted;
  - `invalid_url` gives the toast;
  - outside server mode the button stays disabled.
- Full power:
  - the switch shows only in server mode;
  - turning it on asks for confirmation, then calls `setFullPower(id, true)` and reloads;
  - off calls it with `false` and no dialog;
  - the badge shows on the phone with no switch;
  - `local_browser_only` gives the toast.
- `listDevices` parses `full_power`.
- Elimina skill:
  - confirm, then `skill.delete` with the name, then refresh;
  - a 403 gives `deleteNeedsFullPower`;
  - the button is hidden for built-in skills.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- `bash scripts/build-web.sh` completes.
- No edits to `mobile/vendor/**` or to server Python.
- Commit `feat(mobile): server mode, full-power devices and skill delete`.
- Report in `mobile/docs/agy/reports/SV-A.md`.
