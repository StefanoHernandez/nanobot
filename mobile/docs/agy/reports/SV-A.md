# SV-A Report: Server Mode, Full Power and Skill Delete

- **Branch:** `agy/SV-A`
- **Brief:** `mobile/docs/agy/briefs/SV-A.md`
- **Commit Message:** `feat(mobile): server mode, full-power devices and skill delete`
- **Verification:**
  - `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`: PASS (104 test suites, 837 passed, 0 failed)
  - `npx tsc --noEmit`: PASS (0 errors)
  - `HOME=/tmp bash mobile/scripts/build-web.sh`: PASS (expo export web completed successfully, 20M dist-web output)
- **Focused Test Suites (19 tests):**
  - `mobile/test/platform/serverMode.test.ts` (4 passed)
  - `mobile/test/core/pairing-fullpower.test.ts` (6 passed)
  - `mobile/test/screens/server-pairing.test.tsx` (2 passed)
  - `mobile/test/screens/devices-fullpower.test.tsx` (4 passed)
  - `mobile/test/screens/skill-delete.test.tsx` (3 passed)
- **Boundaries Preserved:** No changes made to `mobile/vendor/**` or server Python (`nanobot/**`).

---

## Summary of Implementation

### 1. Server Mode Detection (`mobile/src/platform/serverMode.ts`)
- Created `isServerBrowser()` helper:
  - Returns `true` if `Platform.OS === "web"` and `window.location.hostname` is `localhost`, `127.0.0.1`, or `[::1]`.
  - Returns `false` on native platforms (iOS/Android) or remote web hostnames.
  - Used strictly as a UI hint, never bypassing authorization.
- TDD tests in `mobile/test/platform/serverMode.test.ts`.

### 2. Server Mode Pairing in Informazioni (`mobile/src/screens/settings/AboutSection.tsx`)
- In server mode (`isServerBrowser()` is true):
  - "Collega un dispositivo" (`about.pairDevice`) is **enabled** instead of being disabled with `devices.pairFromServer`.
  - Added text field "Indirizzo per il telefono" (`devices.phoneUrl`):
    - Placeholder: `https://arduino.tuo-tailnet.ts.net:8765`.
    - Persisted safely across reloads in `window.localStorage` (`nanobot.pairing.phoneUrl`).
    - When empty, displays hint `devices.phoneUrlHint` ("Usa l'indirizzo Tailscale del server: il telefono non raggiunge 127.0.0.1").
  - `mintPairingCode(session, url)` passes optional `url` as `{ "url": cleanUrl }` in request body.
  - Reuses existing native pairing QR / code dialog (`PairDialog`).
  - Error `invalid_url` displays `toast.show(t("devices.phoneUrlInvalid"))`.
- Outside server mode on web, the button remains disabled with `devices.pairFromServer`. Native platforms remain unchanged.
- TDD tests in `mobile/test/screens/server-pairing.test.tsx`.

### 3. "Pieni Poteri" in Dispositivi (`mobile/src/core/pairing.ts`, `mobile/src/screens/settings/DevicesCard.tsx`)
- In `mobile/src/core/pairing.ts`:
  - Added `full_power: boolean` to `PairedDevice` interface (parsed as `Boolean(rec.full_power)`).
  - Added `setFullPower(session, id, enabled)` calling `POST /api/ext/devices/full-power` with body `{ id, enabled }`.
- In `mobile/src/screens/settings/DevicesCard.tsx`:
  - When in server mode (`isServerBrowser()`):
    - Each active device row displays a Switch with label `devices.fullPower` ("Pieni poteri").
    - Toggling ON opens a confirmation `Dialog` with text `devices.fullPowerConfirm` ("Questo dispositivo potrà installare ed eliminare skill e plugin...").
    - Confirming calls `setFullPower(session, d.id, true)` and reloads devices list.
    - Toggling OFF immediately calls `setFullPower(session, d.id, false)` without confirmation and reloads devices list.
    - If `POST /api/ext/devices/full-power` returns 403 or `local_browser_only`, displays toast `devices.fullPowerLocalOnly`.
  - Everywhere else (phone, remote web):
    - Renders a badge `devices.fullPower` ("Pieni poteri") for devices with `full_power: true`.
    - No switch is rendered.
- TDD tests in `mobile/test/core/pairing-fullpower.test.ts` and `mobile/test/screens/devices-fullpower.test.tsx`.

### 4. "Elimina Skill" & Policy Handling (`mobile/src/ecosystem/skills.ts`, `SkillDetailSheet.tsx`, `SkillsScreen.tsx`)
- In `mobile/src/ecosystem/skills.ts`:
  - Added `remove(name: string)` calling `mutate<SkillActionPayload>("skill.delete", { name })` and updating state.
- In `mobile/src/screens/ecosystem/skills/SkillDetailSheet.tsx`:
  - Destructive button `skills.delete` ("Elimina skill") is displayed only for workspace skills (`skillDetail.source === "workspace"`), hidden for builtin skills.
  - Pressing it opens confirmation `Dialog` with `skills.deleteConfirm` ("Eliminare {{name}}? I file della skill vengono cancellati dal server.").
  - On confirm, calls `remove(skillName)`. On success, closes the sheet.
  - A 403 error displays toast `skills.deleteNeedsFullPower` ("Serve un browser sul server o i Pieni poteri per questo dispositivo"). Other errors show `common.operationFailed`.
- In `mobile/src/screens/ecosystem/skills/SkillsScreen.tsx`:
  - In `handleConfirmAction` for installing skills, mapped 403 policy error to toast `skills.installNeedsFullPower`.
- TDD tests in `mobile/test/screens/skill-delete.test.tsx`.

### 5. i18n
- Added Italian and English translations for:
  - `devices.phoneUrl`, `devices.phoneUrlHint`, `devices.phoneUrlInvalid`
  - `devices.fullPower`, `devices.fullPowerConfirm`, `devices.fullPowerLocalOnly`
  - `skills.delete`, `skills.deleteConfirm`, `skills.deleteNeedsFullPower`, `skills.installNeedsFullPower`
