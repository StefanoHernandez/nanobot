"""Device pairing storage and HTTP helpers."""

import json
from types import SimpleNamespace

import pytest
from websockets.datastructures import Headers
from websockets.http11 import Request as WsRequest

from nanobot.ext import devices as dev

MASTER = "master-secret-test"
API = "api-token-test"


class _Tokens:
    def check_api_token(self, request):
        auth = request.headers.get("Authorization") or request.headers.get("authorization")
        return auth == f"Bearer {API}"


@pytest.fixture
def devices_path(tmp_path, monkeypatch):
    path = tmp_path / "devices.json"
    monkeypatch.setenv("NANOBOT_DEVICES_FILE", str(path))
    return path


def _router():
    return SimpleNamespace(
        config=SimpleNamespace(token_issue_secret="", token=MASTER),
        tokens=_Tokens(),
        check_api_token=lambda request: _Tokens().check_api_token(request),
    )


def _get(path: str, *, auth: str | None = MASTER):
    headers: list[tuple[str, str]] = []
    if auth is not None:
        headers.append(("Authorization", f"Bearer {auth}"))
    return WsRequest(path, Headers(headers))


def _json(resp):
    return json.loads(resp.body.decode("utf-8"))


def test_storage_uses_hashes_not_raw_secrets(devices_path):
    code, _ = dev.create_pairing_code(devices_path)
    token, device_id, name = dev.claim_pairing_code(code, "phone", devices_path)
    raw = devices_path.read_text(encoding="utf-8")
    assert code not in raw
    assert token not in raw
    assert dev.token_hash(code) in raw
    assert dev.token_hash(token) in raw
    assert device_id in raw
    assert name in raw


def test_claim_works_once_second_is_unauthorized(devices_path):
    code, _ = dev.create_pairing_code(devices_path)
    dev.claim_pairing_code(code, "one", devices_path)
    with pytest.raises(dev.DeviceError) as exc:
        dev.claim_pairing_code(code, "two", devices_path)
    assert exc.value.status == 401


def _claim_request(body: bytes):
    class _Content:
        @staticmethod
        async def read(_limit: int) -> bytes:
            return body

    return SimpleNamespace(
        method="POST",
        path="/api/ext/devices/claim",
        headers={"Content-Type": "application/json"},
        content_length=len(body),
        content=_Content(),
    )


@pytest.mark.asyncio
async def test_claim_once_through_post_handler(devices_path):
    code, _ = dev.create_pairing_code(devices_path)
    handler = dev.devices_post_handler(MASTER, _Tokens(), fallback=_fail_fallback)

    body = json.dumps({"code": code, "name": "handler-phone"}).encode("utf-8")
    first = await handler(_claim_request(body))
    assert first.status == 201
    payload = json.loads(first.text)
    assert payload["name"] == "handler-phone"
    assert "device_token" in payload

    second = await handler(_claim_request(body))
    assert second.status == 401
    assert json.loads(second.text) == {"error": "unauthorized"}


async def _fail_fallback(_request):
    raise AssertionError("fallback should not run")


def test_expired_code_is_unauthorized(devices_path):
    code, _ = dev.create_pairing_code(devices_path)
    state = json.loads(devices_path.read_text(encoding="utf-8"))
    state["codes"][0]["expires"] = 1
    devices_path.write_text(json.dumps(state), encoding="utf-8")
    with pytest.raises(dev.DeviceError) as exc:
        dev.claim_pairing_code(code, "late", devices_path)
    assert exc.value.status == 401


def test_revoked_device_not_live(devices_path):
    code, _ = dev.create_pairing_code(devices_path)
    token, device_id, _ = dev.claim_pairing_code(code, "phone", devices_path)
    dev.revoke_device(device_id, devices_path)
    headers = Headers([("Authorization", f"Bearer {token}")])
    assert dev.header_is_live_device(headers, devices_path) is False


def test_live_device_updates_last_seen(devices_path):
    code, _ = dev.create_pairing_code(devices_path)
    token, device_id, _ = dev.claim_pairing_code(code, "phone", devices_path)
    headers = Headers([("Authorization", f"Bearer {token}")])
    assert dev.header_is_live_device(headers, devices_path) is True
    state = json.loads(devices_path.read_text(encoding="utf-8"))
    device = next(entry for entry in state["devices"] if entry["id"] == device_id)
    assert isinstance(device["last_seen"], int)


def test_list_payload_has_no_hash(devices_path):
    code, _ = dev.create_pairing_code(devices_path)
    dev.claim_pairing_code(code, "listed", devices_path)
    listed = dev.list_devices_public(devices_path)
    assert listed and set(listed[0]) == {"id", "name", "created", "last_seen", "revoked", "full_power"}
    resp = dev.dispatch_devices_get(_router(), _get("/api/ext/devices"), "/api/ext/devices")
    assert resp is not None and resp.status_code == 200
    payload = _json(resp)
    assert "hash" not in json.dumps(payload)


def test_invalid_name_with_newline(devices_path):
    code, _ = dev.create_pairing_code(devices_path)
    with pytest.raises(dev.DeviceError) as exc:
        dev.claim_pairing_code(code, "bad\nname", devices_path)
    assert exc.value.code == "invalid_name"


def test_sixth_unused_code_hits_limit(devices_path):
    for _ in range(5):
        dev.create_pairing_code(devices_path)
    with pytest.raises(dev.DeviceError) as exc:
        dev.create_pairing_code(devices_path)
    assert exc.value.status == 429


def test_admin_auth_accepts_master_or_api_token():
    secret = MASTER
    master_req = SimpleNamespace(headers={"Authorization": f"Bearer {secret}"})
    api_req = SimpleNamespace(headers={"Authorization": f"Bearer {API}"})
    bad_req = SimpleNamespace(headers={"Authorization": "Bearer nope"})
    tokens = _Tokens()
    assert dev.admin_authorized(secret, tokens, master_req) is True
    assert dev.admin_authorized(secret, tokens, api_req) is True
    assert dev.admin_authorized(secret, tokens, bad_req) is False


def test_unknown_token_does_not_rewrite_the_file(devices_path):
    code, _ = dev.create_pairing_code(devices_path)
    dev.claim_pairing_code(code, "phone", devices_path)
    before = devices_path.read_bytes()
    headers = Headers([("Authorization", "Bearer not-a-device")])
    assert dev.header_is_live_device(headers, devices_path) is False
    assert devices_path.read_bytes() == before


def test_pairing_origin_rejects_a_host_with_a_path():
    with pytest.raises(dev.DeviceError) as exc:
        dev._request_origin({"Host": "evil.example/steal"})
    assert exc.value.status == 400


def _post(path: str, body: dict, auth: str):
    raw = json.dumps(body).encode("utf-8")

    class _Content:
        @staticmethod
        async def read(_limit: int) -> bytes:
            return raw

    return SimpleNamespace(
        method="POST",
        path=dev.PREFIX + path,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {auth}"},
        content_length=len(raw),
        content=_Content(),
        remote="192.0.2.1",
    )


def _paired_phone(devices_path):
    code, _ = dev.create_pairing_code(devices_path)
    device_token, device_id, _ = dev.claim_pairing_code(code, "phone", devices_path)
    return device_token, device_id


@pytest.mark.asyncio
async def test_revoke_drops_the_phone_tokens_at_once(devices_path):
    from nanobot.webui.gateway_tokens import GatewayTokenStore

    store = GatewayTokenStore()
    device_token, device_id = _paired_phone(devices_path)
    assert dev.live_device_id({"Authorization": f"Bearer {device_token}"}) == device_id
    ws, api = store.issue_token(300), store.issue_api_token(300)
    dev.remember_device_tokens(device_id, store, ws, api)

    handler = dev.devices_post_handler(MASTER, store, fallback=_fail_fallback)
    resp = await handler(_post("/revoke", {"id": device_id}, MASTER))
    assert resp.status == 200
    assert api not in store.api_tokens and ws not in store.issued_tokens
    assert dev.live_device_id({"Authorization": f"Bearer {device_token}"}) is None


@pytest.mark.asyncio
async def test_a_phone_token_cannot_pair_new_phones(devices_path):
    from nanobot.webui.gateway_tokens import GatewayTokenStore

    store = GatewayTokenStore()
    _, device_id = _paired_phone(devices_path)
    api = store.issue_api_token(300)
    dev.remember_device_tokens(device_id, store, api)
    handler = dev.devices_post_handler(MASTER, store, fallback=_fail_fallback)

    denied = await handler(_post("/codes", {}, api))
    assert denied.status == 403
    master_api = store.issue_api_token(300)  # minted with the master secret
    allowed = await handler(_post("/codes", {}, master_api))
    assert allowed.status != 403  # past the device check (400 here only for the missing Origin)


@pytest.mark.asyncio
async def test_revoke_closes_the_phone_open_websocket(devices_path):
    import asyncio

    from nanobot.webui.gateway_endpoint import WebUIGatewayEndpoint
    from nanobot.webui.gateway_tokens import GatewayTokenStore

    class _Conn:
        closed: tuple[int, str] | None = None

        async def close(self, code: int, reason: str) -> None:
            self.closed = (code, reason)

    dev.install_connection_tracking()
    dev.install_connection_tracking()  # idempotent
    store = GatewayTokenStore()
    _, device_id = _paired_phone(devices_path)
    ws, other_ws = store.issue_token(300, audience="webui"), store.issue_token(300, audience="webui")
    dev.remember_device_tokens(device_id, store, ws)
    endpoint = WebUIGatewayEndpoint(config=SimpleNamespace(), http=None, tokens=store)  # type: ignore[arg-type]
    phone, laptop = _Conn(), _Conn()
    assert endpoint.consume_issued_token(phone, ws)
    assert endpoint.consume_issued_token(laptop, other_ws)  # not a device token: untracked

    handler = dev.devices_post_handler(MASTER, store, fallback=_fail_fallback)
    assert (await handler(_post("/revoke", {"id": device_id}, MASTER))).status == 200
    for _ in range(5):  # close is scheduled thread-safely onto the loop
        await asyncio.sleep(0)
    assert phone.closed == (dev.REVOKED_CLOSE_CODE, "device revoked")
    assert laptop.closed is None


def _web(path: str, body: dict, *, origin: str = "http://gw.test:8765", cookie: str | None = None):
    raw = json.dumps(body).encode("utf-8")

    class _Content:
        @staticmethod
        async def read(_limit: int) -> bytes:
            return raw

    headers = {"Content-Type": "application/json", "Host": "gw.test:8765", "Origin": origin}
    if cookie is not None:
        headers.update({"Cookie": f"{dev.COOKIE_NAME}={cookie}", dev.COOKIE_AUTH_HEADER: "1"})
    return SimpleNamespace(
        method="POST", path=dev.PREFIX + path, headers=headers, content_length=len(raw), content=_Content()
    )


def _cookie_value(resp) -> str:
    raw = resp.headers["Set-Cookie"]
    assert "HttpOnly" in raw and "SameSite=Strict" in raw and "Path=/" in raw
    return raw.split(";", 1)[0].split("=", 1)[1]


@pytest.mark.asyncio
async def test_web_login_with_secret_sets_an_httponly_cookie_only(devices_path):
    from nanobot.webui.gateway_tokens import GatewayTokenStore

    handler = dev.devices_post_handler(MASTER, GatewayTokenStore(), fallback=_fail_fallback)
    resp = await handler(_web("/web-login", {"secret": MASTER, "name": "PC studio"}))
    assert resp.status == 201
    assert "device_token" not in resp.text and MASTER not in resp.text  # nothing for page JS to keep
    token = _cookie_value(resp)
    assert "Secure" not in resp.headers["Set-Cookie"]  # plain http (tailnet): Secure would drop it

    cookie_headers = {"Cookie": f"{dev.COOKIE_NAME}={token}"}
    assert dev.live_device_id(cookie_headers) is None  # cookie alone (cross-site form, img) is ignored
    assert dev.live_device_id({**cookie_headers, dev.COOKIE_AUTH_HEADER: "1"}) is not None


@pytest.mark.asyncio
async def test_web_login_with_a_pairing_code_and_logout_revokes(devices_path):
    from nanobot.webui.gateway_tokens import GatewayTokenStore

    store = GatewayTokenStore()
    code, _ = dev.create_pairing_code()
    handler = dev.devices_post_handler(MASTER, store, fallback=_fail_fallback)
    resp = await handler(_web("/web-login", {"code": code, "name": "Laptop"}))
    token = _cookie_value(resp)
    device_id = json.loads(resp.text)["id"]
    out = await handler(_web("/web-logout", {}, cookie=token))
    assert out.status == 200 and "Max-Age=0" in out.headers["Set-Cookie"]
    assert {d["id"]: d for d in dev.list_devices_public()}[device_id]["revoked"] is True


@pytest.mark.asyncio
async def test_web_login_refuses_cross_origin_and_brute_force(devices_path, monkeypatch):
    from nanobot.webui.gateway_tokens import GatewayTokenStore

    monkeypatch.setattr(dev, "_web_login_failures", dev.collections.deque())
    handler = dev.devices_post_handler(MASTER, GatewayTokenStore(), fallback=_fail_fallback)
    evil = await handler(_web("/web-login", {"secret": MASTER, "name": "x"}, origin="https://evil.example"))
    assert evil.status == 403
    for _ in range(dev.WEB_LOGIN_MAX_FAILURES):
        assert (await handler(_web("/web-login", {"secret": "wrong", "name": "x"}))).status == 401
    blocked = await handler(_web("/web-login", {"secret": MASTER, "name": "x"}))
    assert blocked.status == 429


def _full_power_post(body: dict, auth: str, *, remote: str, host: str):
    req = _post("/full-power", body, auth)
    req.headers["Host"] = host
    req.remote = remote
    return req


_REMOTE_PEER = SimpleNamespace(remote_address=("100.64.0.7", 50000))


@pytest.mark.asyncio
async def test_full_power_is_granted_only_from_the_server_browser(devices_path):
    from nanobot.webui.gateway_tokens import GatewayTokenStore

    store = GatewayTokenStore()
    _, device_id = _paired_phone(devices_path)
    phone_api = store.issue_api_token(300)
    dev.remember_device_tokens(device_id, store, phone_api)
    phone = {"Authorization": f"Bearer {phone_api}", "Host": "arduino.tail.ts.net:8765"}
    handler = dev.devices_post_handler(MASTER, store, fallback=_fail_fallback)
    grant = {"id": device_id, "enabled": True}

    assert not dev.privileged_request(_REMOTE_PEER, phone)
    denied = await handler(_full_power_post(grant, MASTER, remote="100.64.0.7", host="arduino.tail.ts.net:8765"))
    assert denied.status == 403
    assert not dev.privileged_request(_REMOTE_PEER, phone)

    allowed = await handler(_full_power_post(grant, MASTER, remote="127.0.0.1", host="127.0.0.1:8765"))
    assert allowed.status == 200
    assert dev.list_devices_public()[0]["full_power"] is True
    assert dev.privileged_request(_REMOTE_PEER, phone)

    dev.revoke_device(device_id)
    assert dev.list_devices_public()[0]["full_power"] is False
    assert not dev.privileged_request(_REMOTE_PEER, phone)


def test_privileged_request_needs_a_device_token_or_the_local_browser(devices_path):
    local = SimpleNamespace(remote_address=("127.0.0.1", 50000))
    assert dev.privileged_request(local, {"Host": "localhost:8765"})
    assert not dev.privileged_request(_REMOTE_PEER, {"Authorization": f"Bearer {MASTER}"})


def test_full_power_follows_the_socket_the_device_opened(devices_path, monkeypatch):
    _, device_id = _paired_phone(devices_path)
    class _Socket:
        remote_address = ("100.64.0.7", 50000)

    socket = _Socket()
    monkeypatch.setitem(dev._DEVICE_CONNECTIONS, socket, (device_id, None))
    dev.set_full_power(device_id, True)
    assert dev.privileged_request(socket, {"Host": "arduino.tail.ts.net:8765"})


@pytest.mark.asyncio
async def test_the_server_browser_can_pair_even_as_a_device(devices_path):
    from nanobot.webui.gateway_tokens import GatewayTokenStore

    store = GatewayTokenStore()
    _, device_id = _paired_phone(devices_path)
    api = store.issue_api_token(300)
    dev.remember_device_tokens(device_id, store, api)
    handler = dev.devices_post_handler(MASTER, store, fallback=_fail_fallback)

    def codes(remote: str, host: str):
        req = _post("/codes", {}, api)
        req.headers["Host"] = host
        req.remote = remote
        return req

    assert (await handler(codes("100.64.0.7", "arduino.tail.ts.net:8765"))).status == 403
    assert (await handler(codes("127.0.0.1", "127.0.0.1:8765"))).status == 201


@pytest.mark.asyncio
async def test_the_server_browser_names_the_address_in_the_qr(devices_path):
    handler = dev.devices_post_handler(MASTER, _Tokens(), fallback=_fail_fallback)

    def codes(body: dict, remote: str):
        req = _post("/codes", body, MASTER)
        req.headers["Host"] = "127.0.0.1:8765"
        req.remote = remote
        return req

    resp = await handler(codes({"url": "https://arduino.tail.ts.net/"}, "127.0.0.1"))
    assert json.loads(_json(resp)["qr"])["url"] == "https://arduino.tail.ts.net"
    bad = await handler(codes({"url": "https://evil.example/steal"}, "127.0.0.1"))
    assert bad.status == 400
    remote = await handler(codes({"url": "https://evil.example"}, "100.64.0.7"))
    assert json.loads(_json(remote)["qr"])["url"] == "http://127.0.0.1:8765"  # body ignored
