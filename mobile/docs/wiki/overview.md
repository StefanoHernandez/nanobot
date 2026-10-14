# Overview
nanobot mobile: a React Native (Expo SDK 57) Android client for [nanobot](https://github.com/HKUDS/nanobot). It talks to an unmodified nanobot server (WebUI endpoints) and reuses nanobot WebUI's own TypeScript protocol code, vendored unmodified in `mobile/vendor/nanobot/`.
- App id `dev.nanobot.mobile`, display name `nanobot`. Everything lives in `mobile/`.
- The older Kotlin wrapper experiment (`app/`, `extras/` at repo root, "Nanodroid") is untouched and unrelated.
- Spec: `mobile/docs/superpowers/specs/2026-10-13-nanobot-mobile-design.md`.
