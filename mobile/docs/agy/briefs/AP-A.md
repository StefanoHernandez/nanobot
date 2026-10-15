# AP-A: approvals from the phone, app side (owner: agy)

Branch `agy/AP-A`, created from `claude/approvals` (server already done, commit `831e406d`). Worktree: whichever one is free.

## Read first
- `mobile/docs/superpowers/specs/2026-10-15-approvals-design.md`: the design and the user's decisions.
- `nanobot/ext/approvals.py`: the server API (read-only for you).
- `mobile/docs/agy/README.md` and `mobile/docs/design/companion.md`.

## Server API (already built)
All requests need the API token, the same as the other `/api/ext/*` calls. Copy how `src/ecosystem/kanban.ts` `fetchKanban`/`postKanban` build the URL and the `Authorization` header.
- `GET /api/ext/approvals` returns:
  ```
  { enabled, pending: [{ id, session_key, tool, summary, created_at, expires_in }], allow: { [session_key]: ["exec"] } }
  ```
- `POST /api/ext/approvals/decide` takes `{ id, allow: boolean, always: boolean }` and returns `{ ok }`. A 404 means already decided or expired.
- `POST /api/ext/approvals/settings` takes `{ enabled: boolean }`.
- `POST /api/ext/approvals/forget` takes `{ session_key }`.

## Build
1. **`src/extras/approvals.ts`**:
   - a Zustand store `approvalsStore`: `{ enabled, pending, allow, error }`;
   - API functions `fetchApprovals`, `decideApproval`, `setApprovalsEnabled` and `forgetApproval`;
   - a hook `useApprovalsPolling()` that calls `usePolling` (from `src/ecosystem/common.ts`) every 3 s while the session is `open` and `enabled` is true. When disabled, refresh once on mount, then every 60 s.
   - Guard results with a generation counter and the profile id, as `src/projects/store.ts` does. Clear the store on profile switch.
2. **`src/extras/ApprovalCard.tsx`**, a `Sheet` that opens for the oldest pending item, showing:
   - title `approvals.title` ("nanobot vuole eseguire un comando");
   - the command (`summary`) in a mono, selectable card;
   - the chat label: the chat title from `chatsStore` if `session_key` matches; "Kanban" for `kanban:*`; "Automazione" for `cron:*`; otherwise the key;
   - a countdown from `expires_in`;
   - buttons **Consenti** (primary), **Nega** (destructive) and **Consenti sempre in questa chat** (ghost).
   - After a decide, it closes and shows the next pending one. On 404, a quiet toast `approvals.expired`, then the next one. The card never auto-allows.
3. **Mount** `ApprovalCard` and `useApprovalsPolling` in `app/(main)/_layout.tsx`, next to `OfflineBanner`/`SharePickerSheet`, so the card appears on any screen.
4. **Background notification:** when a **new** pending id appears and `AppState` is not active, schedule one local notification `approvals.notify` ("Comando da approvare") via `expo-notifications`, on the existing channel in `src/extras/notifications.ts`. Tapping it opens the app (the card shows by itself). One notification per id. Never put the command text or any URL in the notification.
5. **Settings:** add a "Sicurezza" card to an existing settings screen (`src/screens/settings/AppearanceSection.tsx`, or a new `ApprovalsSection` wired into `SettingsScreen.tsx`) with:
   - the switch `approvals.enable` ("Approva i comandi shell"), with the subtitle "Il bot chiede il permesso sul telefono prima di ogni comando. Senza risposta in 5 minuti, il comando viene negato.";
   - the list of always-allowed chats, each with **Rimuovi** behind a confirm `Dialog` that calls forget.
6. i18n keys go in both `it.json` and `en.json`. Use theme tokens and `th.font.*` only, no `fontWeight`, touch targets ≥ 48dp.

## Tests (write first, no mocking of the store or the card)
- Polling maps a GET payload into the store, and a profile switch clears it.
- The card renders the summary and chat label. Allow, Deny and Always post the right bodies. After a decide, the next pending one shows.
- A 404 on decide shows the expired toast and moves on.
- The toggle posts settings. Remove asks for confirm and posts forget.
- A new pending id while `AppState` is `background` schedules exactly one notification, with no command text in it.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- Commit `feat(mobile): approve shell commands from the phone`.
- Report in `mobile/docs/agy/reports/AP-A.md`. Say nothing was run on a device or against a live server.
