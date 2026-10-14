# HANDOFF: start here (any agent, any PC)

Last updated: 2026-10-14, by Claude (Opus), at the moment the project moved into the fork.

## What this repo is
`StefanoHernandez/nanobot` is the user's **fork of HKUDS/nanobot** (MIT). It contains:
- the **nanobot server** (upstream code at the repo root, plus our future server features);
- **nanobot mobile** in `mobile/`: an Android dashboard app (React Native + Expo SDK 57) for nanobot. **The phone is a dashboard only; everything runs on the server.**

The server runs on **luffy**, an Arduino UNO Q, and is reached from the phone over **Tailscale**. The user's real host name is never written in the repo; docs use `https://myhost.example-tailnet.ts.net`.

## Read next
1. `mobile/docs/roadmap.md`: principles, phases, fork operations, app vs WebUI, ideas.
2. `mobile/docs/agy/README.md`: rules for implementers (Antigravity/agy and any coding agent).
3. `mobile/docs/agy/REVIEWER.md`: rules for the reviewer/integrator (Claude, or OpenCode/agy standing in). **Read the "Fork layout" override at its top.**
4. `mobile/docs/superpowers/specs/2026-10-13-nanobot-mobile-design.md`: the spec, the binding authority.
5. `mobile/docs/wiki/known-issues.md`: hard rules.

## Layout and branches
| Path / branch | What |
|---|---|
| `mobile/` | the app. Tests: `cd mobile && npm ci && npx jest && npx tsc --noEmit` |
| `mobile/docs/` | all app docs: spec, plans, roadmap, wiki, agy briefs, reports and reviews |
| `mobile/vendor/` | a frozen copy of the nanobot WebUI protocol code. **Never edit it.** |
| `.github/workflows/mobile-ci.yml` | app tests on every PR and push touching `mobile/`, plus a vendor drift report |
| `.github/workflows/upstream-sync.yml` | weekly: if HKUDS/nanobot published a new **release tag**, open a PR `upstream-sync/<tag>` merging it, with the app checks run on the merged tree |
| branch `main` | **the integration branch**. It replaces the old `dev` from the previous repo. |
| branch `agy/FIX-A`, `agy/FIX-B` | open fix work (see below) |

**Why `mobile/docs` and not `docs/`:** the nanobot build bundles every `docs/**/*.md` into the agent's built-in documentation skill. App docs must stay out of `docs/`.

The previous standalone repo (`~/Documents/Progetti_personali/nanobot_androidapp` on the user's Mac) is now an **archive**. Do not work there.

## Status (2026-10-14)
- **App:** Phases 1-4 done (chat, media, settings, ecosystem), and Phase 5 interactive artifacts plus document previews (P5-V1) done. 431 tests on `main`.
- **Final whole-branch review** of Phases 2-4: `mobile/docs/agy/reviews/final-review-p234.md`. Its fixes are split in two:
  - **`agy/FIX-A`** (thread, composer, core, settings). First round done; `dev`/`main` already merged in, 443 tests green. **Still to do:** `mobile/docs/agy/briefs/FIX-A-fix1.md`. Its step 1 (merge dev and resolve the FileViewer conflict) is **already done**, so start from step 2 (I13, I14, I15, M19, M21-M25, guard strength).
  - **`agy/FIX-B`** (ecosystem). First round done; dev merged in, 449 tests green. **Still to do:** `mobile/docs/agy/briefs/FIX-B-fix1.md`.
- **Fork base:** `main` = upstream release **v0.3.5** + our commits.
- **luffy** still runs **official nanobot v0.3.5** (uv tool from PyPI). The fork is not installed there yet; that starts in Phase 5b.

## Next steps, in order
1. An implementer does `FIX-A-fix1` on `agy/FIX-A` and `FIX-B-fix1` on `agy/FIX-B`. These can run in parallel in two worktrees.
2. The reviewer reviews both (REVIEWER.md §4), merges them into `main` (§5), and runs the tests.
3. The reviewer builds the **phone-test APK** (§7); the user tests on the phone. Device bugs become fix briefs.
4. Phase 5 leftovers (REVIEWER.md §3b): P5-S1 share-to-nanobot, P5-O1 offline outbox, P5-T1 read-aloud, P5-W1 widget/tile. Then the final APK.
5. **Claude only (needs design):**
   - **Phase 5b** QR device pairing: fork server plus app.
   - **Done 2026-10-14:** the fork `main` is based on release `v0.3.5`, the same version luffy runs, and `upstream-sync.yml` tracks release tags.
   - **Before 5b:** add the `build-luffy` workflow (prebuilt WebUI on branch `luffy`).
   - Then Phase 6 hybrid memory, and Phase 7 multi-bot kanban.

## Resuming on a new PC
1. `git clone https://github.com/StefanoHernandez/nanobot.git && cd nanobot`
2. `git fetch origin && git branch -a`: you should see `main`, `agy/FIX-A` and `agy/FIX-B`.
3. **App:** `cd mobile && npm ci && npx jest`. Node 20+ is needed.
4. **Worktrees for parallel agents** (one per implementer), created from the repo root:
   ```bash
   git worktree add ../nanobot-agy agy/FIX-A
   git worktree add ../nanobot-agy3 agy/FIX-B
   ```
   Then run `npm ci` in each worktree's `mobile/`.
5. **Building the APK** needs a local Android toolchain in `mobile/.toolchain/` (git-ignored, read by `mobile/env.sh`): a JDK 17 at `jdk/Contents/Home` (on Linux, adapt `env.sh`), the Android SDK in `android/`, plus `android-user/` and `gradle/` dirs. Install it with Android Studio or the command-line tools and point `env.sh` at it. Then `cd mobile && bash scripts/build-apk.sh` produces `mobile/dist/*.apk`.
6. **One PC at a time.** `git pull` before starting and `git push` when done, including the `agy/*` branches you worked on.

## How to restart each agent
- **Claude Code:** open the repo root and say: *"Leggi mobile/docs/HANDOFF.md e riprendi da 'Next steps'."*
- **Reviewer stand-in (OpenCode/agy):** use the message in REVIEWER.md, with the paths from its "Fork layout" override.
- **Implementer (agy):** *"Leggi mobile/docs/agy/README.md, poi esegui mobile/docs/agy/briefs/<TASK>.md sul branch agy/<TASK> nella cartella <worktree>."*

## Working agreements with the user (Stefano), for any Claude session
- **Language:** reply in **Italian**, short and direct. Code, commits and docs are in English.
- **Roles:**
  - Claude designs, writes briefs (`mobile/docs/agy/briefs/`), **reviews and merges only when the user asks**, and handles everything fork- or server-side.
  - **Antigravity (agy)** implements, often 2-3 instances in parallel, each in its own git worktree. The user relays the messages.
  - When Claude is away, OpenCode or agy acts as reviewer, per `mobile/docs/agy/REVIEWER.md`.
- **Budget:** the user's Claude plan is limited. Prefer cheap subagents (Sonnet; Haiku for trivial work) for reviews and research, keep the main thread lean, and don't dispatch implementers when agy can do it.
- **Phone tests:** build an APK only at about 90% of a phase, or when the user asks. Never zip it.
- **The phone is a dashboard only.** Never propose features where the agent drives the phone (camera, SMS, contacts, notifications).
- **Fork:** new server features go in separate modules (MCP face for agents + HTTP/WS face for the app, one SQLite DB) with thin hooks into upstream files. Track release tags.
- **Python** (fork/server work): always use a project `.venv`, never global installs, and update `pyproject.toml` when dependencies change.
- **Before ending a task:** note blockers for the next agent in this file or in the relevant report.
- **Confirm first:** force pushes, deleting branches, and anything that runs on luffy. The user runs luffy commands themselves.

## Never
- Never commit secrets: the nanobot secret, tokens, `~/.nanobot` contents, or the real Tailscale host.
- Never edit `mobile/vendor/**`.
- Never force-push without the user's explicit OK.
- Keep server additions in new modules with thin hooks into upstream files, so upstream merges stay easy.

## Known flakiness
Under heavy CPU load, a few UI tests (voice/subagents, ecosystem drawer, artifacts size routing) can fail once and pass on rerun. Re-run them before treating a failure as real.
