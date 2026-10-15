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

## Fixed later by Claude (branch `claude/server-fixes`)
| Row | Fix |
|---|---|
| 2 | Interrupted `running` tasks count as a failed attempt at dispatcher start (`recover_interrupted`). A wake stays queued until its reply is posted (`finish_wake`), so a crash mid-turn retries it. |
| 3 | Bootstrap remembers the gateway tokens it minted for a device, and revoke drops them at once. Device-minted tokens can't create pairing codes (master secret only). Already-open WebSockets still last until they reconnect. |
| 4 | The kanban schema is created once per process, not per request. Device `last_seen` is written at most once a minute. Project file reads (sync, up to 32 MB) are **still open**. |
| 5 | One wake session per (board, bot) instead of one per mention. The server copy is in English. |
| 11 | `mobile/scripts/build-web.sh` exports the web build (~20 MB, `mobile/dist-web`). A bad `NANOBOT_APP_DIST` now logs a warning. **CSP still open:** it needs a browser test, because the preview iframes inherit it. |

Also seen: `tests/webui/test_remote_pairing.py::test_server_appends_restricted_key_and_revoke_preserves_existing` and `tests/channels/test_channel_setup.py::test_every_runtime_channel_field_has_a_webui_contract` fail on `main` without these changes. They are pre-existing.

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

## Closed 2026-10-16 (Claude)

| Item | Fix |
| --- | --- |
| mobile-ci red | `m-a.test.tsx` set `process.env.TZ` at runtime, which Node ignores; it only passed on Europe/Rome machines. Now timezone-independent (checked in UTC, Rome, New York). |
| Test Suite red (basedpyright strict) | Fork `nanobot/ext/*` and `kanban_tools.py` are strict-clean. `read_json` and `router_admin_authorized` are public in `ext.devices`. |
| Windows job red | SQLite read-only URIs use `Path.as_uri()`. POSIX mode asserts are skipped on Windows. Backup tests are skipped there, since the server is Linux. Not yet confirmed green on CI. |
| Async project reads | `dispatch_projects_get` runs in `asyncio.to_thread`. |
| Revoked device keeps its open WebSocket | Device-minted tokens are tracked at the upgrade, and revoke closes those sockets with code 4003. |
| Web build CSP | When `NANOBOT_APP_DIST` is served: `object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'`, plus nosniff and no-referrer. There are deliberately no script or connect rules, because the srcdoc previews inherit the CSP. The secret is still in `localStorage`: the web build is a secondary target. |
| Kanban tools in every prompt | Merged into one `kanban` tool with `action`. |

Still open: the 2 upstream failures (`test_remote_pairing`, `test_channel_setup`), which are not ours.
