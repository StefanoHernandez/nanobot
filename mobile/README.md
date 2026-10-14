# nanobot mobile

An **unofficial** Android client for [nanobot](https://github.com/HKUDS/nanobot). It speaks nanobot's existing WebUI protocol (`/webui/bootstrap`, `/api/*`, WebSocket), so **the nanobot server is never modified** and server updates don't require app changes.

Phase 1 covers the core chat:
- connect to one or more servers;
- a chat list drawer;
- a streaming thread with reasoning and tool activity;
- a composer with a slash menu, a per-chat reasoning-effort slider, a command drawer, and a status dot and panel with an offline banner;
- turn-finished notifications, share text to nanobot, and a biometric lock;
- light/dark themes;
- agent media: inline images, an audio player, and files opened in the phone's apps.

The roadmap is in `../docs/superpowers/specs/2026-10-13-nanobot-mobile-design.md` and `../wiki/phases.md`.

## Install
1. Build the APK (see [Build](#build)), or take an existing one from `dist/`.
2. Copy `dist/nanobot-mobile-<version>.apk` to the phone and open it. Android asks once to allow installs from that app.

The APK is signed with the Expo default **debug** keystore. That is fine for personal use, but it is not a Play Store build.

## Connect
- **URL:** your nanobot WebUI address, e.g. `https://<host>.<tailnet>.ts.net` when you use `tailscale serve`.
- **Secret:** `channels.websocket.tokenIssueSecret` from `~/.nanobot/config.json`, or the WebUI login password. It is required for any non-localhost access.

The secret is stored only in Android's encrypted storage (expo-secure-store). It is never logged and never put in URLs.

**Cleartext:** `http://` URLs are allowed (`usesCleartextTraffic`), so you can reach LAN or Tailscale IPs without TLS. Prefer `https://` (`tailscale serve` provides it). Over plain `http` the secret and your chats travel unencrypted on that network. A URL typed without a scheme defaults to `http://`.

**Media links:** files the agent sends use signed `/api/media/...` URLs that never expire. The app downloads them but never shows or shares the links themselves. Don't forward them.

## Build
Requirements: macOS or Linux, Node 20+. The Android toolchain (JDK 17 and Android SDK 35) lives in the repo-local `../.toolchain/`. Load it with `source ./env.sh`, and remove it with `rm -rf ../.toolchain`.

```bash
npm ci
scripts/build-apk.sh
```

This runs `expo prebuild --clean` and a Gradle release build, then writes the APK to `dist/`.
- **Size:** arm64 only by default. For an emulator, use `ARCHS=arm64-v8a,x86_64 scripts/build-apk.sh`.
- **Native folders:** `android/` and `ios/` are generated (Continuous Native Generation); never edit them by hand.
- **No cloud:** there is no EAS and no Expo cloud service.

Tests: `npx jest && npx tsc --noEmit`.

## Updating the vendored nanobot code
The WebUI's TypeScript protocol and logic are copied **unmodified** into `vendor/nanobot/`, pinned in `vendor/nanobot/VERSION`. The steps:

1. Check out the target nanobot tag or commit.
2. Run `scripts/sync-nanobot.sh <checkout-dir>`.
3. Update the version constant in `src/platform/vendorVersion.ts`. A test checks that it matches `VERSION`.
4. Run `npx jest && npx tsc --noEmit`, and fix any breakage in `src/platform` or `src/state`, never in `vendor/`.

Details: `../wiki/updating-nanobot.md`.

## Layout
| Path | What |
|---|---|
| `app/` | routes (expo-router) |
| `src/core/` | profiles and secrets, session and token refresh |
| `src/state/` | Zustand stores (session, chats, thread) |
| `src/screens/` | screens |
| `src/extras/` | the app's own features (effort, commands, status, notifications, share, lock) |
| `src/ui/` | theme and UI kit |
| `src/platform/` | browser-to-RN shims for the vendor code |
| `vendor/nanobot/` | upstream code, read-only |

## License and attribution
MIT. `vendor/nanobot/` contains code from [HKUDS/nanobot](https://github.com/HKUDS/nanobot) (MIT, see `vendor/nanobot/LICENSE`), copied unmodified at the commit in `vendor/nanobot/VERSION`. This project is not affiliated with or endorsed by the nanobot authors.
