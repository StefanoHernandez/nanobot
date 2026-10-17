# ED-A: edit a message you already sent (owner: agy)

**Start after CH-A is merged.** It touches the message list too. Branch `agy/ED-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires. **App only:** the server already has what is needed.

## How it works (same as ChatGPT/Claude: the old version is kept as its own chat)
1. Long-press **one of your own messages** to get **"Modifica"**, next to Copy.
2. The app calls the existing fork with `before_user_index` = that message's user index. That is `chatsStore.fork`, which uses `client.forkChat(chatId, beforeUserIndex, title)` (`mobile/src/state/chatsStore.ts` around 141; server `nanobot/webui/forking.py`, which forks the session *before* user message N).
3. The app opens the new chat and **puts the old text in the composer**, cursor at the end, keyboard up. Its images or attachments are not carried over in this version: show a toast "Gli allegati vanno riaggiunti" when the message had any.
4. The user edits and sends: the bot answers from that point.
5. The original chat stays in the list. The new chat's title is the original title plus " (modificata)".

## Details
- **Computing `before_user_index`:**
  - count the user messages before it, in the **full** history (CH-A adds loading older pages);
  - if the message is not in the loaded pages, load older pages first, or use the index the projection already carries if there is one;
  - check how the existing "Fork" on assistant messages computes it, and reuse that.
- **While the bot is running** in that chat, "Modifica" is disabled, with a short reason in the menu.
- **Temporary chats:** hide "Modifica" if forking a temporary chat is not allowed. Check `chatsStore` / `temporary_chats`.
- **Fork errors:** show `common.error` and leave the composer alone.

## Tests
- The long-press menu on a user message shows Modifica; on an assistant message it does not show (Fork stays there).
- Modifica calls `forkChat` with the right `before_user_index` (mock the client), navigates to the new chat, and fills the composer with the old text.
- A message with attachments shows the toast.
- Modifica is disabled while running.

## Checks
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`

## Do not
- Add dependencies.
- Edit server files or `mobile/vendor/**`.
- Import `@react-navigation/*`.

## Report
`mobile/docs/agy/reports/ED-A.md` with:
- the files;
- the tests;
- how the index is computed;
- any deviations.

Commit, push `agy/ED-A`, and give the last hash. Do not merge.
