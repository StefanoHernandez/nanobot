# NT-C: notify when a chat the app is not watching gets a reply (owner: agy)

Branch `agy/NT-C`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires. **App only:** no server changes.

## The bug the user sees
An automation (cron job) runs, the server logs show the reply delivered to its chat, but the phone shows **no notification**.

**Root cause** (`mobile/src/extras/notifications.ts`, `startTurnNotifications`):
- A notification fires only on a `running → null` run-status transition (`client.onRunStatus`). The server sends run status (`goal_status`) only to clients **subscribed to that chat**, and the app subscribes only to chats opened or messaged in this app session (see the `ponytail:` comment there).
- An automation writes into a chat the user has not opened, so the app never sees its turn start or end.
- The server **does** tell every connected client when a turn ends: `{"event":"session_updated","chat_id":…,"scope":"thread"}` (`nanobot/webui/outbound_projection.py:233-247`). The vendored client exposes it as `client.onSessionUpdate(chatId, scope, workspaceScope)`. Today `chatsStore` uses it only to refresh the list.
- Also, when the app is in the foreground, nothing is shown at all (`if (isForeground() …) return`), even if the user is looking at a different chat.

## The change (all in `src/extras/notifications.ts`, plus a small helper if needed)
1. **Notify on `session_updated` with `scope === "thread"`** for a chat whose run this app did **not** track (not in the `running` map / `done` set for that chat):
   - Refresh the chat list once (`chatsStore.getState().refresh()`), then take that chat's `title` and its `preview` (the list row already carries the last-message preview; check the field name in `chatsStore`). Fallback body: `t("extras.replyReady")`.
   - Same notification shape as today: `{ title, body, data: { key } }`, channel `CHANNEL`, so tapping opens the chat (`pathOfResponse` already handles it).
   - **No duplicates:** a turn this app tracked via run status already notifies; skip it. Two `session_updated` for the same chat within 5 s count as one.
   - Skip temporary chats, `dream:` / `journal:` / other non-`websocket:` keys, and chats the user stopped (`th?.stopped`).
2. **App in the foreground:**
   - If the user is **on that chat's screen**, do nothing.
   - If the user is anywhere else, show the in-app `toast` ("Nuova risposta in «{title}»", tap opens the chat if `toast` supports an action; otherwise just the text). No system notification.
   - You need to know which chat is on screen: if no store tracks it yet, add `currentChatKey` to an existing store (e.g. `threadStore` or a tiny module-level setter called by `ThreadScreen` on focus/blur). Do not import `@react-navigation/*`.
3. Keep the existing run-status path for tracked chats; apply the same foreground rule to it (in-app toast when on another chat, nothing when on the same chat).
4. Update the `ponytail:` comment: it no longer applies.
5. i18n `it` and `en` for the new toast string.

## Tests (jest, `test/extras/notifications.test.ts` or next to the existing ones)
- `session_updated` scope `thread` for an untracked chat, app in background → one system notification with the chat title, the preview and `data.key`.
- Scope `metadata` → nothing.
- A tracked turn (run status running → null) followed by its `session_updated` → exactly one notification.
- Two `session_updated` for the same chat within 5 s → one notification.
- Foreground on the same chat → nothing; foreground on another chat → toast, no system notification.
- `dream:…` / temporary chat → nothing.

## Checks
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`

## Do not
- Edit server files or `mobile/vendor/**`. Add dependencies. Import `@react-navigation/*`.

## Report
`mobile/docs/agy/reports/NT-C.md`: files, tests, deviations, what needs a phone to check.

Commit, push `agy/NT-C`, and give the last hash. Do not merge.
