# SR-A report

Branch `agy/SR-A`, from `origin/main` (`531aafa77`). Not merged.

## Files

- `nanobot/ext/search.py` (new)
- `nanobot/agent/tools/search_history.py` (new)
- `nanobot/webui/ws_http.py`
- `tests/ext/test_search.py` (new)
- `mobile/src/ecosystem/search.ts` (new)
- `mobile/src/screens/search/SearchScreen.tsx` (new)
- `mobile/app/search.tsx` (new)
- `mobile/src/screens/chats/ChatDrawer.tsx`
- `mobile/src/i18n/it.json`
- `mobile/src/i18n/en.json`
- `mobile/test/screens/search.test.tsx` (new)
- `mobile/docs/agy/reports/SR-A.md` (new)

No new dependencies added. `mobile/vendor/**`, `mobile/app/_layout.tsx`, `mobile/src/core/**`, `mobile/src/platform/**`, and `mobile/src/state/**` were untouched.

## Checks

Server, from the repo root:

```
.venv/bin/python -m pytest -p no:cacheprovider tests/ext/test_search.py
10 passed in 0.65s

.venv/bin/ruff check nanobot/ext/search.py nanobot/agent/tools/search_history.py nanobot/webui/ws_http.py tests/ext/test_search.py
All checks passed!

.venv/bin/basedpyright nanobot/ext/search.py nanobot/agent/tools/search_history.py nanobot/webui/ws_http.py tests/ext/test_search.py
0 errors, 0 warnings, 0 notes
```

Full server pytest suite:

```
.venv/bin/python -m pytest -p no:cacheprovider tests
8066 passed, 3 failed, 6 skipped
```
The 3 failures (`test_channel_setup`, `test_remote_pairing`, and `test_exec_rejects_home_path`) are the pre-existing known environment issues documented in `mobile/docs/agy/README.md`.

App, from `mobile/` with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`:

```
npx jest --no-coverage
Test Suites: 130 passed, 130 total
Tests:       1037 passed, 1037 total
Snapshots:   0 total
Time:        8.385 s
Ran all test suites.
```

TypeScript check:

```
npx tsc --noEmit
```
`tsc` exited with code 0 and no errors.

Release bundle export:

```
npx expo export --platform android --output-dir /tmp/nb-export
Android Bundled 10594ms index.js (2551 modules)
› android bundles (1):
_expo/static/js/android/index-101cf3a644b13784e7b2468c24ec96e3.hbc (8MB)
› Files (1):
metadata.json (4.6KB)
Exported: /tmp/nb-export
```

TDD: `tests/ext/test_search.py` and `mobile/test/screens/search.test.tsx` were written first and failed before the implementation, then passed once the endpoints, services, and UI components were implemented.

## Realistic Fixture Benchmark

A realistic benchmark fixture was run with 50 chat sessions each containing 200 messages (10,000 messages total across `sessions.sqlite3`), plus daily journal entries and kanban tasks:

- **Index size (`ext_search.db`):** 3.16 MB (3,313,664 bytes) for 10,000 indexed chat messages, journal entries, and kanban cards.
- **Initial index creation time:** 0.110 s (~110 ms) to scan, extract text, tokenize, and populate FTS5 indices.
- **Incremental refresh time:** 0.005 s (~5 ms) when checking revision timestamps and mtimes with no changes or small delta changes.
- **Query latency:** 1 to 4 ms per search query, including FTS5 BM25 ranking and snippet generation (`snippet(docs, -1, '«', '»', '…', 15)`).

## Brief items

| Item | Where |
|---|---|
| FTS5 check at startup with warning disable fallback | `nanobot/ext/search.py:24` |
| Dedicated SQLite FTS5 database `ext_search.db` with `mode=ro` read-only access to source stores | `nanobot/ext/search.py:53`, `:124`, `:188` |
| Indexing chats: visible non-internal sessions, `ref = "<session_key>#<position>"` | `nanobot/ext/search.py:122` |
| Indexing journal: `memory/journal/YYYY-MM-DD.md`, `ref = "journal:<date>"` | `nanobot/ext/search.py:168` |
| Indexing kanban: task title, description, run summaries, `ref = "kanban:<task_id>"` | `nanobot/ext/search.py:186` |
| Incremental refresh: 30s throttle, sessions by revision/updated_at, journal by mtime, kanban by updated_at | `nanobot/ext/search.py:214` |
| Deleted sessions disappear on refresh | `nanobot/ext/search.py:145` |
| Offloaded refresh via thread (`asyncio.to_thread`) | `nanobot/ext/search.py:314`, `nanobot/webui/ws_http.py:75` |
| BM25 ranking, snippet with `«»`, safe query escaping | `nanobot/ext/search.py:84`, `:280` |
| HTTP GET `/api/ext/search` with `router_admin_authorized` | `nanobot/ext/search.py:348`, `nanobot/webui/ws_http.py:74` |
| Agent tool `search_history` with description and auto-discovery | `nanobot/agent/tools/search_history.py:17` |
| Server tests covering chat, journal, kanban, BM25 ranking, refresh, deletions, syntax safety, 401 auth | `tests/ext/test_search.py:1` |
| Mobile search client `fetchSearch` | `mobile/src/ecosystem/search.ts:31` |
| Drawer search row "Cerca «{q}» in tutti i messaggi" opening search screen | `mobile/src/screens/chats/ChatDrawer.tsx:173` |
| Search screen with query input, source chips (Chat, Diario, Lavagna, Tutti), 300ms debounce, loading/empty/error states | `mobile/src/screens/search/SearchScreen.tsx:55` |
| Bold snippet rendering for `«…»` highlights | `mobile/src/screens/search/SearchScreen.tsx:32` |
| Tap navigation: chat opens chat thread, journal opens Memoria → Diario with date, kanban opens task | `mobile/src/screens/search/SearchScreen.tsx:94` |
| Route `/search` | `mobile/app/search.tsx:1` |
| Unit tests for drawer row, bold highlights, and tap navigation | `mobile/test/screens/search.test.tsx:1` |
| Italian and English i18n translations | `mobile/src/i18n/it.json:344`, `mobile/src/i18n/en.json:344` |

## Deviations

- Chat navigation: When a chat result is tapped, `router.push({ pathname: '/chat', params: { session: result.session_key, position: result.position } })` opens the thread. As noted in §2 of the brief, the current `ThreadScreen` does not yet implement jumping/scrolling to a specific message id or position, so the chat thread is opened and the position is passed as a route param for future scroll-to-message support.
- Memoria / Diario navigation: Tapping a journal result navigates to `/(tabs)/memory` with query parameters `tab: 'diario'` and `date: result.date`.
- Kanban navigation: Tapping a kanban result navigates to `/ecosystem/kanban` with query parameter `task: result.task_id`.

## What could not be verified

- Physical execution on the Arduino Uno Q hardware (checking that Arduino's bundled SQLite3 binary includes FTS5 enabled).
- Physical device verification on an Android smartphone connected over Tailscale.
