# SR-A: full-text search over chats, journal and kanban (owner: agy)

Branch `agy/SR-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires (full pytest: server files change). Server logic in a **fork file** `nanobot/ext/search.py`; upstream files get only one-line commented hooks. Six agy sessions run in parallel this round: in the app, touch only the files listed in §2.

## Why
- The agent's `search_sessions` tool (`nanobot/agent/tools/sessions.py`) matches only titles and recent visible text, case-folded substring, no ranking.
- The app's drawer search filters chat **titles** only.
- Since upstream `8f6a5594f`, sessions live in SQLite (`<sessions_dir>/sessions.sqlite3`, tables `sessions` and `messages(session_key, position, record JSON)`; see `nanobot/session/sqlite_store.py:44-70`). SQLite FTS5 is available in the Python build on this PC and on the arduino; check `sqlite3` FTS5 at startup and disable the feature with a log line if missing.

## 1. Server: `nanobot/ext/search.py`
- **Own database** `get_data_dir() / "ext_search.db"` (never write into `sessions.sqlite3`). One FTS5 table, e.g. `docs(source, ref, title, body, ts UNINDEXED)` with `tokenize='unicode61 remove_diacritics 2'`, plus a small `state` table for incremental sync.
- **Sources:**
  - **chats**: every visible user/assistant message of non-internal sessions (skip `dream:`, `journal:`, `kanban:`, temporary chats; use the helpers in `nanobot/session/keys.py`). One row per message: `ref = "<session_key>#<position>"`, title = chat title. Read `sessions.sqlite3` **read-only** (`mode=ro` URI), never through `SessionManager` mutations.
  - **journal**: `memory/journal/YYYY-MM-DD.md` (one row per file, `ref = "journal:<date>"`).
  - **kanban**: task title + description + run summaries from `ext_kanban.db` (read-only), `ref = "kanban:<task_id>"`.
- **Incremental refresh:** before each query, if more than 30 s passed since the last sync, re-index only what changed (sessions by `revision`/`updated_at`, journal by mtime, kanban by `updated_at`). Deleted sessions disappear. Run the refresh in a thread (`asyncio.to_thread`), never on the event loop.
- `search(query, *, sources=None, limit=20) -> list[dict]`: BM25 rank, `snippet()` excerpt with the match highlighted by `«»`, and for chats the `session_key` + `position` so a client can jump to the message. Escape user input into a safe FTS5 query (quote each term; no raw FTS syntax from the user).
- **HTTP:** `GET /api/ext/search?q=…&sources=chats,journal,kanban&limit=20`, same auth as the other ext GET routes (`admin_authorized`), registered with the same one-line hook pattern used by `dispatch_*_get` in `nanobot/webui/ws_http.py`.
- **Agent tool** `search_history(query, sources?)`: same search, results as short text lines with the chat title, date and a `session_ref` the agent can pass to `read_session`. Register it the way `nanobot/agent/tools/kanban_tools.py` is registered (find how tools in that folder are discovered). Its description must say when to prefer it over `search_sessions` (older chats, exact phrases, journal, kanban).
- **Tests** (`tests/ext/test_search.py`, `tmp_path` only, never the real `~/.nanobot`): index and find a chat message, a journal day, a kanban task; ranking puts the better match first; a new message appears after refresh; a deleted session disappears; internal sessions are never indexed; FTS syntax in the query (`"`, `*`, `NEAR`) does not crash; 401 without auth.

## 2. App
Files: `src/screens/chats/ChatDrawer.tsx` (search field only), a new `src/screens/search/SearchScreen.tsx` + route, `src/ecosystem/search.ts`, i18n.
- The drawer's "Cerca" field keeps filtering titles live. Below the filtered list, a row **"Cerca «{q}» in tutti i messaggi"** opens the search screen.
- **Search screen:** query field, source chips (Chat, Diario, Lavagna), results with title, date, the highlighted snippet (render `«…»` as bold). Tapping a chat result opens the chat **at that message** (if the thread can scroll to a position/message id, use it; otherwise open the chat and say so in the report). Journal result opens Memoria → Diario on that date; kanban result opens the task.
- Debounce 300 ms; empty state; error state.
- Tests: the drawer row appears with a query; results render with bold highlight; tap navigation per source (mock router).

## Checks
- `.venv/bin/python -m pytest -p no:cacheprovider tests` (known failures in the README).
- `.venv/bin/ruff check` and `.venv/bin/basedpyright` on the touched Python files.
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`

## Do not
- Write to `sessions.sqlite3` or `ext_kanban.db`. Add dependencies. Edit `mobile/vendor/**`. Import `@react-navigation/*`.

## Report
`mobile/docs/agy/reports/SR-A.md`: files, tests, index size and refresh time on a realistic fixture (e.g. 50 chats × 200 messages), deviations, what needs the arduino or a phone to check.

Commit, push `agy/SR-A`, and give the last hash. Do not merge.
