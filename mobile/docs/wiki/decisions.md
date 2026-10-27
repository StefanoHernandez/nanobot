# Decisions
## ADR-001: React Native + vendored nanobot client
Native RN UI, but the protocol layer (`NanobotClient`, projection, API) is copied unmodified from nanobot WebUI by `sync-nanobot.sh`. Keeps parity with server changes; breakages are fixed in `src/platform`/`src/state`, never in vendor. Rejected: WebView wrapper (poor native feel), rewrite of the protocol (drift).
## ADR-002: No server changes
**Status: Superseded (2026-10-15) by ADR-004.** Kept for history.

The client was originally scoped to work against stock nanobot only. The fork now adds server features in `nanobot/ext/` (see ADR-004).
## ADR-003: Per-chat effort via presets
Effort is per chat, expressed as model presets named `<base>·<level>` plus the `/model` command; no new server API.
## ADR-004: Server features live in `nanobot/ext/`
**Context:** The fork needs approvals, kanban, device pairing, and other gateway features without large edits to HKUDS/nanobot on every upstream merge.

**Decision:** Each feature is a module under `nanobot/ext/`. Upstream files get only small `# Fork` hooks. Every `/api/ext/*` route is listed in `nanobot/ext/router.py`; upstream files hold one hook each: `dispatch_ext_get` in `nanobot/webui/ws_http.py` and `ext_post_handler` in `nanobot/channels/websocket/runtime.py`. Sync upstream weekly via `mobile/docs/wiki/updating-nanobot.md`.

**Consequences:** New server work lands in `ext/` and tests under `tests/ext/`. Merge conflicts stay localized to hook sites.
## ADR-005: In-process agent tools, not MCP
**Context:** Board RAM is limited; spawning a stdio MCP process per feature does not scale.

**Decision:** Fork features reach the agent as in-process tools (for example `nanobot/agent/tools/kanban_tools.py`, `search_history.py`) and reach the phone over HTTP/WebSocket (`/api/ext/*`). There is no MCP server face per extension today. A shared MCP endpoint can be added later if an external agent needs it.

**Consequences:** Tool registration stays in the gateway process. The old roadmap idea of an MCP face per feature is dropped (see ADR-006).
## ADR-006: One SQLite file per extension
**Context:** Upstream owns `sessions.sqlite3`; we must not alter its schema for fork features.

**Decision:** Extension state uses separate stores: `ext_kanban.db`, `ext_search.db`, JSON files under `~/.nanobot/`, and workspace files for journal and skill proposals. Costs read upstream LLM usage data read-only. `ext_search.db` is a rebuildable index over chats, journal, and kanban—not a second memory store (hybrid memory stays parked).

**Consequences:** Backup and migration are per store. The principle "two faces, one SQLite" from the 2026-10-14 roadmap is retired.
## ADR-007: Kanban runs inside the gateway
**Context:** Hermes-style boards need a dispatcher co-located with sessions and the agent loop.

**Decision:** `nanobot/ext/kanban_dispatch.py` runs in the gateway: one ready card or one board mention per tick, awaited (no fan-out). Before each tick it skips dispatch while `MemAvailable` is under `MIN_AVAILABLE_MB` (400 MB). Split kanban into its own process only if profiling shows it is too heavy on the board.

**Consequences:** Kanban turns share the same gateway resources as chat; config `agents.defaults.kanban_dispatch` can disable the loop.
## ADR-008: App web export replaces the WebUI, with fallback
**Context:** One UI stack for phone and browser; upstream WebUI still gains screens we have not ported.

**Decision:** The gateway serves the Expo web export of `mobile/` when mode is `app` (`nanobot/ext/webui_mode.py`, bundled under `nanobot/web/app`, or `NANOBOT_APP_DIST`). Legacy `nanobot/web` remains available (`nanobot ui legacy` or missing app dist). Coverage gaps are tracked in `mobile/docs/webui-coverage.md` (maintained separately). `mobile/vendor/` stays a read-only protocol copy, not the full WebUI app.

**Consequences:** Browser users get the same routes as the app where exported; CSP for the app dist is tightened in `nanobot/ext/webapp.py`.
## ADR-009: Privileged mutations need full power
**Context:** MCP installs, package changes, and similar actions can run host commands.

**Decision:** `nanobot/ext/devices.py` exposes `privileged_request()`: allowed for a local browser on the gateway host or a device token with `full_power`. Settings and WebUI mutation paths call it (for example `nanobot/webui/settings_routes.py`, `ws_http.py`).

**Consequences:** Phone clients without full power get structured `full_power_required` errors instead of silent host changes.
