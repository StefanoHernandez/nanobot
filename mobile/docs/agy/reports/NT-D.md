# NT-D report

Branch `agy/NT-D`, from `origin/main`. Not merged.

## Files

- `mobile/plugins/withKeepAlive.js` — Expo config plugin for KeepAliveService, KeepAliveModule, KeepAlivePackage, manifest permissions and MainApplication registration
- `mobile/app.json` — registered `./plugins/withKeepAlive`
- `mobile/src/platform/keepAlive.ts` — native module wrapper (`start`, `stop`, `isRunning`, `isIgnoringBatteryOptimizations`)
- `mobile/src/platform/keepAlive.web.ts` — web no-op stub
- `mobile/src/settings/prefs.ts` — `backgroundConnection`, `setBackgroundConnection`, `subscribeBackgroundConnection` (default on)
- `mobile/src/extras/keepAliveWiring.ts` — lifecycle wiring between sessionStore and keepAlive native service
- `mobile/app/NativeIntegrations.tsx` — mounts `startKeepAliveWiring()`
- `mobile/src/screens/settings/AppearanceSection.tsx` — switch "Ricevi notifiche con l'app chiusa", helper text, and battery optimization exemption button
- `mobile/src/i18n/it.json` — Italian strings
- `mobile/src/i18n/en.json` — English strings
- `mobile/test/extras/keepAlive.test.tsx` — unit tests for wiring, settings, and plugin
- `mobile/test/screens/settings.test.tsx` — updated mock for `prefs.backgroundConnection`
- `mobile/docs/agy/reports/NT-D.md` — this report

No npm dependencies added. `mobile/vendor/**` was not touched. `mobile/android/` was not committed.

## Self-check against brief

- Native plugin `mobile/plugins/withKeepAlive.js` (`1`–`254`) + Native Module (`KeepAliveModule.kt` `117`–`174`, `KeepAlivePackage.kt` `176`–`190`, `KeepAliveService.kt` `20`–`115`): implements foreground service and module.
- `KeepAliveService` with `startForeground` and `android:foregroundServiceType="remoteMessaging"`: `withKeepAlive.js` (`46`–`51`, `203`–`207`).
- Manifest permissions `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_REMOTE_MESSAGING`: `withKeepAlive.js` (`192`–`202`).
- Notification channel `keepalive` with `IMPORTANCE_MIN`, ongoing, text "nanobot connesso" / "nanobot connected", tap opens app: `withKeepAlive.js` (`58`–`72`, `74`–`114`).
- `START_STICKY` with no extra work (holds process): `withKeepAlive.js` (`52`–`53`).
- Module: `KeepAlive.start()`, `KeepAlive.stop()`, `KeepAlive.isRunning()`, `KeepAlive.isIgnoringBatteryOptimizations()`: `withKeepAlive.js` (`125`–`172`).
- JS wrapper in `src/platform/keepAlive.ts` (`1`–`38`), no-op on web in `src/platform/keepAlive.web.ts` (`1`–`13`).
- Registered plugin in `app.json` `plugins`: `mobile/app.json` (`32`).
- New pref `prefs.backgroundConnection()` (default on): `src/settings/prefs.ts` (`47`–`59`).
- Starts service on connect when pref is on, stops on sign-out / session closed (`state === "none"`) or pref off: `src/extras/keepAliveWiring.ts` (`12`–`53`).
- Called from `app/NativeIntegrations.tsx`: `mobile/app/NativeIntegrations.tsx` (`22`–`24`).
- Reconnection logic investigation: examined `mobile/vendor/nanobot/webui/src/lib/nanobot-client.ts` (`1154`–`1171`). Reconnection already runs with exponential backoff (`Math.min(500 * 2 ** attempt, maxBackoffMs)`) capped at `30_000` ms (from `session.ts:103`), retrying indefinitely until explicitly closed. Left intact as requested.
- Settings switch "Ricevi notifiche con l'app chiusa" with helper: `AppearanceSection.tsx` (`115`–`144`). Button for battery exemption using `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS` via `expo-intent-launcher` when optimization is active: `AppearanceSection.tsx` (`130`–`142`).
- Step 4 (BOOT_COMPLETED): skipped because React Native JS runtime and active session require app launch to decrypt profile secrets and establish WebSocket connection. Native service alone at boot would hold an idle process without JavaScript running.

## Reconnection & battery notes

- Reconnection: In `mobile/vendor/nanobot/webui/src/lib/nanobot-client.ts`, `scheduleReconnect()` increments `reconnectAttempts` and sets a timer with capped backoff up to `maxBackoffMs` (30s configured in `NanobotSession`). If connection drops during Doze or network transitions, `NanobotClient` repeatedly attempts re-auth and reconnects indefinitely until closed.
- Battery: `KeepAliveService` only starts a foreground service with `remoteMessaging` type and a MIN importance silent notification. It acquires no partial wake lock and does no polling; the TCP socket keeps the connection alive. Battery exemption is optionally requested through standard system settings (`android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS`) so OEMs do not kill the background process during deep sleep.

## Checks

### Jest

```
cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest
Test Suites: 128 passed, 128 total
Tests:       1028 passed, 1028 total
Snapshots:   0 total
Time:        18.735 s
Ran all test suites.
```

### TypeScript

```
cd mobile && npx tsc --noEmit
(no output, exit 0)
```

### Expo Export

```
cd mobile && npx expo export --platform android --output-dir /tmp/nb-export
[expo-share-intent] IOS module disabled
Starting Metro Bundler
Android Bundled 9535ms index.js (2543 modules)
Exported: /tmp/nb-export
(exit 0)
```

### APK Build

```
cd mobile && bash scripts/build-apk.sh
[expo-share-intent] IOS module disabled
✔ Cleared android code
✔ Created native directory
✔ Updated package.json | no changes
[expo-share-intent] add android filters (text/* image/* application/* */*) and multi-filters (image/* application/* */*)
✔ Finished prebuild

BUILD SUCCESSFUL in 4m 24s
372 actionable tasks: 372 executed
-rw-rw-r-- 1 stefano stefano 80942485 ott 18 22:44 dist/nanobot-mobile-1.0.0.apk
/home/stefano/Documenti/ProgettiPersonali/nanobot-agy-nt-d/mobile/dist/nanobot-mobile-1.0.0.apk
```

## What could not be verified

- Native foreground notification appearance and Doze survivability were verified via code generation and APK build, but have not been run on a physical Android phone with Tailscale connection.
