# Claude review of the 2026-10-15 work (projects, pairing, kanban, memory, artifacts, web build)

Scope: `81ebc82d..claude/projects`, 42 commits. App: 677/677 jest, tsc clean. Server: tests/ext and touched tests green after the fixes below (1982 passed across tests/agent and tests/ext).

## Fixed by Claude (`3de86f00`)
- **Kanban tools:**
  - they now act only on the task of their own run session (`kanban:<task>:<bot>`);
  - only the task's reviewer, never its assignee, can give a review verdict;
  - main agent only, no longer subagents.
- **Fan-out:** a message wakes at most 3 bots and never its author; at most 50 pending wakes.
- **Dispatcher:**
  - `agents.defaults.kanban_dispatch` switches it off;
  - it stays idle (no DB, no seeding) until the board exists;
  - a turn times out after 10 min.
- **Test order bug:** `tests/ext/test_subagent_model.py` used `Config.model_validate`, which skips the lazy tool-config resolution.

## Open (to do next)
| # | Where | Issue |
|---|---|---|
| 1 | server | **Kanban tool tokens:** the 6 `kanban_*` schemas still ship in every prompt. Per-session hiding broke 13 upstream loop tests. Better fix: merge them into one `kanban` tool with an `action` argument. |
| 2 | server | **Stuck tasks:** after a crash, `running` tasks and open runs are not recovered at startup. A wake is deleted before its turn runs. |
| 3 | server | **Device revoke:** already-minted WS/API tokens stay valid until TTL. A revoked phone can mint pairing codes and revoke others in that window. Invalidate the issued tokens on revoke. |
| 4 | server | **Blocking I/O on the event loop:** sync SQLite per request (schema re-run per `KanbanStore()`), device `last_seen` fsync, project file reads up to 32 MB. Use `asyncio.to_thread`. |
| 5 | server | Wake sessions `kanban:wake:*` leave one session file each, with no cleanup. The hard-coded Italian `_WAKE_FAILURE_MESSAGE` lives in a server file. |
| 6 | app | **Preview network:** the permission is not reset when switching artifact version (`FileViewer.tsx:134`). |
| 7 | app | **PDF export:** `markdownToPrintHtml` lets `<svg/onload>` and remote images through. Add the viewer CSP. |
| 8 | app | **Profile switch:** ProjectDetail, Kanban and DevicesCard loads have no gen/unmount guard. |
| 9 | app | Saving an artifact twice to a project fails with no overwrite prompt; it saves the latest version, not the viewed one. |
| 10 | app | There is no warning when revoking the phone you are using. |
| 11 | web | The secret is in `localStorage` with no CSP. There is no script that builds the web export. A `NANOBOT_APP_DIST` typo falls back silently. |
| 12 | tests | Viewer libraries are stubbed under jest, so the Vega/Leaflet/JSX runtime paths never run. |
