# TL-A: tool activity like Claude's mobile app — a list of tools, tap one for the details (owner: agy)

**Start after CH-A is merged.** It touches the thread screen too. Branch `agy/TL-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires. **App only.**

## Today
- `mobile/src/screens/thread/ActivityRow.tsx` shows a pill: "Lavorato per 43s · 9 strumenti ▸".
- Tapping it expands, inline, a column of grey monospace `traceLines` (one-line hints), the model's in-between text, reasoning, and `FileEditList`.
- There is **no way to see one tool's arguments or result.** The data is already there:
  - each trace message has `toolEvents: ToolProgressEvent[]`, with `{phase, call_id, name, arguments, result, error}` (see `mobile/vendor/nanobot/webui/src/lib/types.ts`);
  - oversized traces carry `traceDetail.ref`, which can be fetched with `GET /api/sessions/{key}/webui-thread/trace-detail?ref=...` (`nanobot/webui/ws_http.py`).

## What the user wants (screenshots of Claude's mobile app)
1. **In the chat, a quiet line instead of the pill:** "Eseguiti 5 strumenti ›", or "Sto eseguendo… ›" while live. Keep the duration: "Lavorato per 43s · 5 strumenti ›".
2. **Tapping it opens a bottom sheet** titled "Eseguiti N strumenti", with an X to close. Inside is a vertical list, one row per tool call, joined by a thin vertical line like a timeline. Each row has:
   - an icon by tool kind:
     - shell/exec → `console`;
     - files read/write/edit → `file-document-outline` / `pencil`;
     - web → `web`;
     - search → `magnify`;
     - kanban → `view-column`;
     - anything else → `wrench`;
   - the status:
     - "Eseguito", or in red "Errore" when `phase === "error"` or there is an `error`;
     - "In corso…" with a small spinner while running;
   - a one-line description that ends with "…": the hint line for that call when there is one, otherwise the tool name plus its main argument (`command`, `path`, `url`, `query`, the first string argument).
3. **Tapping a row opens the detail view inside the same sheet,** with a back arrow to return to the list. It shows:
   - the title: the tool name, for example "exec", "read_file", "kanban";
   - the status: "Completato", "Errore" or "In corso";
   - **Descrizione:** the hint line;
   - **Comando / Argomenti:** for exec, the command; otherwise the arguments as pretty JSON. Monospace, horizontally scrollable, with a copy button;
   - **Risultato:** the result or the error text, monospace, with a copy button:
     - very long results show the first ~4000 characters, then a "Mostra tutto" that renders the rest;
     - if the result is not in `toolEvents` and the message has `traceDetail.ref`, fetch it from trace-detail, show a spinner while loading and an error line if it fails;
   - **File modificati:** for file-edit tools, the existing diff view for that `call_id` from `fileEdits`.
4. **The model's in-between text and the reasoning** stay readable: show them **in the chat, under the line**, collapsed by default as today, or as non-tappable rows in the list. Pick the cleaner one and say which in the report. Do not lose them.
5. **While the turn is live,** the list updates as tools start and end, and an open detail view updates its result when it arrives.
6. **Pairing calls:** `start` and `end` events with the same `call_id` are one row. Calls without a `call_id` are one row each, in order.

## Where
- A new `ToolActivitySheet.tsx` in `screens/thread/`, with the list and the detail.
- A pure helper `toolCallsOf(messages)`. It returns `{id, name, status, hint, args, result, error, detailRef, fileEdits}[]`. Unit-test it.
- `ActivityRow.tsx` becomes the line plus the sheet. Reuse `Sheet` (with `scroll={false}` and a `FlatList` for long lists), `IconButton`, the copy helper used by `CodeBlock` or `expo-clipboard`, and the theme tokens.

## Tests
- `toolCallsOf`:
  - start and end are paired;
  - an error gives the error status;
  - the description comes from the hint, or from name plus argument;
  - calls without an id stay separate.
- The line shows the count, and tapping it opens the sheet with N rows.
- Tapping a row shows the command and result. Copy calls the clipboard (mocked).
- A missing result with `traceDetail.ref` fetches trace-detail (mocked) and shows it.
- A live update adds a row and changes "In corso" to "Eseguito".

## Checks
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`

## Do not
- Add dependencies.
- Edit server files or `mobile/vendor/**`.
- Import `@react-navigation/*`.

## Report
`mobile/docs/agy/reports/TL-A.md` with:
- the files;
- the tests;
- the choice made in point 4;
- any deviations.

Commit, push `agy/TL-A`, and give the last hash. Do not merge.
