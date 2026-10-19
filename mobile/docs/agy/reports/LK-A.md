# LK-A: the app lock really locks; warning for plain http (report)

## Files changed / created
- `mobile/src/extras/lockStore.ts` (created): isolated zustand store definition for `lockStore` preventing cyclic imports with UI components and partial mock collision in test suites.
- `mobile/src/extras/lock.tsx`: imports and re-exports `lockStore` from `./lockStore`; imports `Button` from `../ui/components/Button` directly.
- `mobile/src/ui/components/ToastHost.tsx`: gates `ToastHost` rendering on `lockStore` (`enabled && locked`); drops incoming toasts while locked; drops and clears existing toasts on lock transition.
- `mobile/app/NativeIntegrations.tsx`: gates notification-tap navigation and share intake on `lockStore` unlocked state; retains pending actions and processes them once upon unlock.
- `mobile/src/screens/connect/insecureHttp.ts` (created): pure functions `isLocalOrTailscaleHost` and `isInsecureHttpUrl` verifying private/local hosts (`localhost`, `127.0.0.1`, `::1`, `10.*`, `192.168.*`, `172.16-31.*`, `*.local`) and Tailscale ranges (`100.64.0.0/10`, `*.ts.net`).
- `mobile/src/screens/connect/ProfileForm.tsx`: renders one-time inline warning and "Continua comunque" button when `insecureWarning` is active.
- `mobile/src/screens/connect/ConnectScreen.tsx`: intercepts first submit to insecure plain http URLs, shows inline warning, and connects upon confirmation or bypass.
- `mobile/src/i18n/it.json`: added `insecureHttpWarning` and `continueAnyway` to `connect` section without reordering existing keys.
- `mobile/src/i18n/en.json`: added `insecureHttpWarning` and `continueAnyway` to `connect` section without reordering existing keys.
- `mobile/test/fixes/lk-a.test.tsx` (created): comprehensive automated tests covering host verification, insecure HTTP warning UI flow, toast suppression while locked, and notification tap / share handling upon unlock.

## Self-check against brief
- **1. Nothing shows or happens while locked (HIGH)**:
  - Toasts hidden while `lockStore` says `enabled && locked`: implemented in `mobile/src/ui/components/ToastHost.tsx:166` by returning `null` when `isLocked`.
  - Toasts raised while locked dropped, not replayed: implemented in `mobile/src/ui/components/ToastHost.tsx:96-98` in `toast.show` and `mobile/src/ui/components/ToastHost.tsx:65-72` in subscription clearing active toast.
  - Decision on `ToastHost` location: gated directly on the store in `ToastHost.tsx`. This keeps toasts above sheets and modal dialogs as today on Android (since React Native Modals mount their own `ToastHost` instances in separate native windows) without modifying `mobile/app/_layout.tsx` (preserving root layout rules).
  - Notification-tap navigation waits until unlocked: implemented in `mobile/app/NativeIntegrations.tsx:31-35` guarding `router.push` on `isLocked` and `handledTapRef`.
  - Share intake waits until unlocked: implemented in `mobile/app/NativeIntegrations.tsx:38-42` guarding `handleShare` and `resetShareIntent` on `isLocked`.
  - Notification setup, turn notifications, keep-alive wiring kept intact: verified in `mobile/app/NativeIntegrations.tsx:23-29`.
  - Tests covering locked toast dropping, locked share waiting, and single-execution on unlock: implemented in `mobile/test/fixes/lk-a.test.tsx:210-286`.
- **2. Warning for a plain `http://` server (LOW)**:
  - Host check in pure function: implemented in `mobile/src/screens/connect/insecureHttp.ts:6-45` (`isLocalOrTailscaleHost` and `isInsecureHttpUrl`).
  - Covers `localhost`, `127.0.0.1`, `::1`, `10.*`, `192.168.*`, `172.16-31.*`, `*.local`, Tailscale `100.64.0.0/10`, and `*.ts.net`: implemented in `mobile/src/screens/connect/insecureHttp.ts:13-30`.
  - Pure function unit tests: implemented in `mobile/test/fixes/lk-a.test.tsx:55-150`.
  - One-time inline warning before connecting: implemented in `mobile/src/screens/connect/ConnectScreen.tsx:98-105` and `mobile/src/screens/connect/ProfileForm.tsx:67-93`.
  - "Continua comunque" button to connect without blocking: implemented in `mobile/src/screens/connect/ProfileForm.tsx:83-88` invoking `onConfirmInsecure`.
  - i18n `it` and `en`: added in `mobile/src/i18n/it.json:184-185` and `mobile/src/i18n/en.json:184-185`.

## Dependencies
- No new dependencies added.

## Deviations / Design decisions
- Rather than moving `ToastHost` inside `LockGate` in `app/_layout.tsx`, gating was implemented inside `ToastHost.tsx` using `useStore(lockStore)`. As noted in the brief ("inside LockGate's content, or gated on the store; check which keeps toasts above sheets/modals as today"), gating on the store ensures toasts are hidden across all active hosts (root, Sheet, Dialog) when locked, while maintaining proper stacking above modals when unlocked without touching `app/_layout.tsx`.
- Extracted `lockStore` into `src/extras/lockStore.ts` and re-exported it from `src/extras/lock.tsx`. This avoids cyclic dependency issues when `ToastHost` imports `lockStore` and ensures that tests which mock `src/extras/lock` (such as `test/screens/settings.test.tsx`) do not accidentally undefined-out the store for unrelated modules.

## Raw check outputs

### Jest
```
PASS test/vendorVersion.test.ts
PASS test/ui/math-frame.test.ts
PASS test/platform.test.ts
PASS test/platform/uuid.test.ts
PASS test/state/session-redirect.test.ts
PASS test/ui/snackbar.test.tsx
PASS test/screens/mainLayout.test.tsx
PASS test/screens/connect-pairing.test.tsx
PASS test/state/sessionStore.test.ts
PASS test/state/fork-temp-workspace.test.ts
PASS test/ecosystem/privilege.test.tsx
PASS test/screens/attachments.test.tsx
PASS test/state/subagents.test.ts
PASS test/core/session.test.ts
PASS test/screens/model-badge.test.tsx
PASS test/screens/thread-export.test.tsx
PASS test/screens/gallery-artifacts.test.tsx
PASS test/screens/history-error.test.tsx
PASS test/screens/chat-back.test.tsx
PASS test/screens/voice-stop.test.tsx
PASS test/extras/voice.test.ts
PASS test/screens/export-artifact.test.ts
PASS test/ui/components.test.tsx
PASS test/core/upload.test.ts
PASS test/screens/camera-attachment.test.tsx
PASS test/ecosystem/channels.test.ts
PASS test/ui/botface.test.tsx
PASS test/core/cookieBootstrap.test.ts
PASS test/screens/reading-pages.test.ts
PASS test/settings/runtime-capabilities.test.ts
PASS test/state/chats.test.ts
PASS test/screens/preview-bridge.test.ts
PASS test/ui/sheet.test.tsx
PASS test/extras/useEffort.test.tsx
PASS test/core/profiles.test.ts
PASS test/extras/effort.test.ts
PASS test/screens/connect.test.tsx
PASS test/core/pairing-fullpower.test.ts
PASS test/screens/web-media.test.ts
PASS test/vendor-smoke.test.ts
PASS test/core/pairing.test.ts
PASS test/ui/theme.test.ts
PASS test/ui/anyimage.test.tsx
PASS test/artifacts/collect.test.ts
PASS test/platform/secretStore.web.test.ts
PASS test/ui/math.test.tsx
PASS test/ecosystem/kanban.test.ts
PASS test/platform/serverMode.test.ts
PASS test/extras/logic.test.ts
PASS test/screens/viewer-libs.test.ts
PASS test/screens/group-chats.test.ts
PASS test/platform/browser-store.test.ts
PASS test/artifacts/fix.test.ts
PASS test/state/usage.test.ts
PASS test/ecosystem/journal.test.ts
PASS test/screens/orientation.test.ts
PASS test/ui/provider-icon.test.tsx
PASS test/extras/native.test.tsx
PASS test/screens/skill-delete.test.tsx
PASS test/fixes/lk-a.test.tsx
PASS test/screens/settings.test.tsx

Test Suites: 132 passed, 132 total
Tests:       1066 passed, 1066 total
Snapshots:   0 total
Time:        12.433 s
```

### TypeScript (`npx tsc --noEmit`)
```
$ cd mobile && npx tsc --noEmit
(zero errors, exit code 0)
```

### Expo Export (`npx expo export --platform android --output-dir /tmp/nb-export-lk`)
```
Android Bundled 16248ms index.js (2569 modules)
Exported: /tmp/nb-export-lk
(exit code 0)
```

## What needs a phone to check
- Physical device biometric lock engaged with real incoming system notification tap: verifying the native intent transitions through the unlock prompt before pushing the chat route.
- Physical device share sheet intent from external app while the app is backgrounded and locked: confirming the system lock screen authentication appears and the shared draft is populated immediately after unlock.
