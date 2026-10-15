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
| `.github/workflows/upstream-sync.yml` | weekly: merge HKUDS/nanobot **`main`** into PR `upstream-sync/main`, re-sync `mobile/vendor/` to the same commit, run the app checks |
| `.github/workflows/build-arduino.yml` | on every push to `main`: build the WebUI and force-publish branch `arduino` (prebuilt, what the server installs) |
| branch `main` | **the integration branch**. It replaces the old `dev` from the previous repo. |
| branch `agy/FIX-A`, `agy/FIX-B` | open fix work (see below) |

**Why `mobile/docs` and not `docs/`:** the nanobot build bundles every `docs/**/*.md` into the agent's built-in documentation skill. App docs must stay out of `docs/`.

The previous standalone repo (`~/Documents/Progetti_personali/nanobot_androidapp` on the user's Mac) is now an **archive**. Do not work there.

## Status (2026-10-14, evening)
- **App:** Phases 1-5 app work done on `main`: FIX-A/B, P5-V1, P5-S1 share, P5-O1 outbox, P5-T1 read-aloud, P5-W1 widget/tile. 501 tests.
- **Merged `claude/fix-p5`** (507 tests): Claude's fixes after reviewing the OpenCode/Argon session. See `mobile/docs/agy/reviews/claude-review-2026-10-14.md`.
- **Briefs P5b-*, P6-*, P7-*** (written by Argon) are **frozen**. Phase 5b needs a design pass with Claude first; see the review.
- **Fork base:** `main` = upstream **`main` @ `cd2a8637`** (same commit as `mobile/vendor/`) + our commits. Changed from v0.3.5 on 2026-10-14: on v0.3.5, old chats opened empty (protocol mismatch).
- **Server "arduino"** (nickname luffy): runs official v0.3.5 until the user installs branch `arduino` (command in roadmap "Fork operations").
- **Device test 2026-10-14 bugs: fixed** in `3c7f90ea` (APK #2): model picker on the header badge (`/model`), SVG via react-native-svg, "Audio replies" toggle (off by default), speech stops on blur and reads long answers in chunks, history load error + Retry. Old chats empty = server on v0.3.5: fixed by installing branch `arduino` (user does it).
- **UI redesign "Compagno" complete**, plus the parked minors (agy M-A, M-B), on branch `claude/redesign-companion`: 547 tests, APK #5 universal from `a5b69269`. Spec: `mobile/docs/design/companion.md`. Claude review fixes are in `48395c00` and `a5b69269`. A local emulator is available: `mobile/scripts/emulator.sh`. **Next:** the user tests APK #5 (phone or emulator), then merge the branch into `main`; the red `mobile-ci` log; release hygiene (versionCode, own signing key); then Phase 5b design.
- **Projects (2026-10-15, in progress)** on branch `claude/projects`, built on top of the redesign. Spec: `mobile/docs/superpowers/specs/2026-10-15-projects-design.md`. The server module `nanobot/ext/projects.py` is done: 27 tests, with two one-line hooks in `ws_http.py` and `websocket/runtime.py`. agy briefs: `P-A` (projects screens, `../nanobot-agy`) and `F-A` (chat "Media e file", `../nanobot-agy3`). Python work on this PC uses the project `.venv` (`uv`); `tests/webui/test_remote_pairing.py::test_server_appends_restricted_key...` and the Matrix channel test fail locally only (env).
- **This Linux PC:** worktrees `../nanobot-agy` and `../nanobot-agy3`. Run jest with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` (2 tests assume en-US number format).

## Next steps, in order
1. ~~Merge `claude/fix-p5`~~ done (`764a772b`).
2. Build the **phone-test APK** (REVIEWER.md §7), once the Android toolchain is set up on this PC. The user tests on the phone, and device bugs become fix briefs.
3. Parked minors from the review (I8 picker, I15 toast race) as one agy brief.
4. **Claude only:** design Phase 5b (QR shown in the fork WebUI, device-token powers), then Phases 6 and 7, starting from Argon's frozen plan.

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
- **Fork:** new server features go in separate modules (MCP face for agents + HTTP/WS face for the app, one SQLite DB) with thin hooks into upstream files. Track upstream `main`; `mobile/vendor/` = same upstream commit (CI enforces it).
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
- **GitHub `mobile-ci` fails on almost every push since 2026-10-14** (jest step; 8/9 runs), while the same suite passes locally, also with `TZ=UTC --maxWorkers=2`. The failing test is unknown: the job log needs a GitHub login (`gh` is not installed on this PC). Next: read the log, then fix or de-flake. Until then, a red mobile-ci is not proof of a regression.
