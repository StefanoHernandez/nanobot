"""Paired phones: one-time codes, revocable device tokens, bootstrap access."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import secrets
import tempfile
import threading
import time
import weakref
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any, cast

from aiohttp import web
from websockets.http11 import Request as WsRequest
from websockets.http11 import Response

from nanobot.webui.http_utils import (
    bearer_token,
    case_insensitive_header,
    http_error,
    http_json_response,
    issue_route_secret_matches,
    safe_host_header,
)

PREFIX = "/api/ext/devices"
LAST_SEEN_RESOLUTION_S = 60
CODE_TTL_S = 300
MAX_UNUSED_CODES = 5
MAX_DEVICES = 20
MAX_NAME_LEN = 40
MAX_JSON_BODY_BYTES = 1024 * 1024

_lock = threading.Lock()


class DeviceError(Exception):
    def __init__(self, status: int, code: str) -> None:
        super().__init__(code)
        self.status = status
        self.code = code


def devices_file_path() -> Path:
    raw = os.environ.get("NANOBOT_DEVICES_FILE", "").strip()
    if raw:
        return Path(raw).expanduser()
    return Path.home() / ".nanobot" / "devices.json"


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _auth_token(headers: Any) -> str | None:
    value = bearer_token(headers)
    if value is not None:
        return value
    header_token = headers.get("X-Nanobot-Auth") or headers.get("x-nanobot-auth")
    if header_token:
        return header_token.strip() or None
    return None


def admin_authorized(secret: str, tokens: Any, request: Any) -> bool:
    if secret and issue_route_secret_matches(request.headers, secret):
        return True
    return bool(tokens.check_api_token(request))


def _validate_name(raw: Any) -> str:
    if not isinstance(raw, str):
        raise DeviceError(400, "invalid_name")
    name = raw.strip()
    if not name or len(name) > MAX_NAME_LEN:
        raise DeviceError(400, "invalid_name")
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in name):
        raise DeviceError(400, "invalid_name")
    return name


def _request_origin(headers: Any) -> str:
    raw_host = case_insensitive_header(headers, "Host").split(",", 1)[0]
    host = safe_host_header(raw_host)
    if not host:
        raise DeviceError(400, "missing_host")
    proto = case_insensitive_header(headers, "X-Forwarded-Proto")
    proto = proto.split(",", 1)[0].strip().lower()
    scheme = "https" if proto in {"https", "wss"} else "http"
    return f"{scheme}://{host}"


def _empty_state() -> dict[str, Any]:
    return {"codes": [], "devices": []}


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path.parent, 0o700)
    except OSError:
        pass


def _load_raw(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return _empty_state()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return _empty_state()
    if not isinstance(raw, dict):
        return _empty_state()
    raw = cast(dict[str, Any], raw)
    codes_raw = raw.get("codes")
    devices_raw = raw.get("devices")
    codes = cast(list[Any], codes_raw) if isinstance(codes_raw, list) else []
    devices = cast(list[Any], devices_raw) if isinstance(devices_raw, list) else []
    now = int(time.time())
    cleaned_codes: list[dict[str, Any]] = []
    for entry in codes:
        if not isinstance(entry, dict):
            continue
        entry = cast(dict[str, Any], entry)
        expires = entry.get("expires")
        if not isinstance(expires, (int, float)) or int(expires) <= now:
            continue
        cleaned_codes.append(
            {
                "hash": str(entry.get("hash") or ""),
                "expires": int(expires),
                "used": bool(entry.get("used")),
            }
        )
    cleaned_devices: list[dict[str, Any]] = []
    for entry in devices:
        if not isinstance(entry, dict):
            continue
        entry = cast(dict[str, Any], entry)
        cleaned_devices.append(
            {
                "id": str(entry.get("id") or ""),
                "name": str(entry.get("name") or ""),
                "hash": str(entry.get("hash") or ""),
                "created": int(entry.get("created") or 0),
                "last_seen": entry.get("last_seen"),
                "revoked": bool(entry.get("revoked")),
            }
        )
    return {"codes": cleaned_codes, "devices": cleaned_devices}


def _save_raw(path: Path, state: dict[str, Any]) -> None:
    _ensure_parent(path)
    payload = json.dumps(state, ensure_ascii=False, indent=2)
    fd, tmp_name = tempfile.mkstemp(prefix=".devices-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp_name, 0o600)
        os.replace(tmp_name, path)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
    finally:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass


def _with_state(
    path: Path,
    mutate: Callable[[dict[str, Any]], Any],
    *,
    persist: Callable[[Any], bool] | None = None,
) -> Any:
    with _lock:
        state = _load_raw(path)
        result = mutate(state)
        if persist is None or persist(result):
            _save_raw(path, state)
        return result


def create_pairing_code(path: Path | None = None) -> tuple[str, int]:
    target = path or devices_file_path()

    def mutate(state: dict[str, Any]) -> tuple[str, int]:
        unused = sum(1 for code in state["codes"] if not code.get("used"))
        if unused >= MAX_UNUSED_CODES:
            raise DeviceError(429, "too_many_codes")
        code = secrets.token_urlsafe(18)
        expires = int(time.time()) + CODE_TTL_S
        state["codes"].append({"hash": token_hash(code), "expires": expires, "used": False})
        return code, CODE_TTL_S

    return cast(tuple[str, int], _with_state(target, mutate))


def claim_pairing_code(code: object, name: str, path: Path | None = None) -> tuple[str, str, str]:
    target = path or devices_file_path()
    cleaned_name = _validate_name(name)
    if not isinstance(code, str) or not code.strip():
        raise DeviceError(401, "unauthorized")
    code_hash = token_hash(code.strip())

    def mutate(state: dict[str, Any]) -> tuple[str, str, str]:
        match: dict[str, Any] | None = None
        for entry in state["codes"]:
            stored = str(entry.get("hash") or "")
            if hmac.compare_digest(stored, code_hash):
                match = entry
                break
        if match is None or match.get("used"):
            raise DeviceError(401, "unauthorized")
        live = sum(1 for device in state["devices"] if not device.get("revoked"))
        if live >= MAX_DEVICES:
            raise DeviceError(429, "too_many_devices")
        device_id = secrets.token_urlsafe(9)
        device_token = secrets.token_urlsafe(32)
        now = int(time.time())
        state["devices"].append(
            {
                "id": device_id,
                "name": cleaned_name,
                "hash": token_hash(device_token),
                "created": now,
                "last_seen": None,
                "revoked": False,
            }
        )
        match["used"] = True
        return device_token, device_id, cleaned_name

    return cast(tuple[str, str, str], _with_state(target, mutate))


def revoke_device(device_id: str, path: Path | None = None) -> None:
    target = path or devices_file_path()

    def mutate(state: dict[str, Any]) -> None:
        for device in state["devices"]:
            if device.get("id") == device_id:
                device["revoked"] = True
                return
        raise DeviceError(404, "not_found")

    _with_state(target, mutate)


def list_devices_public(path: Path | None = None) -> list[dict[str, Any]]:
    target = path or devices_file_path()
    with _lock:
        state = _load_raw(target)
    devices: list[dict[str, Any]] = []
    for entry in state["devices"]:
        devices.append(
            {
                "id": entry.get("id"),
                "name": entry.get("name"),
                "created": entry.get("created"),
                "last_seen": entry.get("last_seen"),
                "revoked": entry.get("revoked"),
            }
        )
    return devices


def live_device_id(headers: Any, path: Path | None = None) -> str | None:
    """Id of the live (not revoked) device whose token is in the headers; updates last_seen."""
    raw = _auth_token(headers)
    if not raw:
        return None
    digest = token_hash(raw)
    target = path or devices_file_path()

    def mutate(state: dict[str, Any]) -> tuple[str | None, bool]:
        for device in state["devices"]:
            stored = str(device.get("hash") or "")
            if not hmac.compare_digest(stored, digest):
                continue
            if device.get("revoked"):
                return None, False
            now = int(time.time())
            # Rewrite (and fsync) the file at most once a minute per device, not on every bootstrap.
            stale = now - int(device.get("last_seen") or 0) >= LAST_SEEN_RESOLUTION_S
            if stale:
                device["last_seen"] = now
            return str(device.get("id") or "") or None, stale
        return None, False

    result = cast("tuple[str | None, bool]", _with_state(target, mutate, persist=lambda r: r[1]))
    return result[0]


def header_is_live_device(headers: Any, path: Path | None = None) -> bool:
    return live_device_id(headers, path) is not None


# Gateway tokens minted at bootstrap for a device (in-memory, this process only).
# Revoking the device drops them at once instead of waiting for their TTL, and
# they can't mint pairing codes: pairing a new phone needs the master secret.
_DEVICE_TOKENS: dict[str, str] = {}  # gateway token -> device id
_DEVICE_TOKENS_LOCK = threading.Lock()


def remember_device_tokens(device_id: str, tokens: Any, *issued: str | None) -> None:
    live = set(getattr(tokens, "api_tokens", {})) | set(getattr(tokens, "issued_tokens", {}))
    with _DEVICE_TOKENS_LOCK:
        for token in [t for t in _DEVICE_TOKENS if t not in live]:
            _DEVICE_TOKENS.pop(token, None)  # expired or already used
        for token in issued:
            if token:
                _DEVICE_TOKENS[token] = device_id


# Live WebSockets opened with a device-minted token, so revoke can close them.
_DEVICE_CONNECTIONS: weakref.WeakKeyDictionary[Any, tuple[str, asyncio.AbstractEventLoop]] = (
    weakref.WeakKeyDictionary()
)
REVOKED_CLOSE_CODE = 4003


def drop_device_tokens(device_id: str, tokens: Any) -> int:
    with _DEVICE_TOKENS_LOCK:
        mine = [t for t, d in _DEVICE_TOKENS.items() if d == device_id]
        for token in mine:
            _DEVICE_TOKENS.pop(token, None)
            tokens.api_tokens.pop(token, None)
            tokens.issued_tokens.pop(token, None)
            tokens.issued_token_audiences.pop(token, None)
        live = [(c, loop) for c, (d, loop) in list(_DEVICE_CONNECTIONS.items()) if d == device_id]
        for connection, _ in live:
            _DEVICE_CONNECTIONS.pop(connection, None)
    for connection, loop in live:
        if not loop.is_closed():
            asyncio.run_coroutine_threadsafe(connection.close(REVOKED_CLOSE_CODE, "device revoked"), loop)
    return len(mine) + len(live)


def install_connection_tracking() -> None:
    """Remember which WebSocket each device-minted token opened (idempotent class patch)."""
    from nanobot.webui.gateway_endpoint import WebUIGatewayEndpoint

    original = WebUIGatewayEndpoint.consume_issued_token
    if getattr(original, "_device_tracked", False):
        return

    def tracked(self: WebUIGatewayEndpoint, connection: Any, token: str) -> bool:
        with _DEVICE_TOKENS_LOCK:
            device_id = _DEVICE_TOKENS.get(token)
        ok = original(self, connection, token)
        if ok and device_id:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                return ok
            with _DEVICE_TOKENS_LOCK:
                _DEVICE_CONNECTIONS[connection] = (device_id, loop)
        return ok

    setattr(tracked, "_device_tracked", True)
    WebUIGatewayEndpoint.consume_issued_token = tracked


def _is_device_minted(request: Any) -> bool:
    raw = _auth_token(request.headers)
    with _DEVICE_TOKENS_LOCK:
        return bool(raw) and raw in _DEVICE_TOKENS


def router_admin_authorized(secret: str, router: Any, request: WsRequest) -> bool:
    if secret and issue_route_secret_matches(request.headers, secret):
        return True
    return bool(router.check_api_token(request))


def dispatch_devices_get(router: Any, request: WsRequest, got: str) -> Response | None:
    if got != PREFIX:
        return None
    secret = router.config.token_issue_secret.strip() or router.config.token.strip()
    if not router_admin_authorized(secret, router, request):
        return http_error(401, "Unauthorized")
    payload = {"devices": list_devices_public()}
    return http_json_response(payload, extra_headers=[("Cache-Control", "no-store")])


def devices_post_handler(
    secret: str,
    tokens: Any,
    fallback: Callable[[web.BaseRequest], Awaitable[web.StreamResponse]],
) -> Callable[[web.BaseRequest], Awaitable[web.StreamResponse]]:
    async def handler(request: web.BaseRequest) -> web.StreamResponse:
        path = request.path
        if path != PREFIX and not path.startswith(PREFIX + "/"):
            return await fallback(request)
        response = await _handle_post(secret, tokens, request)
        response.headers["Cache-Control"] = "no-store"
        response.force_close()
        return response

    return handler


async def read_json(request: web.BaseRequest) -> dict[str, Any]:
    if request.content_length is not None and request.content_length > MAX_JSON_BODY_BYTES:
        raise DeviceError(413, "body_too_large")
    raw = await request.content.read(MAX_JSON_BODY_BYTES + 1)
    if len(raw) > MAX_JSON_BODY_BYTES:
        raise DeviceError(413, "body_too_large")
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        raise DeviceError(400, "invalid_json") from None
    if not isinstance(data, dict):
        raise DeviceError(400, "invalid_json")
    return cast(dict[str, Any], data)


async def _handle_post(secret: str, tokens: Any, request: web.BaseRequest) -> web.StreamResponse:
    if request.method != "POST":
        return web.json_response({"error": "method_not_allowed"}, status=405)
    path = request.path
    if path == PREFIX + "/claim":
        try:
            body = await read_json(request)
            device_token, device_id, name = claim_pairing_code(body.get("code", ""), body.get("name", ""))
            return web.json_response(
                {"device_token": device_token, "id": device_id, "name": name},
                status=201,
            )
        except DeviceError as exc:
            if exc.status == 401:
                return web.json_response({"error": "unauthorized"}, status=401)
            return web.json_response({"error": exc.code}, status=exc.status)
    if not admin_authorized(secret, tokens, request):
        return web.json_response({"error": "unauthorized"}, status=401)
    if request.headers.get("Content-Encoding") or request.headers.get("Transfer-Encoding"):
        return web.json_response({"error": "unsupported_framing"}, status=400)
    try:
        if path == PREFIX + "/codes":
            if _is_device_minted(request):
                return web.json_response({"error": "device_cannot_pair"}, status=403)
            code, expires_in = create_pairing_code()
            origin = _request_origin(request.headers)
            qr = json.dumps({"v": 1, "url": origin, "code": code}, separators=(",", ":"))
            return web.json_response({"code": code, "expires_in": expires_in, "qr": qr}, status=201)
        if path == PREFIX + "/revoke":
            body = await read_json(request)
            device_id = body.get("id")
            if not isinstance(device_id, str) or not device_id.strip():
                return web.json_response({"error": "invalid_id"}, status=400)
            revoke_device(device_id.strip())
            drop_device_tokens(device_id.strip(), tokens)
            return web.json_response({"ok": True})
    except DeviceError as exc:
        return web.json_response({"error": exc.code}, status=exc.status)
    return web.json_response({"error": "not_found"}, status=404)
