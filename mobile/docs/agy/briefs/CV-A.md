# CV-A: what the app covers of the upstream WebUI (owner: Cursor)

Branch `agy/CV-A`, from `origin/main`, **in your own worktree** (`../nanobot-agy-cv-a`). **One new doc only**: `mobile/docs/webui-coverage.md`. No code. Other tasks run in parallel (RT-A, KB-C, DOC-A); do not touch their files.

## Why
The gateway serves the app's web export instead of the upstream WebUI, with the legacy WebUI as fallback (`NANOBOT_APP_DIST`, `nanobot/channels/manager.py`). Upstream keeps adding screens and settings. Before we ever remove the fallback we need a list of what the app does not cover yet, kept up to date at each upstream sync.

## What to produce
`mobile/docs/webui-coverage.md`, a table per area. Source of truth for upstream: `webui/src/` on `main` (it equals upstream's after the last sync). App: `mobile/src/screens/**`, `mobile/app/**`.

For each upstream screen, panel or settings section (start from `webui/src/components/**` folders and the settings page sections), one row:
| Upstream feature | Upstream file | App screen / file | Status | Notes |
Status is one of: **covered**, **partial** (say what is missing), **missing**, **app-only better** (the app does it differently on purpose), **not needed on phone** (say why).

Areas at least: chat and composer (attachments incl. video, slash and bang commands, mentions, Ctrl+K search), sidebar and topics (rename, archive, batch actions), settings (each section: models/providers incl. shared proxy, runtime config, network, appearance, channels, MCP incl. OAuth and proxy, CLI apps, skills, plugins/features, security, pairing, updates), activity/subtasks/goals, file previews (Markdown, Mermaid), cron/automations, TUI-only features (mark "not needed on phone").

At the top: the upstream commit you read (`mobile/vendor/nanobot/VERSION`), the date, and a 5-line summary: counts per status and the 5 most important gaps to close before removing the fallback, in your judgement, with one reason each.

Check by reading code, not by guessing from names: open the app screen before marking "covered". When unsure, mark "partial" and say what you could not verify.

## Do not
- Touch any other file.

## Report
`mobile/docs/agy/reports/CV-A.md`: how you built the list, rows you are unsure about.

Commit (no `Co-Authored-By`), push `agy/CV-A`, give the last hash. Do not merge.
