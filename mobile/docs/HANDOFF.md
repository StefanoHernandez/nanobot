# HANDOFF: start here (any agent, any PC)

Last updated: 2026-10-27 (DOC-A doc refresh).

## What this repo is
`StefanoHernandez/nanobot` is a **fork of HKUDS/nanobot** (MIT). It contains:
- the **Python gateway** (upstream nanobot at the repo root, plus fork features in `nanobot/ext/` wired through small `# Fork` hooks in upstream files);
- **nanobot mobile** in `mobile/`: a React Native + Expo SDK 57 app that is the primary UI on phone and, via a static web export, in the browser when the gateway serves it.

The phone is a **dashboard client**: agent work runs on the gateway host (an Arduino UNO Q in production). Do not put real hostnames, Tailscale names, or secrets in docs.

## What exists on `main` today

### Server extensions (`nanobot/ext/`)
| Module | Role | HTTP prefix (when applicable) | Data |
|---|---|---|---|
| `approvals.py` | Phone Allow/Deny for `exec`; hooks the tool runner | `/api/ext/approvals` | `~/.nanobot/ext_approvals.json` |
| `automations.py` | Create automations from the app | `/api/ext/automations` (POST) | upstream cron store |
| `backup.py` | Scheduled backup and restore of the data dir | `/api/ext/backup` | archives under configured dir; `backup.json` in data dir |
| `costs.py` | Spend caps and pricing overrides | `/api/ext/costs` | `~/.nanobot/ext_costs.json`; reads upstream LLM usage DB read-only |
| `devices.py` | QR pairing, device tokens, full-power flag | `/api/ext/devices` | `~/.nanobot/devices.json` |
| `journal.py` | Daily journal pages and cron | `/api/ext/journal` | workspace `memory/journal/*.md`; reads sessions and kanban for context |
| `kanban.py` | Boards, tasks, bots, board chat | `/api/ext/kanban` | `~/.nanobot/ext_kanban.db` |
| `kanban_dispatch.py` | In-process dispatcher (one ready task or one mention per tick; waits while free RAM < 400 MB) | — | uses `ext_kanban.db` |
| `memory_pages.py` | Read-only Dream pages (USER, MEMORY, SOUL) | `/api/ext/memory/pages` | workspace git-tracked files |
| `model_info.py` | models.dev catalog fallback for settings | — (hooks `settings_models.py`) | `get_data_dir()/cache/models-dev.json` |
| `projects.py` | Project folders and files API | `/api/ext/projects` | `<workspace>/projects/` per project |
| `prompt_cache.py` | Anthropic/OpenAI prompt cache TTL | — (hooks providers) | config only |
| `prompts.py` | Saved prompt library | `/api/ext/prompts` | `~/.nanobot/ext_prompts.json` |
| `search.py` | Full-text search API and index | `/api/ext/search` | `get_data_dir()/ext_search.db` (rebuildable) |
| `skill_proposals.py` | Proposed skills and scout cron | `/api/ext/skills` | workspace `skills-proposed/` |
| `subagent_model.py` | Subagent model preset runtime | — (hooks subagent tool) | config only |
| `system.py` | Machine dashboard metrics | `/api/ext/system` | Linux `/proc` and `/sys` (no extra DB) |
| `webapp.py` | CSP headers when serving the app export | — | — |
| `webui_mode.py` | Choose app vs legacy WebUI; `nanobot ui` | — | `~/.nanobot/ext_webui.json` |

Every `/api/ext/*` route is registered in `nanobot/ext/router.py`; `nanobot/webui/ws_http.py` (GET) and `nanobot/channels/websocket/runtime.py` (POST) call it through one hook each. A new module is one line in that file.

Agent-facing features use **in-process tools** under `nanobot/agent/tools/` (for example `kanban_tools.py`, `search_history.py`), not a per-feature MCP server (see ADR-005).

### App areas (`mobile/src/screens/`)
| Area | Purpose |
|---|---|
| `connect/` | Profiles, pairing, connection form |
| `chats/` | Chat list and drawer |
| `thread/` | Chat UI, composer, tools, media, workspace |
| `settings/` | Models, providers, security, devices, costs, prompts, backup, machine dashboard, runtime config |
| `ecosystem/` | Channels, apps/MCP/plugins, skills, automations, kanban, read-only memory |
| `projects/` | Project list and detail |
| `search/` | Global search |
| `gallery/` | Image gallery |
| `viewer/` | Artifacts and document previews |

Shared phone-only behavior lives in `mobile/src/extras/` (lock, share, outbox, speech, widget, approvals wiring, and similar).

## Roles
| Who | Does |
|---|---|
| **Stefano** (owner) | Scope, priorities, device testing on the phone |
| **Claude** | Architecture, specs, briefs, review, merge to `main`, APK builds |
| **Cursor / agy** | One brief each in a dedicated git worktree (`../nanobot-agy*`, branch `agy/<TASK>`) |
| **Reviewer stand-in** | When Claude is away: `mobile/docs/agy/REVIEWER.md` |

## How to work
1. Read `mobile/docs/agy/README.md` for implementer rules (worktrees, no rebase mid-task, forbidden paths).
2. **Checks before you call a task done** (as applicable):
   - Python / gateway: full `pytest tests` when server files changed (see known failures below).
   - App: `cd mobile && npx jest && npx tsc --noEmit`, and `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export` when app code changed.
3. **Upstream sync recipe:** `mobile/docs/wiki/updating-nanobot.md`.
4. **Decisions:** `mobile/docs/wiki/decisions.md` (ADR-004+ supersede the old "no server changes" rule).

### Known pytest failures on the dev PC (not regressions from a typical app brief)
- `tests/channels/test_channel_setup.py` (optional Matrix dependency)
- `tests/channels/test_scheduled_delivery.py` for telegram/slack/matrix (optional channel dependencies)
- `tests/webui/test_remote_pairing.py` (local umask)
- `tests/tools/test_tool_validation.py` — `test_exec_rejects_home_path_without_home_directory` (flaky in full suite)
- `tests/test_benchmark_session_storage.py`
- Some tests need network access; treat unexpected failures as investigate-first.

## Layout and CI (short)
| Path | What |
|---|---|
| `mobile/` | Expo app; tests in `mobile/` |
| `mobile/docs/` | App docs (kept out of root `docs/` so they are not bundled into the agent docs skill) |
| `mobile/vendor/` | Frozen nanobot WebUI protocol copy — never edit |
| `.github/workflows/mobile-ci.yml` | App CI on `mobile/` changes |
| `.github/workflows/upstream-sync.yml` | Weekly upstream merge PR + vendor re-sync |
| `.github/workflows/build-arduino.yml` | Publishes branch `arduino` with prebuilt web assets |
| `main` | Integration branch |

## Deploy on the board (`arduino`)
1. Ensure CI workflow `build-arduino` is green on `main`.
2. On the board: `NANOBOT_SKIP_WEBUI_BUILD=1 uv tool install --force "nanobot-ai @ git+https://github.com/StefanoHernandez/nanobot@arduino"`.
3. `systemctl --user restart nanobot-gateway`.

The board does not compile the WebUI; branch `arduino` ships prebuilt assets.

## Read next
1. `mobile/docs/roadmap.md` — phases and backlog (check code for current status).
2. `mobile/docs/superpowers/specs/2026-10-13-nanobot-mobile-design.md` — binding mobile spec.
3. `mobile/docs/wiki/known-issues.md` — hard-won rules.
4. `mobile/docs/agy/REVIEWER.md` — reviewer role (note fork layout override at top).

## Resuming on a new PC
1. Clone the fork, `git fetch origin`, use `main` or an `agy/*` worktree branch.
2. `cd mobile && npm ci` for app work; project `.venv` (`uv`) for Python.
3. Create worktrees from repo root, for example: `git worktree add -b agy/TASK ../nanobot-agy-task origin/main`.
4. APK: `cd mobile && bash scripts/build-apk.sh` after `mobile/.toolchain` is set up (`mobile/env.sh`).

## Never
- Commit secrets, tokens, or real network hostnames.
- Edit `mobile/vendor/**`, or implementer-forbidden paths listed in `mobile/docs/agy/README.md`.
- Force-push without explicit owner approval.

## Agent restart prompts
- **Claude:** read this file and continue from roadmap / open briefs.
- **Implementer:** read `mobile/docs/agy/README.md`, then the assigned `mobile/docs/agy/briefs/<TASK>.md` on `agy/<TASK>` in your worktree.
