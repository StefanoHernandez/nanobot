# M-B: outbox in other chats, offline new-chat intent, share merging (owner: agy)

Branch `agy/M-B`, created from `claude/redesign-companion`. Worktree `../nanobot-agy3`.

## Read first
- `mobile/docs/agy/README.md`: the rules.
- `mobile/docs/design/companion.md`: the design. Use tokens and `th.font.*` only, with no `fontWeight`.
- `mobile/docs/agy/reviews/claude-review-2026-10-14.md`: "Parked", the P5-O1, P5-W1 and P5-S1 lines.

## Scope (only these files)
- `src/extras/outbox.ts`, `src/extras/OutboxBar.tsx`
- `src/screens/chats/ChatDrawer.tsx`, `src/screens/chats/ChatRow.tsx`
- `app/new-chat.tsx`, `src/extras/widget.ts`
- `src/extras/share.ts`, `src/extras/SharePickerSheet.tsx`
- `src/i18n/it.json` and `src/i18n/en.json`
- New tests under `test/`

Never edit `src/state/**` (threadStore, sessionStore): they are Claude's. You only **read** them.

## 1. Outbox: show queues of other chats (do not auto-send them)
Today only the chat on screen flushes. Queues of other chats are invisible until you open that chat.
- Add a selector `pendingByChat(state): Record<string, number>` in `outbox.ts`: the count per chat for the active profile.
- **`ChatRow`:** when a chat has queued messages, show a small pill `outbox.pendingCount` ("{{count}} in attesa"), using `brandSoft`/`brandSoftForeground`.
- **`ChatDrawer`:** above the list, when any chat other than the open one has a queue, show one line: `outbox.otherChats`, e.g. "Messaggi in attesa in 2 chat". Tapping it opens the first such chat; its `OutboxBar` then flushes as it does today.
- **Do not send to chats that are not open.** This is deliberate: their thread isn't loaded, so ordering and hydrate can't be guaranteed. Write it as a comment.

## 2. Widget/tile "new chat" while offline
`app/new-chat.tsx` (~86) redirects to `/` and drops the intent when the session isn't `open` at mount (warm start).
- If a profile exists but the state is `connecting` or `reconnecting`, show the existing "opening new chat…" screen. Wait for `open`, subscribing to `sessionStore`, with up to 15 s, then create the chat once (keep the single-shot guard).
- On timeout or `offline`/`auth_error`, go to `/` and show the toast `widget.offline` ("Non connesso: riprova quando nanobot è raggiungibile").
- Unsubscribe and clear the timer on unmount.

## 3. Share: a second share must not overwrite the first
`share.ts` ~48 sets `pending` directly. Merge instead:
- texts are joined with a blank line;
- files are concatenated, without duplicates by `uri`.

Also check sizes at share time: with the server limits in `chatsStore`/`useUploadLimits`, or with the same `validateFiles` used at send time. Too-large files are dropped with the toast `extras.shareTooLarge` naming the file. Never toast the URI.

## Tests (write first)
- **Outbox:**
  - `pendingByChat` counts per chat;
  - a `ChatRow` with 2 queued messages shows the pill;
  - the drawer line appears only for chats other than the open one.
- **New-chat:**
  - mounted with state `reconnecting`, then switched to `open` → `newChat` is called once;
  - stays `reconnecting` for 15 s (fake timers) → `router.replace("/")` and the toast; `newChat` is not called.
- **Share:**
  - two shares (text plus file, then text plus another file) → `pending` has both texts and both files;
  - an oversized file is dropped with the toast.

Do not mock the function under test.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- Commit `fix(mobile): outbox pending in other chats, offline new-chat intent, share merging`.
- Report in `mobile/docs/agy/reports/M-B.md`. Say nothing was run on a device.
