# Reviewer handbook (agent acting as reviewer while Claude is away: OpenCode or agy)

> **Fork layout override (2026-10-14).** The project now lives in the fork `StefanoHernandez/nanobot`. Read `mobile/docs/HANDOFF.md` first. Wherever this file says:
> - "main repo `nanobot_androidapp`", read **the fork's root folder**;
> - "`dev`", read **`main`**;
> - "`nanobot_androidapp-agyN`", read the worktree `../nanobot-agyN`, created per HANDOFF.md;
> - "`docs/...`", read **`mobile/docs/...`**.
>
> The app is in `mobile/`, and tests run in `mobile/`. Build the APK with `cd mobile && bash scripts/build-apk.sh`; the toolchain is in `mobile/.toolchain`.


You temporarily replace Claude as **reviewer, brief writer and integrator** for nanobot mobile. Other agent instances (Antigravity/agy) implement; you review, write fix briefs, and merge into `dev`. You do not implement features yourself, except for trivial merge-conflict resolution.

## 1. Read first, in this order
1. `mobile/docs/agy/README.md`: the implementer rules (yours too).
2. `mobile/docs/roadmap.md`: principles, phases, fork operations, app vs WebUI.
3. `mobile/docs/superpowers/specs/2026-10-13-nanobot-mobile-design.md`: the spec, the binding authority.
4. `mobile/docs/wiki/known-issues.md`: the hard rules learned the hard way.
5. `mobile/docs/agy/reviews/final-review-p234.md`: the last whole-branch review. Its findings are being fixed now.

## 2. Repos and folders (all on the Mac)
| Folder | What | Branch |
|---|---|---|
| `nanobot_androidapp` | **Main repo. Only the reviewer works here.** Integration branch `dev`. | `dev` |
| `nanobot_androidapp-agy` | implementer #1 worktree | `agy/FIX-A` |
| `nanobot_androidapp-agy2` | implementer #2 worktree | free (last: `agy/P5-V1`, merged) |
| `nanobot_androidapp-agy3` | implementer #3 worktree | `agy/FIX-B` |
| `nanobot` | the user's nanobot **fork** (server). Not used until Phase 5b. | `main` |

Rules:
- **Never push** anything unless the user explicitly asks.
- **Never touch `main`.**
- **Never edit `mobile/vendor/**`.**
- Never modify the nanobot server from the app repo.

## 3. Current state (2026-10-14)
- **`dev`:** Phases 1-4 done, and P5-V1 (interactive artifacts plus document previews) merged. 431 tests green.
- **In progress:**
  - `agy/FIX-A` (`mobile/docs/agy/briefs/FIX-A.md`): thread, composer, settings and security fixes, I1-I4, I12-I15 and minors.
  - `agy/FIX-B` (`mobile/docs/agy/briefs/FIX-B.md`): ecosystem fixes, I5-I11 and minors.
- **Known merge conflict:** FIX-A touches `FileViewer.tsx` and `app/viewer.tsx` (the I12 URI guard), and P5-V1 rewrote FileViewer. Keep both: P5-V1's artifact routing **plus** FIX-A's early `isViewerUriAllowed` guard.
- **Next, after FIX-A and FIX-B are merged:**
  1. Build the phone-test APK (§7), and give it to the user for the ~90% device test.
  2. Collect the device bugs, then write fix briefs.
  3. Phase 5 leftovers: share-to-nanobot (Android share intent), offline outbox, read-aloud replies (expo-speech), widget, quick-settings tile. Write one brief per feature, using `mobile/docs/agy/briefs/P4-U2.md` as a style model.
  4. Phase 5b (QR device pairing) needs the fork. Leave it for Claude unless the user insists.

## 3b. Your mission while Claude is away (user request, 2026-10-14)
**Finish everything before the fork (Phases 4 and 5), then hand the user an APK to test.** Order:
1. Review and merge FIX-A and FIX-B (§4, §5).
2. Build APK #1 (§7) and give it to the user for the device test. Bugs the user reports become fix briefs.
3. Write briefs for, and get implemented, the Phase 5 leftovers, one task each, parallel where files don't overlap:
   - **P5-S1, share to nanobot:** an Android share intent (`expo-share-intent` or an intent filter via config plugin). Text, links, images and files open the app on a chat picker with the composer pre-filled; pressing Send is required.
   - **P5-O1, offline outbox:** messages typed while disconnected are queued in MMKV per chat, shown as "In attesa" / "Pending", and sent in order on reconnect. Each has a cancel action. They never auto-send after a profile switch.
   - **P5-T1, read aloud:** an `expo-speech` button on finished assistant messages, using the app language, with stop. Optionally auto-read when a voice-dictated message gets its reply (toggle in Appearance settings).
   - **P5-W1, home widget and quick-settings tile:** the widget shows connection status and opens a new chat; the tile opens the app on a new chat. Use an Expo config plugin plus a small Kotlin module. Keep it minimal, and drop the tile if it becomes complex (record that as a ruling).
4. Build the final APK (§7), and write the handoff (§9).

Do NOT start Phase 5b, 6 or 7: they need the fork, which Claude handles.

## 3c. luffy (Arduino UNO Q) quick reference: tell the user when they ask
These are run by the user over SSH on luffy. Never run them yourself.
- **nanobot ON, Hermes OFF:**
  ```bash
  pkill -f hermes
  nanobot gateway --background
  sudo tailscale serve --bg 8765
  tailscale serve status        # must show https://myhost.example-tailnet.ts.net -> 127.0.0.1:8765
  ```
- **Hermes ON, nanobot OFF:**
  ```bash
  nanobot gateway stop
  nohup hermes dashboard --no-open > ~/hermes-dashboard.log 2>&1 &
  sudo tailscale serve --bg 9119
  tailscale serve status        # must show -> 127.0.0.1:9119
  ```
- **Tailscale:**
  - `tailscale serve --bg <port>` publishes a local port on `https://myhost.example-tailnet.ts.net`, reachable only inside the tailnet (the phone needs the Tailscale app connected).
  - One port at a time on `/`. If the old port still shows, run `sudo tailscale serve reset`, then serve again.
  - `tailscale status` lists the devices. If the app says "Non raggiungibile", first check that Tailscale is ON on the phone.
- **nanobot status and logs:**
  - `nanobot gateway status`
  - `tail -50 ~/.nanobot/logs/gateway.log`

## 4. Review procedure (per task)
When the user pastes an implementer's completion message:
1. **Package the diff**, from the main repo:
   ```bash
   B=$(git merge-base dev agy/<TASK>)
   git log --oneline $B..agy/<TASK>
   git diff --stat $B agy/<TASK>
   git diff -U8 $B agy/<TASK> -- . ':!mobile/package-lock.json' > /tmp/review-<TASK>.diff
   ```
2. **Run the checks in the implementer's worktree** (it is on that branch):
   ```bash
   cd ../nanobot_androidapp-agyN/mobile && npx jest && npx tsc --noEmit
   ```
   Also look for skipped tests: `grep -rn "\.skip\|xit(\|xdescribe\|it.todo" mobile/test`.
3. **Spec compliance.** Open the brief and go through it **item by item**. For each item, find the code that implements it (file:line). "The tests pass" is NOT evidence. Read the code.
4. **Test quality.** For each important behaviour, ask whether the test would fail if the code were wrong.
   - Tests that mock the very hook or function under test prove nothing about integration. Real example: the MCP OAuth test mocked `authUrl` as already present, while the real code never called `start()`.
   - Require at least one test per task that exercises the real logic.
5. **Hard-rule checklist.** Any violation is at least Important:
   - No `client.onChat` subscriber outside `mobile/src/state/threadStore.ts` (the vendor flushes its replay buffer into the first subscriber).
   - No `console.*` with URLs, tokens, secrets, QR/auth/callback/media URLs or pairing codes. Media URLs are capability URLs.
   - Secrets are write-only: shown as "Saved"/hint, untouched means omitted from the payload, cleared means `null` behind a confirm.
   - Settings and ecosystem mutations are **wire snake_case**, sent raw through `useSettings().mutate`.
   - Installs and `feature.enable`: check `installGate` first, then 150 s via `longMutation`. A 403 shows the policy message with no retry; a 504 refetches.
   - Every host-affecting or destructive action goes behind a confirm `Dialog`.
   - Exclusions: no `remote.*`, no custom/import MCP, no `skill.delete`, no `api_service`, no editing of `tools.webui_allow_remote_package_install`.
   - i18n keys exist in **both** `mobile/src/i18n/it.json` and `en.json`, with no hard-coded user-visible strings.
   - Theme tokens only (no `#fff`); touch targets ≥ 48 dp; safe area; KeyboardAvoidingView `behavior="padding"` (Expo SDK 57 edge-to-edge).
   - Async state: no setState after unmount or after a profile switch (session or gen guards); no duplicate polling; pause in background via AppState.
   - Shared UI kit edits (`Sheet`, `IconButton`, `Button`, `TextField`, `Dialog`): check **every** caller for regressions.
   - Route params never carry secrets or file contents.
6. **Integration thinking.** Ask what else in the app uses what this task changed:
   - `grep -rn "<ChangedFunction>" mobile/src mobile/app`;
   - the Composer (attachments, mentions, voice, slash menu, context indicator coexist);
   - profile switch, reconnect, background/foreground.
7. **Conflicts:** `git merge-tree --write-tree dev agy/<TASK>`, and list the conflicting files.
8. **Verdict:**
   - **Approved** → merge (§5).
   - **Changes needed** → write `mobile/docs/agy/briefs/<TASK>-fixN.md`. List each finding as Critical, Important or Minor, with file:line, the concrete failure scenario, the expected fix, and the test that must be added. Commit it on `dev`, then give the user the command for the implementer (§6).
   - **Re-review after a fix round:** check only the listed items plus anything new in the fix diff (`git diff <previous-commit> agy/<TASK>`).

Severity guide:
- **Critical:** security hole, data loss, crash, or a feature that cannot work in the real app.
- **Important:** a spec requirement missing, or a real user-facing bug.
- **Minor:** polish. Minors can be parked in `.superpowers/sdd/2026-10-13-nanobot-mobile-phase4/progress.md` with one line each.

## 5. Merging into `dev`
From the main repo:
```bash
git merge --no-ff agy/<TASK> -m "merge agy/<TASK>: <short title>"
cd mobile && npx tsc --noEmit && npx jest
```
- **i18n conflicts** (`it.json`/`en.json`) are key unions. Take both sides' keys: load `git show :2:<file>` and `git show :3:<file>` as JSON, deep-merge them, write the result with 2-space indent, then `git add`. Never drop keys.
- **Code conflicts:** keep both behaviours, then re-run the tests.
- Commit messages end with a blank line and a `Co-Authored-By:` line naming your tool and model (e.g. `Co-Authored-By: OpenCode <noreply@opencode.ai>`). Never push.
- If the merged tests fail, fix the merge itself, or `git merge --abort` and send a fix brief instead.

## 6. Preparing an implementer for the next task
From the main repo (`N` = the worktree number):
```bash
cd ../nanobot_androidapp-agyN && git status --short   # must be clean
git checkout -q -B agy/<NEXT> dev && cd mobile && npm ci
```
Then give the user this message for that implementer:
> Esegui il task mobile/docs/agy/briefs/<NEXT>.md sul branch agy/<NEXT> (sei già su quel branch nella cartella nanobot_androidapp-agyN, dipendenze già installate). Segui mobile/docs/agy/README.md. Lavora SOLO in questa cartella. Alla fine: npx jest e npx tsc --noEmit verdi, commit con il messaggio indicato nel brief e report in mobile/docs/agy/reports/<NEXT>.md.

Fix rounds use the absolute path of the brief in the main repo, because the implementer's branch may not contain it yet.

**Parallel tasks** must not edit the same files, except the i18n JSON, which merges as a union. Check this before dispatching two at once.

## 7. Building the phone-test APK
From the main repo, on `dev` after the merges:
```bash
cd mobile && bash scripts/build-apk.sh
```
- Output: `mobile/dist/nanobot-mobile-<version>.apk` (arm64, ~36 MB).
- It needs `.toolchain/`, which is present in the main repo; the worktrees only have a symlink to it.
- Do not zip it. The user copies it to the phone themselves.

## 8. Things you must NOT do
- Do not approve because "tests pass". Verify each brief item in the code.
- Do not rewrite an implementer's work yourself. Send a fix brief. Exception: trivial merge-conflict resolution.
- Do not start Phase 5b, 6 or 7 (fork, memory, kanban) without Claude, unless the user explicitly asks.
- Never echo or log the user's nanobot secret, tokens or Tailscale URLs with credentials.
- Never install dependencies globally. Python work in the fork uses a `.venv`.

## 9. Hand back to Claude
When Claude is back, write a short summary in `mobile/docs/agy/reviews/handoff-<date>.md`:
- tasks reviewed;
- verdicts;
- merges with commit hashes;
- open fix briefs;
- parked minors;
- anything surprising.
