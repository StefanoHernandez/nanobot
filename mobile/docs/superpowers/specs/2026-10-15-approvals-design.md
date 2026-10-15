# Approvals from the phone (design, 2026-10-15)

## User decisions
| Question | Decision |
|---|---|
| What needs approval | **Shell commands only** (tool `exec`). |
| No answer | **Denied after 5 minutes.** The bot gets "denied by the user" and goes on without it. |
| Unattended turns (cron, automations, kanban bots) | **Ask anyway**: notification, and denied on timeout. |
| Remember | **"Always allow in this chat"**, per chat, until revoked. |

## Why a wrapper, not an AgentHook
`AgentHook.before_execute_tool` runs outside the tool's `try` (`agent/tools/execution.py:166`):
- a normal hook's exception is swallowed (`hook.py:175-186`), so it can't block;
- a `_reraise` hook aborts the whole turn.

So the fork wraps the `exec` tool instead. The wrapper's `execute()` waits for the decision, then either calls the real tool or returns `ToolResult.error("denied by the user")`. To the model a refused command looks like a failed tool call, which upstream already handles.

## Server: `nanobot/ext/approvals.py` (new module)
- **`ApprovalGate`** lives in memory, one per gateway. It holds pending requests: `{id, session_key, chat_title?, tool, command, cwd, created_at, expires_at}`, each with an `asyncio.Future`.
- **`request(session_key, tool, summary) -> bool`**:
  - returns True at once if the chat is in the allow-list;
  - otherwise creates a pending request and waits up to 300 s;
  - on timeout returns False, and the request leaves the list.
- **Allow-list** `~/.nanobot/ext_approvals.json`: `{session_key: ["exec"]}`. Atomic write, 0600.
- **`ApprovingTool(inner)`** wraps a tool:
  - same name, schema and description;
  - `execute(**params)` resolves the session from `current_request_session_key()`, builds the summary (command, max 500 chars, and working dir), awaits `gate.request`, then runs the inner tool or returns the error.
- **Attach** in the existing fork hook after `AgentLoop` construction (`loop.py` `from_config`, next to `subagent_model.attach`):
  - wrap `exec` in the main registry, and in the subagent registry where `exec` exists;
  - only when `agents.defaults.approvals` is true (new config flag, **default false**, so upstream behaviour doesn't change; the app toggles it).
- **HTTP** (same auth as the other ext routes: master secret or API token, including device-minted ones, since the phone is the approver):
  - `GET /api/ext/approvals` returns the pending list and the allow-list;
  - `POST /api/ext/approvals/decide` takes `{id, allow: bool, always: bool}`. `always` adds the chat's tool to the allow-list.
  - `POST /api/ext/approvals/forget` takes `{session_key}` and removes it from the allow-list.
- **Kanban and cron** sessions use the same gate. Their session key is shown with a readable label: "Kanban · Coder", "Automazione · <name>".

## App
- **Settings → Security:** an "Approve shell commands" toggle that sets `agents.defaults.approvals`, plus the list of "Always allowed" chats with Remove.
- **Approval card**, shown over the thread or as a banner on any screen:
  - title "nanobot vuole eseguire un comando";
  - the command in monospace, then the chat;
  - buttons **Consenti**, **Nega** and **Consenti sempre in questa chat**;
  - a countdown to the auto-deny.
- **Delivery:**
  - poll `GET /api/ext/approvals` every 3 s while connected, paused in background by `usePolling`;
  - when a new request arrives and the app is in background, send a local notification "Comando da approvare", which opens the card. This only works while the process is alive, the same accepted limit as reply notifications.
- The thread already shows the running `exec` call. The card adds the decision UI; there is no protocol change and no vendor edit.

## Not now
- deletions and overwrites, big spends, installs;
- per-command allow;
- WebUI card (approvals are phone-only for now; the legacy WebUI shows only the waiting tool).

## Tests
- **Server:**
  - allow/deny/timeout via fake clock;
  - "always" persists and skips the wait;
  - forget removes it;
  - the wrapper returns an error on deny and calls the inner tool on allow;
  - flag off means `exec` is not wrapped;
  - decide requires auth.
- **App:**
  - the card renders the command, and Allow/Deny/Always post the right body;
  - the countdown expires and the card goes away;
  - the toggle sends the config path;
  - the allow-list Remove posts forget.
