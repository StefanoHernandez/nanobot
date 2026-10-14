# Decisions
## ADR-001: React Native + vendored nanobot client
Native RN UI, but the protocol layer (`NanobotClient`, projection, API) is copied unmodified from nanobot WebUI by `sync-nanobot.sh`. Keeps parity with server changes; breakages are fixed in `src/platform`/`src/state`, never in vendor. Rejected: WebView wrapper (poor native feel), rewrite of the protocol (drift).
## ADR-002: No server changes
The client works against stock nanobot (bootstrap, WebSocket, REST). Any feature needing server support is out of scope or done client-side.
## ADR-003: Per-chat effort via presets
Effort is per chat, expressed as model presets named `<base>·<level>` plus the `/model` command; no new server API.
