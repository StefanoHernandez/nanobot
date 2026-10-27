# DOC-A: the docs describe today's fork (owner: Cursor)

Branch `agy/DOC-A`, from `origin/main`, **in your own worktree** (`../nanobot-agy-doc-a`). **Docs only**: no code, no tests. Other tasks run in parallel: RT-A (server router), KB-C (kanban memory guard), CV-A (new file `mobile/docs/webui-coverage.md`). Do not touch their files.

## Why
The docs describe the project of mid-October. `mobile/docs/HANDOFF.md` lists approvals, costs and the dashboard as next work, and they are on `main`. `mobile/docs/wiki/decisions.md` still says "ADR-002: No server changes", and `mobile/docs/agy/README.md` says "Never modify the nanobot server". An agent that starts from them works on a false map, and may "fix" deliberate choices.

Read the code, not only the old docs: `nanobot/ext/*.py`, the `# Fork` hooks (`git diff upstream/main --stat -- nanobot`), `mobile/src/`. Every claim you write must be checkable in the code; when you cannot verify something, write "not verified" instead of guessing.

Keep each paragraph on one source line (no manual wrapping). Plain, short sentences.

## 1. `mobile/docs/HANDOFF.md`: rewrite
- What the fork is: Python gateway with features in `nanobot/ext/`, thin `# Fork` hooks in upstream files, the Expo app in `mobile/`, the web export of the app served by the gateway.
- What exists on `main` today: one line per `nanobot/ext/` module (what it does, its URL prefix, where it stores data) and one line per app area (`mobile/src/screens/*`).
- Roles: Claude plans, writes briefs, reviews, merges and builds the APK; Cursor or agy implement one brief each in their own worktree; Stefano decides and tests on the phone.
- How to work: link `mobile/docs/agy/README.md`; checks (pytest, jest, tsc, expo export); known pytest failures on the dev PC (`test_channel_setup`, `test_scheduled_delivery[telegram|slack|matrix]`, `test_remote_pairing`, `test_exec_rejects_home_path_without_home_directory` flaky, `test_benchmark_session_storage`, plus tests that need internet).
- Upstream sync: recipe in `mobile/docs/wiki/updating-nanobot.md` (update that file too, see point 4).
- Deploy on the board (`arduino`): CI `build-arduino` green, then `uv tool install --force "nanobot-ai @ git+https://github.com/StefanoHernandez/nanobot@arduino"` with `NANOBOT_SKIP_WEBUI_BUILD=1`, then `systemctl --user restart nanobot-gateway`.
- No secrets, no real hostnames, no Tailscale names.

## 2. `mobile/docs/wiki/decisions.md`: ADRs
- Mark ADR-002 "Superseded (2026-10-15) by ADR-004". Do not delete it.
- Add, each with Context / Decision / Consequences, 3-6 lines:
  - **ADR-004 Server features live in `nanobot/ext/`.** Upstream files get only small `# Fork` hooks; the routes go through `nanobot/ext/router.py` (after RT-A) with one hook in `channels/websocket/runtime.py` and one in `webui/ws_http.py`. Weekly upstream sync.
  - **ADR-005 In-process agent tools, not MCP.** Server features reach the agent as in-process tools and reach the app over HTTP/WS. No MCP face: a stdio MCP process per feature does not fit the board's RAM. An MCP endpoint can be added later if an external agent needs it.
  - **ADR-006 One SQLite file per extension.** `ext_kanban.db`, `ext_search.db`, the journal files; costs read upstream's usage data read-only. Reason: never change upstream's `sessions.sqlite3` schema. The search database is a rebuildable index (chats, journal, kanban), not a second memory: the second memory store stays parked on purpose. The old roadmap principle "two faces, one SQLite" is dropped.
  - **ADR-007 Kanban runs inside the gateway.** One task or mention per tick, awaited (no fan-out), memory guard before each tick (KB-C). Split into its own process only if it proves too heavy on the board.
  - **ADR-008 The app's web export replaces the WebUI, with a fallback.** The gateway serves the app's web build; `NANOBOT_APP_DIST` and the legacy WebUI stay as fallback until the app covers the screens upstream keeps adding (see `mobile/docs/webui-coverage.md`, CV-A). `mobile/vendor/` is only the protocol layer, copied unmodified.
  - **ADR-009 Changes that run code need full power.** MCP changes, package installs and similar mutations require the local browser or a device with full power, enforced on the server (`nanobot/ext/devices.py`, `privileged_request`).
- Check each one against the code before writing it (e.g. that `privileged_request` exists, the db file names, the dispatch loop).

## 3. `mobile/docs/roadmap.md`
Replace the "two faces, one SQLite" principle with a pointer to ADR-005 and ADR-006. Mark as done the items that are on `main` (check the code). Do not invent new items.

## 4. Other stale lines
- `mobile/docs/agy/README.md`: the "Never modify the nanobot server" bullet becomes "Server features go in `nanobot/ext/` with thin `# Fork` hooks (ADR-004)"; the roles table adds Cursor next to agy as executor. Keep the rest.
- `mobile/docs/wiki/updating-nanobot.md`: the sync recipe as it is done today: merge `upstream/main` on a `claude/upstream-sync-<date>` branch; re-sync `mobile/vendor/` from the same commit (`git archive upstream/main | tar -x -C <dir>` then `SYNC_COMMIT=$(git rev-parse upstream/main) bash mobile/scripts/sync-nanobot.sh <dir>`); full pytest, jest, tsc, expo export; recurring traps (test mocks of `shutil.which` must accept `path=`, MCP connect fakes must accept `**kwargs`, the runtime-config contract test adds `MOBILE_ONLY_RUNTIME_PATHS`, vendor type changes that still compile, e.g. `onRunStatus` now passing a `RunState`).
- Grep `mobile/docs` (except `agy/briefs`, `agy/reports`, `superpowers/`, which are history) for "no server changes", "never modify the nanobot server", "two faces": fix or point to the ADR.

## Do not
- Touch code, tests, `mobile/vendor/**`, briefs or reports of other tasks, `mobile/docs/webui-coverage.md`.
- Copy secrets, hostnames, tokens or IPs into docs.

## Report
`mobile/docs/agy/reports/DOC-A.md`: files changed, every claim you marked "not verified", and anything in the code that contradicts this brief.

Commit (no `Co-Authored-By`), push `agy/DOC-A`, give the last hash. Do not merge.
