# nanobot protocol (as used)
Source: nanobot `docs/websocket.md` at the pinned commit.
- **Bootstrap:** `GET /webui/bootstrap` returns a short-lived WS token, a REST `api_token`, and the WS URL (`publicWsUrl` if set). Local/secret-authenticated requests get tokens; trusted-proxy requests get metadata only.
- **Token TTL:** `tokenTtlS` default 300 s (30-86400). Re-bootstrap before expiry/on reconnect (`onReauth` in `NanobotClient`).
- **Connect:** `ws(s)://host:port{path}?client_id=...&token=...`. All frames are JSON text with an `event` field.
- **Server -> client:** `ready` (chat_id, client_id), `attached`, `message`, `delta`, `stream_end`, `reasoning_delta/end`, `turn_end`, tool/progress events, etc. (typed in `vendor/.../types.ts`).
- **Client -> server:** typed envelopes `new_chat`, `attach {chat_id}`, `message {chat_id, content}`; multiple chats multiplex on one socket.
- **webui_request:** envelope `{type:"webui_request", ...}` used by the client (nanobot-client.ts) for request/response calls over the socket.
- **Media:** binary attachments are uploaded over HTTP (WebUI), not in WS frames.
