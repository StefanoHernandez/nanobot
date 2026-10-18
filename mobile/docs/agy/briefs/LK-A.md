# LK-A: the app lock really locks; warning for plain http (owner: agy)

Branch `agy/LK-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`. **App only.** Two other agents work in parallel: `agy/UI-A` (kanban screens, `src/screens/thread/**`, `OutboxBar`, `NewAutomationSheet`, `SegmentedTabs`) and `agy/W2-sec` (server). Do not touch their files; i18n catalogs are shared, so only **add** keys, do not reorder.

## 1. Nothing shows or happens while locked (HIGH)
`app/_layout.tsx`: `ToastHost` and `NativeIntegrations` sit outside `LockGate` (`src/extras/lock.tsx`). So with the app locked, toasts like "nuova risposta in *<chat title>*" appear above the lock screen, a notification tap navigates, and a share intent creates a chat.
- Toasts: render `ToastHost` so it is hidden while `lockStore` says `enabled && locked` (inside `LockGate`'s content, or gated on the store; check which keeps toasts above sheets/modals as today). Toasts raised while locked are dropped, not replayed.
- `NativeIntegrations`: the notification-tap navigation and the share intake wait until unlocked (add `locked` from `lockStore` to their conditions). Notification setup, turn notifications and keep-alive wiring stay as they are (system notifications are already `PRIVATE` on the lock screen).
- Tests: with the lock on and locked, a toast is not rendered and a share intent does not call `handleShare`; after unlock the pending share is handled once and a pending notification tap navigates once.

## 2. Warning for a plain `http://` server (LOW)
The connect flow (`src/screens/connect/**`) accepts `http://` to any host, and the secret then travels in clear.
- When the URL is `http://` and the host is not local (`localhost`, `127.0.0.1`, `::1`, `10.*`, `192.168.*`, `172.16-31.*`, `*.local`) and not Tailscale (`100.64.0.0/10`, `*.ts.net`), show a one-time inline warning before connecting: "Connessione non cifrata: il secret viaggia in chiaro. Usa https o Tailscale." with "Continua comunque". No block. Put the host check in a small pure function and test it.
- i18n `it`/`en`.

## Checks
- `cd mobile && npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export-lk`

## Do not
- Edit server files or `mobile/vendor/**`. Add dependencies. Import `@react-navigation/*`.

## Report
`mobile/docs/agy/reports/LK-A.md`: files, tests, deviations, what needs a phone to check (lock + notification tap, lock + share).

Commit (no `Co-Authored-By` lines, never commit `mobile/node_modules`), push `agy/LK-A`, and give the last hash. Do not merge.
