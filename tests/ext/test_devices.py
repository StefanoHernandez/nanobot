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
    assert listed and set(listed[0]) == {"id", "name", "created", "last_seen", "revoked"}
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
