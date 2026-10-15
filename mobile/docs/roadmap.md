# Roadmap: nanobot mobile + nanobot fork

## Principles (user decisions, 2026-10-13/14)
- **The phone is a dashboard only.** Everything executes on nanobot on the Arduino UNO Q. There are no phone-as-node features: the agent never drives the camera, SMS, contacts or notifications.
- **We run our own nanobot fork**, `StefanoHernandez/nanobot`. A weekly GitHub Action merges upstream and opens a PR.
  - Development happens on the Mac. The UNO Q installs with `pip install git+https://github.com/StefanoHernandez/nanobot@main`.
  - **Keep upstream conflicts small.** New features live in their own packages or modules (MCP server, plugin, separate dir). The fork carries only thin integration: config wiring, WebUI pages, gateway hooks. Never rewrite upstream files when an extension point exists.
- **Every new server feature exposes two faces from one process and one SQLite DB:**
  - an **MCP face** for agents;
  - an **HTTP+WS face** for the app and WebUI.

  It is reached from the phone via `tailscale serve` on a path, with its own secret stored in SecureStore.
- Workflow: Claude writes briefs (`mobile/docs/agy/briefs/`) and reviews on request; agy implements.

## Decision (2026-10-15): the app replaces the legacy WebUI

The legacy WebUI (`nanobot/web`, what branch `arduino` serves in the browser) will be replaced by a web export of `mobile/`. The phone stays the Android APK. The browser on the server will show the same screens, black purple and gold, including the QR pairing page.

This is not a copy of the APK into the current site. Expo exports static files, and the gateway serves that folder the same way it serves `nanobot/web/dist` today.

Before the legacy site is removed, the native pieces need a browser equivalent: the secret store, the camera scanner, and the preview WebView. The Android widget, notifications, and share sheet stay on the phone.

Kanban for this scope is done. The web export has started: the browser keeps the profile secret in localStorage for that origin, not in SecureStore. Formulas and previews run in a separate frame that cannot read that secret. Until the export covers connect, chat, and settings, the legacy site remains the computer UI.

Phase 6 is parked. Dream stays the only memory writer. The phone memory screen is read-only. No vector database, no graph, no second fact store.

## Phases
| # | Scope | Where | Status |
|---|---|---|---|
| 1–3 | Chat, media, settings | app | done |
| 4 | Ecosystem: channels, apps/MCP/plugins, skills, automations | app | done; final review fixes FIX-A/FIX-B in progress |
| 5 | Interactive artifacts + PDF/docx/pptx/xlsx previews (P5-V1, running); share-to-nanobot, offline outbox, read-aloud replies, widget, quick tile | app | in progress |
| 5b | **QR device pairing** (fork + app). An already connected phone shows a one-time QR (code expires in 5 min; it carries the URL plus the pairing code, never the master secret). The second phone scans in the app (no deep link), claims a revocable device token, and stores it in SecureStore. The phone lists devices with Revoke. Bootstrap accepts the device token next to the secret. The computer page arrives with the web export, not as a page in the legacy WebUI. | fork + app | done on the phone |
| 6 | Hybrid memory (vectors, graph, second fact store) | — | parked 2026-10-15. Dream and the read-only memory screen stay |
| 7 | **Kanban.** Store, HTTP, phone board, chat, bots, review, and the in-process runner (one ready card or one mention per tick). No git worktrees. The computer page arrives with the web export of the app, not as a page in the legacy WebUI. | fork + app | done for this scope |
| — | iOS | — | postponed |

## Feature backlog chosen by the user (2026-10-15)
In progress:
- **Projects** (spec `superpowers/specs/2026-10-15-projects-design.md`; server done, app screens with agy);
- **Chat "Media e file"**.

Next, each one needs a short design pass first:
- **Approvals from the phone:** Allow/Deny for risky agent actions (shell, deletes, big spend). Upstream has no tool-approval mechanism, so this needs a fork hook in the tool runner.
- **Machine dashboard:** CPU, RAM, temperature, disk, gateway uptime, recent log errors, restart.
- **Costs and usage:** daily spend per model, a budget cap and alerts. Builds on upstream `nanobot/llm_usage`.
- **Prompt library:** saved prompts, recalled with one tap or from `/`, also per project.
- **Export and backup:** a chat or project to Markdown/PDF, plus a scheduled backup of `~/.nanobot`.
- **Continuous voice conversation:** dictate, get the reply read aloud, repeat.

Also noted: webhooks and checkpoints (ideas from Hermes/OpenClaw), then Phases 5b, 6 and 7.

## Fork operations (decided 2026-10-14)
- **Repo:** `https://github.com/StefanoHernandez/nanobot` (public fork of HKUDS/nanobot, MIT). Never commit secrets: config, keys and the WebUI secret stay in `~/.nanobot` on luffy.
- **Mac clone:** `~/Documents/Progetti_personali/nanobot`, with remotes `origin` (fork) and `upstream` (HKUDS).
- **Version policy (changed 2026-10-14 evening, user decision):** the fork tracks upstream **`main`**, not release tags. Reason: the app's `mobile/vendor/` WebUI client came from upstream main `cd2a863`, while the server ran release v0.3.5; the protocols differed (chat history `messages` vs `events`, missing APIs) and old chats opened empty. Rule: **`mobile/vendor/` is always an exact copy of the same upstream commit the fork is merged at.** `upstream-sync.yml` merges upstream main weekly and re-syncs `vendor/` in the same PR; `mobile-ci` fails if they differ.
- **Upstream sync:** `.github/workflows/upstream-sync.yml` runs every Monday at 06:00 UTC, or manually from the Actions tab. It opens a PR from `upstream-sync`, with "CONFLICTS" in the title when the auto-merge fails. One-time GitHub settings:
  - enable Actions on the fork;
  - Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests".
- **Where things happen:**
  - **Mac:** code and fast tests (Claude writes briefs, agy implements).
  - **GitHub Actions:** `build-arduino.yml` compiles the WebUI on every push to `main` and force-publishes branch `arduino` (code plus prebuilt `nanobot/web/dist`).
  - **luffy:** never compiles; it only installs.
- **Server facts (2026-10-14).** The machine is called **arduino** ("luffy" is the user's nickname for it):
  - nanobot v0.3.5 is installed with `uv tool` from PyPI, at `~/.local/share/uv/tools/nanobot-ai`;
  - node 24 and npm, no bun;
  - 4 cores, 3.6 GB RAM (about 1.9 GB free with Hermes running), 1.8 GB swap, 7 GB free disk.
  - Building the WebUI on luffy would be slow and swap-heavy, hence the `arduino` branch.
- **Install or update the fork on luffy** (no GitHub account needed, the repo is public):
  `NANOBOT_SKIP_WEBUI_BUILD=1 uv tool install --force "nanobot-ai @ git+https://github.com/StefanoHernandez/nanobot@arduino"`, then `nanobot gateway stop` and `nanobot gateway --background`.
- **Roll back to official:** `uv tool install --force nanobot-ai`, then restart the gateway. `~/.nanobot` is shared and untouched.
- **Switching nanobot ↔ Hermes on luffy:**
  - nanobot on: `pkill -f hermes`, `nanobot gateway --background`, `sudo tailscale serve --bg 8765`;
  - Hermes on: `nanobot gateway stop`, `nohup hermes dashboard --no-open > ~/hermes-dashboard.log 2>&1 &`, `sudo tailscale serve --bg 9119`.

## App vs official WebUI
**Extra in the app:**
- Phone and security:
  - app lock (biometric/PIN);
  - private "reply finished" notifications;
  - multiple connection profiles;
  - secret in the Android keystore (SecureStore);
  - `allowBackup` off.
- Unstable network: "Non raggiungibile – Tailscale attivo?" banner with retry, cached chats offline, auto-reconnect that resumes a cut reply in the same bubble, and a connection status panel.
- Agent media: in-chat audio player, file cards (download, open with, share), an in-app viewer (Markdown, code, JSON, CSV, text) and an image gallery.
- One-tap effort presets and a grouped `/` command drawer.
- **Phase 5:** interactive artifacts (HTML, SVG, Mermaid in a sandboxed WebView) and in-app PDF/docx/pptx/xlsx previews, including very large files (streamed PDF, chunked loading, light previews).

**Parity:** chat, attachments, `@` mentions, dictation, fork, temporary chats, subagents, context usage, workspace, diffs, KaTeX, all settings (models, providers with OAuth, capabilities, network, runtime config, restart), Channels (credentials, QR/link connect, pairing approvals), Apps (CLI, MCP with OAuth, plugins), Skills (installed, discover, trending, search), and Automations (calendar, run, results, edit).

**Deliberately excluded** (the phone is an untrusted network; these remain in the WebUI on the PC):
- `remote.*` / instances;
- custom and imported MCP servers;
- skill delete;
- API service;
- editing the remote-install flag.

**Planned:** share-to-nanobot, offline outbox, read-aloud replies, widget, quick tile, QR device pairing (5b), hybrid memory (6), multi-bot kanban (7).

## Hermes kanban notes (from docs, source not read)
Docs: https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban

**Boards and tasks**
- There are multiple isolated boards.
- Statuses: triage, todo, ready, running, blocked, review, done, archived.
- A task has one assignee (a bot/profile), a priority, a workspace (scratch, dir or git worktree), max runtime/retries, comments and attachments.

**Dependencies**
- Parent→child links: a child becomes ready when its parents are done, and reads the parents' run summaries.

**Dispatcher**
- It ticks every 60 s and claims ready tasks atomically, then spawns the assignee's agent with task env vars.
- Workers use the tools `show` → work → `heartbeat` → exactly one terminal call: `complete(summary)`, `request_review` or `block(reason)`.
- Failure handling:
  - a crash is retried, and after 2 failures the task auto-blocks;
  - transient provider errors are requeued without counting as a failure.
- Concurrency caps apply board-wide and per bot.
- A reviewer can send a task back with changes. An orchestrator bot can decompose and route work.

**Cron**
- Separate from the board in Hermes; tasks only have a one-shot `scheduled_at`.
- **Our improvement:** a recurrence field on the task re-queues it and keeps per-run history.

**UI**
- Columns with drag & drop, a create dialog, and a side drawer with edit, deps, comments, events and run history.
- Live updates over WS. A notification is sent on terminal events.

**Group chat**
- Hermes has none; bots collaborate through the board.
- Our first version uses the same model for all bots, as a group chat over the board, with per-task model override later.

**Mapping to nanobot**
- bot = nanobot profile (name, system prompt, skills, tools);
- the dispatcher runs bots via nanobot's agent API inside the fork's gateway;
- SQLite tables: boards, tasks, links, events, runs.

## Ideas borrowed from sarathy (github.com/kspviswa/sarathy, MIT, hard fork of nanobot; read-only reference, never an upstream)
- **5b pairing:** follow the `channels/dashboard/auth.py` `DeviceRegistry` pattern.
  - Opaque device tokens, with only the sha256 hash stored.
  - Register, validate, revoke and prune-stale operations.
  - Per-device notification preference.
  - Keys re-read on each request, so revocation is instant.
  - We add the QR, expiry and per-device last-seen.
  - Copied code keeps the MIT notice.
- **6 memory:** the `session/review.py` BackgroundReviewer idea. A background pass extracts "lessons" and user facts, and queues them for approval in the app's Memoria screen before writing. See `design/MEMORY_AND_SKILL_SYSTEM.md`.
- **7 kanban:** the backend channel plus the `jobs.db` event tailer, as a model for "a task event wakes the agent".
- **Maybe later:** the `/steer` command (redirect a running turn) and `/btw` (aside without derailing). They touch the agent loop, so the conflict risk is high.
- **App API reference:** its REST/WS endpoint catalogue (sessions, workspace tree, usage, jobs) is a reference only.

## Architecture & Implementation Guardrails (codebase audit, 2026-10-14)

### 1. Bot personas do not exist in upstream nanobot (`nanobot/config/schema.py`)
- **Problem:** Upstream has a single global `agents.defaults`, a single `SOUL.md` in the workspace, and `model_presets` that only change model/temperature/effort. `SubagentManager._build_tools()` (`nanobot/agent/subagent.py:205`) loads a fixed `scope="subagent"` tool registry and does not filter tools or skills per persona.
- **Solution for Phase 7:** Define a `BotPersona` table/config in our separate module (`id`, `name`, `icon`, `role_prompt`, `model_preset`, `allowed_tools`, `allowed_skills`). When the dispatcher spawns a bot turn, inject `role_prompt` via `RuntimeContextBlock` (`nanobot/runtime_context.py`) rather than mutating `SOUL.md`, and pass a persona-filtered `ToolRegistry` + `LLMRuntime` to `AgentRunner`. This keeps upstream files untouched.

### 2. Multi-agent collaboration, review loops and board group chat
- **Problem:** `SubagentManager.spawn()` is fire-and-forget. If a reviewer sends a task back (`request_review` → changes requested) or bots talk in a board group chat, naive event triggers cause infinite bot-to-bot ping-pong loops and exhaust `max_concurrent_subagents` (4) on luffy.
- **Solution for Phase 7:**
  - **Persistent session per `(task_id, bot_id)`** (e.g. `kanban:<task_id>:<bot_id>`): when a reviewer sends a task back, the worker resumes its own session with full prior context instead of starting cold.
  - **Explicit turn-taking in board group chat:** bots never auto-reply to every message. A bot wakes up only on an explicit `@mention` or orchestrator dispatch, with a hard **hop limit** (e.g. max 3 consecutive bot-to-bot hops without human input or a card state transition).
  - **Structured handoff artifacts:** alongside the text `summary`, each task run records `artifacts` (modified/created file paths, commit hashes, or git diffs) automatically injected into child tasks and reviewer prompts.

### 3. Workspace git & file-state isolation across parallel bots
- **Problem:** `MemoryStore` (`nanobot/agent/memory.py:88`) binds a `GitStore` to the workspace, and file tools enforce `FileStateStore` read-before-write checks. Two bots editing the same directory concurrently will corrupt working trees or fail `FileStates` checks.
- **Solution for Phase 7:** Default parallel code tasks on the same repository to isolated **`git worktree`** (or isolated `scratch` directories), with an Integrator/Reviewer bot (or dispatcher step) merging approved branches.

### 4. Hybrid memory (Phase 6) & RAM budget on luffy (3.6 GB total, ~1.9 GB free)
- **Problem:** Upstream spawns stdio MCP servers as separate subprocesses (`ToolLoader` / MCP client). If `nanobot-memory` loads the `multilingual-e5-small` ONNX model (~150–250 MB RAM) inside an MCP stdio subprocess while the gateway also loads it (or multiple subagents spawn MCP subprocesses), luffy will hit OOM. Additionally, upstream `Dream` (`nanobot/agent/memory.py`) periodically commits `MEMORY.md` via `GitStore`, so writing to `MEMORY.md` from `nanobot-memory` would cause git conflicts.
- **Solution for Phases 6 & 7:**
  - Run `nanobot-memory` and `nanobot-kanban` **in-process inside the gateway** (or via a single shared local HTTP/SSE endpoint) and expose agent tools through Python **`entry_points(group="nanobot.tools")`** (`nanobot/agent/tools/loader.py:68` already auto-discovers them with `_scopes = {"core", "subagent"}` and zero upstream edits). Lazy-load the ONNX session and unload it after idle timeout.
  - Keep `MEMORY.md` exclusively owned by upstream `Dream`; store structured facts, vectors and relations in SQLite (`memory.db`) and inject relevant recall via a `RuntimeContextProvider`.

### 5. Phase 5 & 5b mobile-specific edge cases
- **Offline outbox (`P5-O1`) vs stream resumption:** On reconnect, `threadStore.hydrate` may keep an unfinished assistant bubble open. The outbox flush must wait until `hydrate` finishes **and** `runStatus` for that chat is `idle` before sending queued messages.
- **QR device pairing (`Phase 5b`) vs in-memory gateway tokens:** `GatewayTokenStore` (`nanobot/webui/gateway_tokens.py`) stores session/API tokens in RAM only (`time.monotonic()`), so gateway restarts wipe them. In Phase 5b, `/webui/bootstrap` must accept the persistent `device_token` (validated against SHA-256 hashes in SQLite/JSON on disk) to mint fresh short-lived WS/API tokens seamlessly across luffy restarts.

