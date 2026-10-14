# P5b-S1: Prebuilt `luffy` branch workflow and Server QR Device Pairing (owner: agy)

This is Phase 5b (Server + CI). Read `mobile/docs/HANDOFF.md`, `mobile/docs/roadmap.md`, and `mobile/docs/superpowers/plans/2026-10-14-nanobot-phases-5b-6-7.md` first.

- **Branch:** `agy/P5b-S1`, created from `main`.
- **Worktree:** `nanobot-agy`.

## Context
1. **luffy CI build (`.github/workflows/build-luffy.yml`):** luffy (Arduino UNO Q) has 3.6 GB RAM and should never compile the WebUI locally. Whenever `main` is updated on `StefanoHernandez/nanobot`, GitHub Actions builds `webui/` (`nanobot/web/dist`) and publishes the commit with prebuilt `nanobot/web/dist` to the `luffy` branch.
2. **Revocable QR Device Pairing (`nanobot/ext/pairing.py`):** Instead of typing the master WebUI secret on the phone, the user can generate a 5-minute one-time pairing code (shown as a QR code containing `{ v: 1, url, code }`). The phone claims the code at `POST /api/devices/claim` and receives its own opaque `device_token` (`nbdev_<random>`), while the server stores only `sha256(device_token)` on disk (`~/.nanobot/devices.json`, atomic write). `/webui/bootstrap` and `/api/token` accept a valid `device_token` alongside the master secret, updating `last_seen_at` and surviving gateway restarts. Revoking a device deletes its record so its next request immediately fails with `401`.

Read these files first:
- `.github/workflows/upstream-sync.yml`
- `nanobot/webui/ws_http.py` (lines 450–745)
- `nanobot/webui/http_utils.py` (lines 305–324)

## What to build

**Files to create or modify (touch nothing in `mobile/`):**
- Create `.github/workflows/build-luffy.yml`
- Create `nanobot/ext/__init__.py`
- Create `nanobot/ext/pairing.py`
- Modify `nanobot/webui/ws_http.py` (thin hook only)
- Create `tests/test_device_pairing.py`

### 1. `.github/workflows/build-luffy.yml`
- Triggers: `push` to `main` and `workflow_dispatch`.
- Guard on job: `if: github.repository == 'StefanoHernandez/nanobot'`.
- Steps on `ubuntu-latest` (`permissions: contents: write`):
  1. `actions/checkout@v4` with `fetch-depth: 0`.
  2. `oven-sh/setup-bun@v2`.
  3. Build WebUI: `cd webui && bun install --frozen-lockfile && bun run build` (outputs to `nanobot/web/dist`).
  4. Commit `nanobot/web/dist` (`git add -f nanobot/web/dist`) on a detached HEAD if changed (`git commit -m "chore(build): bundle prebuilt WebUI for luffy"`), and force-push to `origin HEAD:refs/heads/luffy`.

### 2. `nanobot/ext/pairing.py`
Implement `DeviceRegistry`:
- Storage path: `get_data_path() / "devices.json"` (using `nanobot.config.paths` or `Path.home() / ".nanobot" / "devices.json"`, configurable in constructor for tests), written atomically via `.tmp` + `os.replace` with `0o600` permissions.
- Data structures:
  - Pending codes (in-memory dict): `code -> PendingCode(code, expires_at_ms, attempts)`.
    - Code format: `XXXX-XXXX` using unambiguous uppercase alphanumeric characters (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`).
    - TTL: `300` seconds (`expires_at_ms = int(time.time() * 1000) + 300_000`).
    - Max 5 active pending codes at once (oldest evicted or 429).
  - Registered devices (persisted in `devices.json`):
    - `id`: `dev_<12 hex chars>`
    - `name`: sanitized string (1–64 chars, default `"Android"`)
    - `token_hash`: `hashlib.sha256(raw_token.encode("utf-8")).hexdigest()`
    - `created_at_ms`: int
    - `last_seen_at_ms`: int
- Methods on `DeviceRegistry`:
  - `create_code(ttl_s: int = 300) -> dict[str, Any]`: returns `{"code": code, "expires_in": ttl_s, "expires_at_ms": expires_at_ms}`.
  - `claim_code(code: str, device_name: str = "nanobot mobile") -> dict[str, Any] | None`:
    - Normalizes `code.strip().upper()`.
    - Rate-limit/brute-force protection: if invalid, increments failed claim counter; after 5 failed claims across active codes, clears all active pending codes!
    - If valid and not expired: pops the code (one-time use!), generates `raw_token = f"nbdev_{secrets.token_urlsafe(32)}"`, stores device with `token_hash` on disk, and returns `{"device_id": dev_id, "device_token": raw_token, "name": name, "created_at_ms": now_ms}`.
  - `validate_token(raw_token: str | None) -> bool`:
    - Returns `False` if not `raw_token` or not `raw_token.startswith("nbdev_")`.
    - Computes `sha256`, compares against persisted devices on disk using `hmac.compare_digest` (re-reading disk if file `mtime` changed so revocation is instant).
    - If matched, updates `last_seen_at_ms` (persisting to disk at most once every 60 s) and returns `True`.
  - `validate_headers(headers: Any) -> bool`:
    - Extracts token from `Authorization: Bearer <token>` or `X-Nanobot-Auth: <token>` and calls `validate_token`.
  - `list_devices() -> list[dict[str, Any]]`:
    - Returns `[{"id": d["id"], "name": d["name"], "created_at_ms": d["created_at_ms"], "last_seen_at_ms": d["last_seen_at_ms"]}]` (never includes `token_hash`).
  - `revoke_device(device_id: str) -> bool`:
    - Removes `device_id` from disk and returns `True` if found, `False` otherwise.
- Also provide HTTP handler function `dispatch_device_routes(request: WsRequest, got: str, *, registry: DeviceRegistry, check_api_token: Callable[[WsRequest], bool], parse_body: Callable[[WsRequest], dict[str, Any]]) -> Response | None` handling:
  - `GET /api/devices` (requires `check_api_token`): returns `{"devices": registry.list_devices()}`.
  - `POST /api/devices/pair` (requires `check_api_token`): returns `registry.create_code()`.
  - `POST /api/devices/revoke` (requires `check_api_token`): body `{"id": "..."}`, calls `registry.revoke_device(id)`, returns `{"ok": True, "devices": registry.list_devices()}` (or 404).
  - `POST /api/devices/claim` (public, no `check_api_token` needed because it authenticates via the one-time `code`): body `{"code": "...", "name": "..."}`, returns 200 with `{ device_id, device_token, name, created_at_ms }` or 401 `{"error": "invalid_or_expired_code"}`.

### 3. Thin hook in `nanobot/webui/ws_http.py`
- Instantiate `self.device_registry = DeviceRegistry()` on `GatewayHTTPHandler`.
- In `_handle_bootstrap` and `_handle_token_issue`:
  - Where `_issue_route_secret_matches(request.headers, secret)` is checked, also allow `self.device_registry.validate_headers(request.headers)`.
  - Even if `secret` is empty (localhost-only mode), a request with `self.device_registry.validate_headers(request.headers)` is authenticated and allowed to bootstrap with `api_token_allowed = True`!
- Register WebUI mutations in `_WEBUI_MUTATION_PATHS`:
  - `"devices.pair": "/api/devices/pair"`
  - `"devices.revoke": "/api/devices/revoke"`
  and include `/api/devices/pair` and `/api/devices/revoke` in `_is_webui_mutation_path` (while keeping `POST /api/devices/claim` as a direct HTTP POST route so an unpaired phone can call it before opening a WebSocket!).

## Tests (write first in `tests/test_device_pairing.py`)
1. `create_code` + `claim_code` happy path: returns `nbdev_...` token, persists only SHA-256 hash in `devices.json` (raw token does not appear anywhere in the file), and a second `claim_code` with the same code returns `None`.
2. Expired code (`ttl_s=-1`) cannot be claimed.
3. Brute-force protection: 5 wrong claim attempts invalidate active codes so the real code can no longer be claimed.
4. `validate_token` and `validate_headers`: returns `True` for a valid `nbdev_...` token in `Authorization: Bearer` or `X-Nanobot-Auth`, survives a fresh `DeviceRegistry(path)` instance (simulating gateway restart on luffy), and returns `False` immediately after `revoke_device(device_id)`.
5. Gateway HTTP integration: `POST /api/devices/claim` exchanges a valid code for a `device_token`, and `GET /webui/bootstrap` with `Authorization: Bearer <device_token>` returns 200 with `token` and `api_token` even when the master secret is different; after `revoke_device`, `GET /webui/bootstrap` with that `device_token` returns 401.

## Done when
- `pytest tests/test_device_pairing.py -v` and `ruff check nanobot/ext/ nanobot/webui/ws_http.py` pass with 0 errors.
- Committed on `agy/P5b-S1` as `feat(pairing): add revocable QR device pairing and build-luffy workflow`, with report in `mobile/docs/agy/reports/P5b-S1.md`.
