# P5b-M1: Mobile QR Pairing Scanner and Paired Devices Management (owner: agy)

This is Phase 5b (Mobile). Read `mobile/docs/agy/README.md` and `mobile/docs/superpowers/plans/2026-10-14-nanobot-phases-5b-6-7.md` first.

- **Branch:** `agy/P5b-M1`, created from `main`.
- **Before starting:** `cd mobile && npm ci`.

## Context
Server task `P5b-S1` adds revocable device pairing:
- `POST /api/devices/claim` (direct HTTP POST, body `{ code, name }`) exchanges a 5-minute one-time code for `{ device_id, device_token: "nbdev_...", name, created_at_ms }`.
- `/webui/bootstrap` accepts `device_token` in place of the master secret, so the app simply stores `device_token` as the profile's secret in `SecureStore` (`profiles.save`)!
- Authenticated endpoints:
  - `GET /api/devices` → `{ devices: Array<{ id: string; name: string; created_at_ms: number; last_seen_at_ms: number }> }`
  - Mutation `"devices.pair"` (`{}`) → `{ code: string; expires_in: number; expires_at_ms: number }`
  - Mutation `"devices.revoke"` (`{ id: string }`) → `{ ok: boolean; devices: ... }`

We want two pieces in the mobile app:
1. **In-app QR Scanner (`QrPairSheet.tsx`) on the Connect screen (`ConnectScreen.tsx`):**
   - A button **"Associa con QR" / "Pair with QR"** on `ConnectScreen.tsx`.
   - Opens `QrPairSheet`: scans a QR code using `expo-camera` (`CameraView` with `barcodeScannerSettings={{ barcodeTypes: ["qr"] }}`), or allows typing/pasting the URL + 8-char code (`XXXX-XXXX`) manually if camera permission is denied.
   - QR payload format: JSON `{"v":1,"url":"https://myhost.example-tailnet.ts.net","code":"ABCD-2345","name":"nanobot"}` (also accept a `nanobot://pair?url=...&code=...` URI).
   - Claims the code via `fetch(`${baseUrl}/api/devices/claim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, name: deviceName }) })`, saves the new profile via `profiles.save({ name, baseUrl }, res.device_token)`, sets it active, and opens the session!
2. **Paired Devices management (`DevicesCard.tsx`) in Settings (`OverviewSection.tsx`):**
   - Lists paired devices (`name`, `last_seen_at_ms`) from `GET /api/devices`.
   - **"Collega nuovo dispositivo (QR)" / "Link new device (QR)"** button: calls `mutate("devices.pair", {})` and displays a `Sheet` with `<QRCode value={JSON.stringify({ v: 1, url: profile.baseUrl, code: pair.code })} />` plus the `XXXX-XXXX` code and expiry countdown.
   - **"Revoca" / "Revoke"** button on each device row: opens a destructive confirm `Dialog`, then calls `mutate("devices.revoke", { id })`.

Read these files first:
- `mobile/src/screens/connect/ConnectScreen.tsx` and `ProfileForm.tsx`
- `mobile/src/core/profiles.ts` (read-only; do **not** edit `profiles.ts`)
- `mobile/src/screens/settings/OverviewSection.tsx`
- `mobile/src/screens/ecosystem/channels/ChannelConnect.tsx` (for `QRCode` usage pattern)

## What to build

**Files to create or modify (touch nothing else):**
- Install `expo-camera` via `npx expo install expo-camera` (updates `mobile/package.json` and `mobile/package-lock.json`)
- Create `mobile/src/screens/connect/QrPairSheet.tsx`
- Modify `mobile/src/screens/connect/ConnectScreen.tsx`
- Create `mobile/src/screens/settings/DevicesCard.tsx`
- Modify `mobile/src/screens/settings/OverviewSection.tsx`
- Modify `mobile/src/i18n/it.json` and `mobile/src/i18n/en.json`
- Create `mobile/test/screens/qr-pairing.test.tsx`

### 1. `mobile/src/screens/connect/QrPairSheet.tsx`
- Pure parser helper `export function parsePairingQr(raw: string): { url: string; code: string; name?: string } | null`:
  - Parses JSON `{"v":1,"url":"https://...","code":"ABCD-2345"}` or `nanobot://pair?url=...&code=...`.
  - Validates that `url` is `http://` or `https://` (strips trailing slash) and `code` is non-empty. Returns `null` on invalid input.
- Claim helper `export async function claimPairingCode(baseUrl: string, code: string, deviceName: string): Promise<{ device_id: string; device_token: string; name: string }>`:
  - `POST ${baseUrl.replace(/\/+$/, "")}/api/devices/claim` with `{ code: code.trim().toUpperCase(), name: deviceName.trim() || "nanobot mobile" }`.
  - Throws an error code `"invalid_code"` on 401/400, `"network"` on fetch error.
- Component `QrPairSheet({ open, onClose, onPaired }: { open: boolean; onClose: () => void; onPaired: (profileId: string) => void })`:
  - Requests camera permission via `useCameraPermissions()` from `expo-camera` when opened.
  - When permission is granted, renders `CameraView` (`style={{ height: 240 }}`) with `onBarcodeScanned` guarded by a `scanningRef` so a scan triggers only once.
  - Also renders manual fallback `TextField`s for Server URL, Pairing Code (`XXXX-XXXX`), and Device Name (`default: "Android"`), plus a "Collega" / "Pair" `Button` so the user can always pair even without camera access.
  - On successful claim: calls `const p = await profiles.save({ name: parsedName || "nanobot", baseUrl }, res.device_token)`, `profiles.setActive(p.id)`, and `onPaired(p.id)`.
  - On error: shows a localized toast (`pairing.qrInvalid` or `pairing.claimFailed`) — never logs the URL, code, or `device_token`!

### 2. `mobile/src/screens/connect/ConnectScreen.tsx`
- Add a secondary `Button` (`title={t("connect.pairQr")}`) next to/below the form that opens `<QrPairSheet open={qrOpen} onClose={() => setQrOpen(false)} onPaired={...} />`. When `onPaired(id)` fires, opens the session (`sessionStore.getState().open(id)`) and navigates to `"/"`.

### 3. `mobile/src/screens/settings/DevicesCard.tsx` and `OverviewSection.tsx`
- `DevicesCard`:
  - Fetches `GET /api/devices` via `session.get<{ devices: PairedDevice[] }>("/api/devices")` on mount (guarded by active session check; silently hides or shows empty state if 404 on an older un-forked server).
  - Renders each device with `name` and formatted `last_seen_at_ms`, plus a destructive "Revoca" / "Revoke" button behind a confirm `Dialog` (`mutate("devices.revoke", { id })`).
  - Renders a button **"Collega telefono (QR)" / "Link device (QR)"** that calls `mutate("devices.pair", {})` and opens a `Sheet` showing the QR code (`JSON.stringify({ v: 1, url: profile.baseUrl, code })` on a white `#fff` QR wrapper) and the plain `code`.
- Mount `<DevicesCard />` at the bottom of `OverviewSection.tsx`.

## Hard rules
- Never log `code`, `device_token`, QR payload, or `baseUrl` (`no console.*`).
- Do not edit `mobile/vendor/**`, `mobile/src/core/**`, `mobile/src/platform/**`, or `mobile/src/state/**`.
- Theme tokens only (except `#fff` QR code background wrapper), touch targets ≥ 48 dp, `KeyboardAvoidingView behavior="padding"`.

## Tests (write first in `mobile/test/screens/qr-pairing.test.tsx`)
1. `parsePairingQr`: accepts valid JSON `{"v":1,"url":"https://myhost.example-tailnet.ts.net/","code":"ABCD-2345"}` (normalizing trailing slash), accepts `nanobot://pair?url=...&code=...`, and rejects `javascript:alert(1)`, missing code, or malformed JSON.
2. `QrPairSheet` scan & claim flow: scanning a valid QR calls `fetch("https://myhost.example-tailnet.ts.net/api/devices/claim", ...)`, saves the returned `device_token` via `profiles.save`, and invokes `onPaired(profile.id)` once (ignoring duplicate barcode events while in-flight).
3. `DevicesCard`: lists devices from `GET /api/devices`, opens a confirm `Dialog` before calling `mutate("devices.revoke", { id })`, and clicking "Link device (QR)" calls `mutate("devices.pair", {})` and renders the one-time code.

## Done when
- In `mobile/`, `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` pass with zero errors.
- Committed on `agy/P5b-M1` as `feat(mobile): QR device pairing scanner and paired devices settings`, with report in `mobile/docs/agy/reports/P5b-M1.md`.
