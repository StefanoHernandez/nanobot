# NT-D: keep the connection alive in the background (Android foreground service) (owner: agy)

Branch `agy/NT-D`, from `origin/main` **after NT-C is merged**, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires. **App only:** no server changes. You will write a little native Android code through an Expo config plugin, the same way `mobile/plugins/withNanobotWidget.js` does.

## Why
NT-C makes the app notify for any chat, but only while the app process is alive. When Android puts the app to sleep or kills it, the WebSocket closes and automations reach nobody. The owner chose a **light foreground service** over FCM push: a small, permanent, silent notification ("nanobot connesso") keeps the process, and therefore the existing JS WebSocket, alive. Apps without Google push (ntfy, Signal without Play Services, Conversations) do the same.

The JS side does not change: the session (`src/state/sessionStore.ts`) and its WebSocket keep running in the same process; NT-C's listeners do the notifying.

## 1. Native: plugin `mobile/plugins/withKeepAlive.js` + a tiny Expo module
- **Service** `KeepAliveService` (Kotlin), started with `startForeground`:
  - `android:foregroundServiceType="remoteMessaging"` (Android 14+ requires a type; this one fits a messaging client and has no daily time cap, unlike `dataSync`).
  - Manifest permissions: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_REMOTE_MESSAGING`, `POST_NOTIFICATIONS` (already requested by `expo-notifications`), `RECEIVE_BOOT_COMPLETED` only if you do step 4.
  - Its notification uses a **separate channel** `keepalive`, importance **MIN** (no sound, no icon in the status bar where Android allows it), ongoing, text "nanobot connesso" / "nanobot connected". Tapping it opens the app.
  - `START_STICKY`. No work of its own: it only holds the process.
- **Module** (Expo module via `expo-modules-core`, already a transitive dependency of `expo`; or a plain React Native native module if simpler): `KeepAlive.start()`, `KeepAlive.stop()`, `KeepAlive.isRunning()`. JS wrapper in `src/platform/keepAlive.ts`, with a no-op on web.
- Register the plugin in `app.json` `plugins`. `npx expo prebuild -p android --clean` must reproduce everything: no hand edits under `android/`.

## 2. JS wiring
- New pref `prefs.backgroundConnection()` (default **on**), in `src/settings/prefs.ts`.
- Start the service when a session is connected **and** the pref is on; stop it when the session is closed/forgotten (sign-out, unpair) or the pref is turned off. Put this in one place (e.g. next to `startTurnNotifications` in `app/NativeIntegrations.tsx`).
- The WebSocket must reconnect by itself after network changes or Doze. Check what the current session does on a dropped socket; if it already reconnects with backoff, leave it. If it gives up after N tries, make it keep retrying (capped backoff, e.g. 60 s) **while the service runs**. Say in the report what you found.

## 3. Settings
In Settings → Notifications (or the closest existing section), a switch **"Ricevi notifiche con l'app chiusa"** with the helper: "Tiene attiva la connessione con una notifica silenziosa. Usa un po' di batteria." When turned on, if the app is under battery optimization, offer a button that opens the system screen to exempt it (`expo-intent-launcher`, already installed: `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` needs a manifest permission; prefer `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`, which needs none).

## 4. Optional: start after reboot
Only if it is small: a `BOOT_COMPLETED` receiver that starts the service when the pref is on. If the JS session cannot connect without opening the UI, skip this step and say so in the report.

## Tests
- jest: the wiring starts the service on connect with the pref on, does not start it with the pref off, stops it on sign-out and on pref off (mock `src/platform/keepAlive.ts`).
- jest: the settings switch toggles the pref and calls start/stop.
- Native code has no unit tests: describe in the report how you checked it (emulator: `bash scripts/emulator.sh`, put the app in the background, wait 10+ minutes or force Doze with `adb shell dumpsys deviceidle force-idle`, create an automation one minute ahead, check the notification arrives).

## Checks
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`
- `cd mobile && bash scripts/build-apk.sh` must succeed (the plugin runs at prebuild).

## Do not
- Add npm dependencies (Expo modules and the config plugin API are already there). Edit server files or `mobile/vendor/**`. Import `@react-navigation/*`.
- Use `dataSync` or `specialUse` as the service type. Keep a wake lock or poll the network: the open WebSocket is the only work.

## Report
`mobile/docs/agy/reports/NT-D.md`: files, tests, how the native part was checked, what the reconnect logic does, battery notes, deviations, what needs the phone to check.

Commit, push `agy/NT-D`, and give the last hash. Do not merge.
