# Claude review of the OpenCode/Argon session (2026-10-14)

Scope: everything merged into `main` after `d6615290` (FIX-A-fix1, FIX-B-fix1, P5-S1, P5-O1, P5-T1, P5-W1) plus Argon's roadmap guardrails and the 5b/6/7 plan and briefs.

## Process
- All six branches were merged with **no written review** (no verdicts, no fix2 briefs, no handoff). REVIEWER.md §4 requires one per task. Green tests hid real bugs.
- The 5b/6/7 plan and briefs were written although those phases are Claude-only (needs design). They are **frozen**: do not hand them to agy.

## Code fixes applied by Claude (branch `claude/fix-p5`)
| Commit | Fix |
|---|---|
| `dd6082d4` | **P5-O1:** the outbox waits for the post-reconnect hydrate (`ThreadSlice.hydrating`). It dequeues only after `send()` accepts, so a refused send stays queued (paused) instead of being lost. Send-now unpauses the whole chat queue. |
| `2baa162e` | **P5-S1:** a shared file is accepted only if it is a direct child of the app cache dir, where expo-share-intent copies content:// shares. This rejects raw `file://` paths to private files. |
| `e6fed993` | **P5-W1:** the widget is a launcher only. **Ruling:** no connection status, because nothing wired it and it would go stale once Android kills the app. The tile gets an icon and an i18n label via resources, and `unlockAndRun`. The intents are restricted to our package. |
| `f3e0167c` | **P5-T1:** auto-read is bound to the dictated chat's turn end and reads all answer segments once. Speech stops on chat leave. Markdown stripping keeps "C#", "snake_case" and "2*3". |
| (last) | **M23:** non-field provider-save errors show the server message, per spec. **M24:** the catalogue cache gets a generation guard across a profile switch. **I6:** `oauth_cancel` after 3 poll errors. |

## Parked (not fixed)
- **I8:** the automation `at`/`every` input is free text with English units and a UTC ISO display. A proper picker is still needed.
- **I15:** a toast fired just before a Sheet/Dialog mounts is not shown in the top layer. The I15 test does not exercise the newest-host logic.
- **P5-O1:** the queue flushes only for the chat on screen. Other chats' queues send when opened.
- **P5-W1:** `/new-chat` on a warm start while offline drops the intent and goes to `/`.
- **P5-S1:** a second share while the picker is open overwrites the first. There is no size check at share time.
- Not verified on a device: widget/tile rendering, Kotlin compile, the manifest merge, expo-speech voices, and a single-file share through expo-share-intent.

## Argon's 5b/6/7 plan: verdict
- **Keep:** gateway in-process tools via `entry_points(group="nanobot.tools")` plus an HTTP face (RAM on luffy). This **replaces the "MCP face" principle**. An MCP endpoint can be added later from the same process if an external agent needs it (Claude recommendation; user to confirm). Keep also: `MEMORY.md` owned by Dream, hop limit in the bot group chat, and worktrees per parallel bot.
- **Must change before use:**
  - **5b:** the QR must be shown by the **fork WebUI** (user's option B). In the plan, it is shown by an already-paired phone.
  - **5b:** decide device-token powers. Today a paired phone can pair and revoke other devices, and a device token works even with no secret set.
  - The plan references `RuntimeContextProvider`, which does not exist (only `RuntimeContextBlock`).
  - S1 and M1 are not independent: the API contract must be fixed before running them in parallel.
