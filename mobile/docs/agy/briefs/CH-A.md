# CH-A: the chat screen — full history, compaction done right, header, queue, reply, skills (owner: Grok)

Branch `grok/CH-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires. **App only:** every part below can be done in `mobile/`. Paths are relative to `mobile/src` unless noted.

Do the parts in order and commit after each one. If you run out of time, stop after a finished part and say where you stopped.

## 1. Load older messages (the history only *looks* deleted)
**Today:**
- `state/threadStore.ts` `hydrate` (around line 244) fetches `/api/sessions/{key}/webui-thread` **without** `limit`/`before`;
- the server returns only the newest page, about 160 events (`nanobot/webui/transcript.py`, `_DEFAULT_TRANSCRIPT_PAGE_LIMIT`);
- every hydrate, on open or on reconnect, **replaces** `messages`;
- in chats with many tools, such as project chats, older turns, files and artifacts vanish from view. They are still on disk: compaction never deletes anything.

**Change:**
- Read `has_more_before` / `before_cursor` from the response. Check the exact field names in `transcript.py` and in the vendored `mobile/vendor/nanobot/webui/src/lib/api.ts` / `types.ts`.
- Add `loadOlder(key)`. It fetches the page before the cursor and **prepends** it, without duplicates. Keep the existing projection: older rows go through the same code as today.
- In `screens/thread/MessageList.tsx`, the list is inverted, so "older" is at the end: use `onEndReached` with a small threshold, plus a spinner footer while loading. Show nothing when there is no more.
- **A re-hydrate must not throw away pages that were already loaded:** merge the newest page into what is there.
- **Tests:**
  - with a fake server that has 3 pages, scrolling loads them in order with no duplicates;
  - `has_more_before: false` stops it;
  - a reconnect keeps the older pages.

## 2. Compaction, done right
**Today:**
- **Notices never go away.** `context_compaction` pushes a `Notice` (`threadStore.ts` around 163) that is never removed: not on `turn_end`, not on `send`, not on `hydrate`. Notices render as the header of the inverted list, which is the visual bottom (`MessageList.tsx:79`), so the text stays stuck there.
- **A failed compaction says "Context compacted" too.** `NoticeRow.tsx` uses one label for every phase.
- **The context icon disappears.** After a hydrate, `state/usage.ts` `latestContextUsage` returns `null` at the persisted compaction row, so `ContextIndicator` disappears until the next answer.

**Change:**
- **Compaction is a row in the chat, not a sticky notice.**
  - Insert a compaction marker into `messages` at the point where it happened, both live and from history.
  - Render it as a thin divider: "Contesto compattato · liberati ~X token (da A a B)".
  - Keep at most one transient "Compattazione in corso…" while `phase === "started"`. Remove it on any terminal phase, on `send`, and on `hydrate`.
- **The freed tokens.** The server event has no numbers. Compute them in the app:
  - **before:** the last known context tokens, from the indicator value;
  - **after:** call `GET /api/sessions/{key}/context` (`nanobot/webui/session_context.py`) when `phase === "succeeded"`, and use `estimated_session_tokens`;
  - when "before" is unknown, show only "dopo: B token".
- **Failed and cancelled compactions** get their own labels: "Compattazione non riuscita", "Compattazione annullata".
- **The context indicator after a compaction:**
  - show the value from that `/context` call, `estimated_session_tokens` over the model's window, instead of hiding;
  - on hydrate, if the newest usage row is older than a compaction row, fetch `/context` once and use it;
  - the icon must never disappear while a chat is open with a known model window.
- **`/compact` with nothing to compact:** the server sends no event. When the user sends `/compact` and no `context_compaction` arrives within 10 s, show a toast "Niente da compattare".
- **Tests:**
  - the notice goes away;
  - a failed compaction shows its own label;
  - the divider shows the freed tokens using a mocked `/context`;
  - the indicator shows a value after a compaction;
  - `/compact` without an event shows the toast.

## 3. Header and model pill
**Today:**
- **Header title.** `screens/thread/ThreadScreen.tsx:36` shows `profile.name`, which falls back to the server host (`luffy.tailfccacd.ts.net`).
- **Model pill.** `ModelBadge.tsx` shows "Scegli il modello", because the thread starts with `preset`/`model` null and only `turn_model_updated` fills them.

**Change:**
- **Header title:** show **the chat title** (`chatsStore` chats `title`), falling back to "Nuova chat". Tapping the title still does what it does today, if anything.
- **Header subtitle:** keep the model pill.
- **Server name:** show it only in settings and in the drawer, not on each chat.
- **Model pill:** on open, resolve the chat's model the same way `extras/effort.ts` (around 210) does:
  1. the session's `model_preset` from `/api/sessions`;
  2. else the `active` preset;
  3. else the `is_default` one.

  Show that name. "Scegli il modello" appears only when nothing resolves. A live `turn_model_updated` still overrides it.
- **Tests:**
  - the header shows the chat title;
  - the pill shows the default preset before any turn.

## 4. Messages sent while the bot is working go into a visible queue
**Today:** sending while running "steers": the text goes straight into the running turn, which the server drains between iterations (`threadStore.send`, `startsNewRun:false`). The user cannot see, change or cancel it.

**Change, like Claude:**
- **Sending while running does not send.** It adds the text to a **queue for this chat**, shown above the composer as small cards.
- **Each card has three actions:**
  - **"Invia ora":** send it now as a steer, which is today's behavior;
  - **"Modifica":** put the text back in the composer and remove the card;
  - **"Elimina".**
- **When the turn ends** (`turn_end`), the queue sends the **first** card as a new message, and the rest one at a time after each following turn.
- **The queue is in memory per chat.** It is fine to lose it if the app is killed: there is the offline outbox for that.
- **Do not change** the offline outbox (`extras/outbox.ts`).
- **Tests:**
  - sending while running queues;
  - "Invia ora" steers;
  - "Modifica" refills the composer;
  - "Elimina" removes;
  - `turn_end` sends the first card.

## 5. Swipe a message to reply to it (like WhatsApp)
- **The gesture:** swipe right on any message, the user's or the bot's, to quote it.
  - Use `react-native-gesture-handler`'s `Swipeable`, or `Gesture.Pan`. It is already a dependency through expo-router/drawer: **check `package.json` first**. If it is not a direct dependency, use RN `PanResponder`. Do not add packages.
  - Give haptic feedback with `expo-haptics` only if it is already installed.
- **Above the composer** appears a reply bar: the first ~120 characters of the quoted message, with an X to drop it.
- **On send,** the text sent is:
  ```
  > <quoted text, each line prefixed with "> ">
  
  <user text>
  ```
  No server change is needed. Cut the quote at 500 characters with "…".
- **Fork stays as it is,** on long-press of an answer.
- **Tests:**
  - the swipe sets the reply bar;
  - the X clears it;
  - send prefixes the quote.

## 6. Call a skill by name from the composer
**Today:** the server already loads a skill when the message contains `$skill-name` (`nanobot/agent/skills.py:28`), but the app has no way to find skills. Typing "/" shows only commands (`screens/thread/SlashMenu.tsx`).

**Change:**
- **Typing "/" also lists the skills,** after the commands, under a small "Skill" heading. Load them from the existing skills API the app already uses on the Skills screen (`src/ecosystem/` skills).
- **Choosing a skill** inserts `$<name> ` into the draft, not `/name`.
- **Typing "$" opens the same menu,** filtered to skills only.
- **Tests:**
  - "/" shows commands plus skills;
  - picking a skill inserts `$name `;
  - "$sk" filters.

## 7. Attach sheet: a camera
- **Add "Fotocamera"** next to Photos and Files in the attach sheet (`screens/thread/Composer.tsx` around 481), using `expo-image-picker`'s `launchCameraAsync`, which is already a dependency.
- **Ask for the camera permission** the way the module needs. If it is denied, show a toast.
- **Test:** the option exists and calls the camera picker (mocked).

## Checks
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`

## Do not
- Edit server files or `mobile/vendor/**`.
- Add dependencies.
- Import `@react-navigation/*`.

## Report
`mobile/docs/agy/reports/CH-A.md`, per part:
- the files and lines;
- the tests;
- any deviations;
- what needs a phone to check.

Commit, push `grok/CH-A`, and give the last hash. Do not merge.
