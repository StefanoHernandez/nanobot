"""Shell commands wait for an approval from the phone when approvals are enabled."""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest

from nanobot.agent.tools.context import RequestContext, bind_request_context, reset_request_context
from nanobot.ext import approvals as ap


@pytest.fixture
def gate(tmp_path, monkeypatch):
    path = tmp_path / "approvals.json"
    monkeypatch.setenv("NANOBOT_APPROVALS_FILE", str(path))
    g = ap.ApprovalGate(path)
    monkeypatch.setattr(ap, "GATE", g)
    return g


async def _wait_pending(g: ap.ApprovalGate) -> dict:
    for _ in range(100):
        if g.pending():
            return g.pending()[0]
        await asyncio.sleep(0)
    raise AssertionError("no pending request")


async def test_disabled_gate_never_asks(gate):
    assert await gate.request("websocket:c1", "exec", "ls") is True
    assert gate.pending() == []


async def test_allow_and_deny(gate):
    gate.set_enabled(True)
    task = asyncio.create_task(gate.request("websocket:c1", "exec", "rm -rf build"))
    item = await _wait_pending(gate)
    assert item["summary"] == "rm -rf build" and item["session_key"] == "websocket:c1"
    gate.decide(item["id"], allow=False, always=False)
    assert await task is False

    task = asyncio.create_task(gate.request("websocket:c1", "exec", "ls"))
    gate.decide((await _wait_pending(gate))["id"], allow=True, always=False)
    assert await task is True


async def test_no_answer_denies(gate):
    gate.set_enabled(True)
    assert await gate.request("websocket:c1", "exec", "ls", timeout_s=0.01) is False
    assert gate.pending() == []


async def test_always_allow_is_per_chat_and_can_be_forgotten(gate):
    gate.set_enabled(True)
    task = asyncio.create_task(gate.request("websocket:c1", "exec", "ls"))
    gate.decide((await _wait_pending(gate))["id"], allow=True, always=True)
    assert await task is True
    assert await gate.request("websocket:c1", "exec", "pwd") is True  # no prompt now
    assert gate.state()["allow"] == {"websocket:c1": ["exec"]}
    assert await gate.request("websocket:c2", "exec", "pwd", timeout_s=0.01) is False  # other chat still asks
    gate.forget("websocket:c1")
    assert await gate.request("websocket:c1", "exec", "pwd", timeout_s=0.01) is False


async def test_exec_tool_returns_an_error_when_denied(gate, monkeypatch):
    from nanobot.agent.tools.shell import ExecTool

    gate.set_enabled(True)
    ran: list[str] = []

    async def fake_original(self, command=None, **kwargs):
        ran.append(command)
        return "ok"

    # Re-guard a stand-in for the real exec so no shell command runs in the test.
    monkeypatch.setattr(ExecTool, "execute", fake_original)
    ap.install()
    tool = object.__new__(ExecTool)
    token = bind_request_context(RequestContext(channel="websocket", chat_id="c1", session_key="websocket:c1"))
    try:
        task = asyncio.create_task(tool.execute(command="rm -rf /tmp/x"))
        gate.decide((await _wait_pending(gate))["id"], allow=False, always=False)
        result = await task
    finally:
        reset_request_context(token)
    assert ran == [] and "denied" in str(result)

    token = bind_request_context(RequestContext(channel="websocket", chat_id="c1", session_key="websocket:c1"))
    try:
        task = asyncio.create_task(tool.execute("rm -rf /tmp/y"))  # positional: still gated
        pending = await _wait_pending(gate)
        assert pending["summary"].startswith("rm -rf /tmp/y")
        gate.decide(pending["id"], allow=False, always=False)
        assert "denied" in str(await task)
    finally:
        reset_request_context(token)
    assert ran == []


def _post(
    path: str,
    body: dict,
    auth: str | None,
    *,
    remote: str = "127.0.0.1",
    host: str = "127.0.0.1:8765",
):
    raw = json.dumps(body).encode("utf-8")

    class _Content:
        _left = [raw]  # one body, then EOF

        @staticmethod
        async def read(_limit: int) -> bytes:
            return _Content._left.pop() if _Content._left else b""

    headers = {"Content-Type": "application/json"}
    if host:
        headers["Host"] = host
    if auth:
        headers["Authorization"] = f"Bearer {auth}"
    return SimpleNamespace(
        method="POST",
        path=ap.PREFIX + path,
        headers=headers,
        content_length=len(raw),
        content=_Content(),
        remote=remote,
    )


class _Tokens:
    def check_api_token(self, request):
        return request.headers.get("Authorization") == "Bearer api"


async def _fallback(_request):
    raise AssertionError("fallback should not run")


async def test_http_requires_auth_and_toggles(gate):
    handler = ap.approvals_post_handler("master", _Tokens(), _fallback)
    denied = await handler(_post("/settings", {"enabled": True}, None))
    assert denied.status == 401
    ok = await handler(_post("/settings", {"enabled": True}, "api"))
    assert ok.status == 200 and gate.state()["enabled"] is True
    bad = await handler(_post("/decide", {"id": "x", "allow": "yes"}, "master"))
    assert bad.status == 400
    missing = await handler(_post("/decide", {"id": "nope", "allow": True}, "master"))
    assert missing.status == 404


@pytest.mark.asyncio
async def test_settings_and_forget_require_privileged(gate, tmp_path, monkeypatch):
    from nanobot.ext import devices as dev
    from nanobot.webui.gateway_tokens import GatewayTokenStore

    devices_path = tmp_path / "devices.json"
    monkeypatch.setenv("NANOBOT_DEVICES_FILE", str(devices_path))

    store = GatewayTokenStore()
    code, _ = dev.create_pairing_code(devices_path)
    _, plain_id, _ = dev.claim_pairing_code(code, "plain-phone", devices_path)
    plain_api = store.issue_api_token(300)
    dev.remember_device_tokens(plain_id, store, plain_api)

    code2, _ = dev.create_pairing_code(devices_path)
    _, fp_id, _ = dev.claim_pairing_code(code2, "fp-phone", devices_path)
    fp_api = store.issue_api_token(300)
    dev.remember_device_tokens(fp_id, store, fp_api)
    dev.set_full_power(fp_id, True, devices_path)

    handler = ap.approvals_post_handler("master", store, _fallback)

    for route, body in [("/settings", {"enabled": True}), ("/forget", {"session_key": "s1"})]:
        # 1) Plain device token -> 403 full_power_required
        plain_req = _post(route, body, plain_api, remote="100.64.0.1", host="nanobot.remote:8765")
        denied = await handler(plain_req)
        assert denied.status == 403
        assert json.loads(denied.text) == {"error": "full_power_required"}

        # 2) Full-power device token -> 200
        fp_req = _post(route, body, fp_api, remote="100.64.0.2", host="nanobot.remote:8765")
        allowed_fp = await handler(fp_req)
        assert allowed_fp.status == 200

        # 3) Local browser -> 200
        local_req = _post(route, body, "master", remote="127.0.0.1", host="127.0.0.1:8765")
        allowed_local = await handler(local_req)
        assert allowed_local.status == 200

