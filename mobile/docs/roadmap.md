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

## Phases
| # | Scope | Where | Status |
|---|---|---|---|
| 1–3 | Chat, media, settings | app | done |
| 4 | Ecosystem: channels, apps/MCP/plugins, skills, automations | app | done; final review fixes FIX-A/FIX-B in progress |
| 5 | Interactive artifacts + PDF/docx/pptx/xlsx previews (P5-V1, running); share-to-nanobot, offline outbox, read-aloud replies, widget, quick tile | app | in progress |
| 5b | **QR device pairing** (fork + app). WebUI of the fork: Settings → "Collega telefono" shows a one-time QR (code expires in 5 min; it carries the URL plus the pairing code, never the master secret). The app's Connect screen has an in-app scanner (no deep link). The app claims the code and gets its own revocable device token, stored in SecureStore. The WebUI lists devices (name, last seen) with Revoke. Bootstrap accepts the device token next to the secret. New module + thin bootstrap hook in the fork. | fork + app | planned (user chose option B, 2026-10-14) |
| 6 | **Hybrid memory** `nanobot-memory`: Markdown (MEMORY.md/Dream compatible) + vectors (SQLite + sqlite-vec, local ONNX embedding `multilingual-e5-small`) + relation graph (SQLite tables; entities/relations passed by the agent, no extra LLM key). Tools `remember`/`recall`/`related`. App screen "Memoria". | fork/UNO Q + app | planned |
| 7 | **Kanban multi-bot** `nanobot-kanban` (modelled on Hermes kanban, see below). App section "Kanban" (+ WebUI page in the fork). | fork/UNO Q + app | planned |
| — | iOS | — | postponed |

## Fork operations (decided 2026-10-14)
- **Repo:** `https://github.com/StefanoHernandez/nanobot` (public fork of HKUDS/nanobot, MIT). Never commit secrets: config, keys and the WebUI secret stay in `~/.nanobot` on luffy.
- **Mac clone:** `~/Documents/Progetti_personali/nanobot`, with remotes `origin` (fork) and `upstream` (HKUDS).
- **Version policy:** the fork tracks upstream **release tags** (stable), not `main`. In Phase 5b, rebase the fork onto `v0.3.5`, the version luffy runs today, and switch `upstream-sync.yml` to merge the newest release tag.
- **Upstream sync:** `.github/workflows/upstream-sync.yml` runs every Monday at 06:00 UTC, or manually from the Actions tab. It opens a PR from `upstream-sync`, with "CONFLICTS" in the title when the auto-merge fails. One-time GitHub settings:
  - enable Actions on the fork;
  - Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests".
- **Where things happen:**
  - **Mac:** code and fast tests (Claude writes briefs, agy implements).
  - **GitHub Actions:** compile the WebUI, and publish branch `luffy` (code plus prebuilt `nanobot/web/dist`). To be added in Phase 5b.
  - **luffy:** never compiles; it only installs.
- **luffy facts (2026-10-14):**
  - nanobot v0.3.5 is installed with `uv tool` from PyPI, at `~/.local/share/uv/tools/nanobot-ai`;
  - node 24 and npm, no bun;
  - 4 cores, 3.6 GB RAM (about 1.9 GB free with Hermes running), 1.8 GB swap, 7 GB free disk.
  - Building the WebUI on luffy would be slow and swap-heavy, hence the `luffy` branch.
- **Install or update the fork on luffy** (no GitHub account needed, the repo is public):
  `NANOBOT_SKIP_WEBUI_BUILD=1 uv tool install --force "nanobot-ai @ git+https://github.com/StefanoHernandez/nanobot@luffy"`, then `nanobot gateway stop` and `nanobot gateway --background`.
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
