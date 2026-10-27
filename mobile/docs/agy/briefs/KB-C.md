# KB-C: kanban waits when the board is low on memory (owner: Cursor)

Branch `agy/KB-C`, from `origin/main`, **in your own worktree** (`../nanobot-agy-kb-c`). Follow `mobile/docs/agy/README.md` (full `pytest tests`). **Server only.** Other tasks run in parallel: RT-A (`runtime.py`, `ws_http.py`, new `nanobot/ext/router.py`), DOC-A and CV-A (docs only). You own `nanobot/ext/kanban_dispatch.py` and its tests only.

## Why
Kanban runs agent turns inside the gateway process on the UNO Q (4 cores, 3.6 GB RAM). `kanban_dispatch_loop` already runs **one** task or mention per tick and awaits it, so there is no fan-out. The remaining risk: a kanban turn starts while the board is short on memory (user chat running, a CLI tool, a browser MCP), and the tools it launches push the board into swap or the OOM killer.

## 1. Memory guard (`nanobot/ext/kanban_dispatch.py`)
- Before `dispatch_once`, read `MemAvailable` from `/proc/meminfo`. If it is below `MIN_AVAILABLE_MB = 400`, skip the tick (nothing claimed, nothing failed; the next tick retries).
- `# ponytail:` comment on the constant: fixed threshold, make it configurable only if 400 MB proves wrong on the board.
- No `/proc/meminfo` (macOS, Windows) or unreadable → dispatch as today.
- Log at info level once when it starts waiting and once when it resumes; never once per tick.
- Keep it a small helper in the same file (`_memory_available_mb() -> int | None`); no new dependency (no psutil).

## 2. Tests (`tests/ext/test_kanban_dispatch.py`, or the file that already tests the loop)
- Low memory → `dispatch_once` not called, the ready task stays ready.
- Enough memory → called.
- Missing `/proc/meminfo` → called.
- One "waiting" log line across several low-memory ticks.
Use a fake meminfo file or a patched helper; never read the real `~/.nanobot`.

## Checks
- `.venv/bin/python -m pytest -p no:cacheprovider -q tests nanobot` (known failures: see README).
- `ruff check` and `basedpyright` on the files you touched.

## Do not
- Run more than one task at a time, change timeouts, statuses or the store.
- Touch `kanban.py`, `runtime.py`, `ws_http.py`, `gateway_runtime.py`, `mobile/**`. Run `ruff format`.

## Report
`mobile/docs/agy/reports/KB-C.md`: files, raw pytest summary, deviations.

Commit (no `Co-Authored-By`), push `agy/KB-C`, give the last hash. Do not merge.
