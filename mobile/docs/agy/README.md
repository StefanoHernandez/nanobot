# Antigravity (agy): project context, roles and rules

> **Fork layout override (2026-10-14).** The project now lives in the fork `StefanoHernandez/nanobot`. Read `mobile/docs/HANDOFF.md` first. Wherever this file says:
> - "main repo `nanobot_androidapp`", read **the fork's root folder**;
> - "`dev`", read **`main`**;
> - "`nanobot_androidapp-agyN`", read the worktree `../nanobot-agyN`, created per HANDOFF.md;
> - "`docs/...`", read **`mobile/docs/...`**.
>
> The app is in `mobile/`, and tests run in `mobile/`. Build the APK with `cd mobile && bash scripts/build-apk.sh`; the toolchain is in `mobile/.toolchain`.


## The project
**nanobot mobile** is a native Android app (React Native + Expo SDK 57, TypeScript strict) in `mobile/`. It is an **unofficial client** for [nanobot](https://github.com/HKUDS/nanobot), an open-source AI agent. The owner (Stefano) runs nanobot on an Arduino Uno Q and reaches it from the phone over Tailscale.

The goal is to match the full nanobot WebUI (chat, reasoning, tools, settings, skills…) and add a few features of our own: a per-chat reasoning-effort slider, a command drawer, a status panel, notifications, share-to-nanobot, and a biometric lock. The look follows the **nanobot WebUI identity**, adapted to mobile. If the app works well, we may propose it to the nanobot maintainers (HKUDS), so code quality and consistency matter.

Key design points (full spec: `mobile/docs/superpowers/specs/2026-10-13-nanobot-mobile-design.md`):
- **Never modify the nanobot server.** The app speaks nanobot's existing protocol: `/webui/bootstrap`, `/api/*`, WebSocket frames.
- **nanobot's own WebUI TypeScript code is copied unmodified** into `mobile/vendor/nanobot/` and imported as `@/lib/...`. Never edit it. Browser-vs-RN differences are handled in `mobile/src/platform/`.
- Work is split into phases. **Phase 1 = core chat.** Plan: `mobile/docs/superpowers/plans/2026-10-13-nanobot-mobile-phase1.md`. You don't need to read all of it; your brief has what you need.

## Roles
| Who | Does |
|---|---|
| **Stefano** (owner) | Decides scope; passes briefs to agy; approves agy's permissions; tests on the phone |
| **Claude** (Claude Code) | Architecture, spec, plans, hard parts (connection/session, protocol, streaming thread, effort logic, security). Writes every agy brief. **Reviews all of agy's work and is the only one who merges into `dev`** |
| **agy** (you) | Medium/simple tasks with a closed spec: screens, forms, lists, UI components, i18n, component tests. One brief = one task |

The two of us work **in parallel in separate folders**:
- Claude works in `nanobot_androidapp/` on branch `dev`.
- You work in the git worktree `nanobot_androidapp-agy/` on branch `agy/T<n>`, which Claude creates from `dev`.
- Never touch the other folder.

## Workflow per task
1. Stefano tells you which brief to run: `mobile/docs/agy/briefs/T<n>.md`.
2. Make sure you are on branch `agy/T<n>`. If `mobile/node_modules` is missing or stale, run `cd mobile && npm ci`.
3. **TDD:** write the tests listed in the brief first, run them, and see them fail. Then implement until they pass.
4. In `mobile/`, run `npx jest`, then `npx tsc --noEmit`. **Both must pass with no warnings.**
5. Commit on `agy/T<n>` with the message given in the brief.
6. Write `mobile/docs/agy/reports/T<n>.md`. Include:
   - the files changed;
   - the **raw** output of jest and tsc;
   - any dependency you added and why;
   - any doubts or deviations from the brief.
   Commit it too.
7. Tell Stefano you are done. Claude reviews. If fixes are needed, you get `mobile/docs/agy/briefs/T<n>-fix<k>.md`: apply it on the same branch, append to the same report, and commit.

## Hard rules
- **Never edit:**
  - `mobile/vendor/**`
  - `mobile/app/_layout.tsx`
  - `mobile/src/core/**`
  - `mobile/src/platform/**`
  - `mobile/src/state/**`

  These belong to Claude. If you need a change there, write it in your report instead.
- **Follow the brief exactly.** Use the exact names, props and file paths it gives, because other tasks depend on them. No redesigns. No extra features.
- **Dependencies:**
  - Add them only with `npx expo install <pkg>`, and only when the brief allows it or you justify it in the report.
  - Prefer Expo modules and React Native core.
- **No EAS / Expo cloud services.** Builds are local (Claude handles them).
- **Native folders:** `mobile/android` and `mobile/ios` are generated (CNG). Never create or edit them.
- **Routes** live in `mobile/app/` (expo-router), **not** in `src/app/`. Non-route code goes in `mobile/src/`.
- **UI building blocks:**
  - UI strings go through i18n (`mobile/src/i18n`, `it` + `en`).
  - Colors come from `useTheme()`. Never hardcode hex values in screens.
  - Touch targets are ≥ 48 dp.
  - Respect safe-area insets and the keyboard.
- **Secrets:**
  - Never log, toast or put a secret in a URL.
  - Secrets go only through `mobile/src/core/profiles.ts` (SecureStore).
  - Never call vendor `saveSecret`/`loadSavedSecret`.
- **Git:**
  - Never commit on `dev` or `master`.
  - Never push.
  - Never rewrite history on branches you didn't create.
- **Expo APIs:** Expo changes every SDK. Check the versioned docs for SDK 57 (`https://docs.expo.dev/versions/v57.0.0/`) instead of relying on memory.

## Before you say "done" (added 2026-10-14 after the final review)
1. **At least one real test per task.** Do not mock the hook or function under test. A test that mocks the thing it checks proves nothing. The MCP OAuth bug passed because the test pre-filled `authUrl`.
2. **Self-check against the brief.** In your report, list every brief item, with the file:line that implements it. Name any item you skipped or changed.
3. **Say what you could not verify.** For example, "not run on a device" or "CDN library API not checked". Never write just "completed".
