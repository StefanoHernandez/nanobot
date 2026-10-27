# DOC-A report

Branch: `agy/DOC-A`. Worktree: `../nanobot-agy-doc-a`. Docs only; no code or tests run (brief scope).

## Files changed
- `mobile/docs/HANDOFF.md` — rewritten for current fork layout, ext modules, app areas, roles, checks, deploy, pytest allowlist.
- `mobile/docs/wiki/decisions.md` — ADR-002 superseded; added ADR-004 through ADR-009.
- `mobile/docs/roadmap.md` — retired "two faces, one SQLite"; marked phases 4–5, 5b, 7 and 2026-10-15 backlog items done on `main`; updated fork principle bullet.
- `mobile/docs/wiki/updating-nanobot.md` — full upstream sync recipe and trap list.
- `mobile/docs/agy/README.md` — ADR-004 server rule; Cursor in roles table.
- `mobile/docs/agy/REVIEWER.md` — pointer to ADR-004 instead of "never modify server".

## Brief checklist
| Item | Done |
|---|---|
| HANDOFF rewrite (fork, ext table, screens, roles, work, pytest, deploy, no secrets/hostnames) | yes |
| decisions.md ADRs | yes |
| roadmap.md principles + done markers | yes |
| README + updating-nanobot + grep fixes outside excluded dirs | yes |
| Report | yes |

## Claims marked not verified
- **Kanban memory guard before each tick (ADR-007 / brief KB-C):** no memory guard in `nanobot/ext/kanban_dispatch.py` or `kanban.py` on `main` at merge base `fb6339587`. Documented as specified in KB-C brief, not as implemented.
- **`nanobot/ext/router.py` (ADR-004):** file does not exist on `main`; dispatch still inline in `nanobot/webui/ws_http.py` and `nanobot/channels/websocket/runtime.py`. ADR and HANDOFF note RT-A in progress.
- **Exact pytest failure set on this PC:** listed from brief and README tradition; not re-run in this task.
- **Continuous voice end-to-end on device:** code present (`voiceLoop.ts`); device behavior not verified.

## Code vs brief (no doc change required; for reviewer)
- ADR-004 text references `router.py` as the target architecture while RT-A is open — matches brief wording ("after RT-A").
- `roadmap.md` "Fork operations" section still contains historical nicknames and install notes from 2026-10-14; DOC-A only updated principles, phases, backlog, and one integration bullet per brief scope.

## Dependencies added
None.
