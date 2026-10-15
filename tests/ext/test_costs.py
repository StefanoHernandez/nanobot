"""Costs per model per day from the llm_usage store."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from nanobot.ext import costs
from nanobot.llm_usage.models import LLMCallRecord
from nanobot.llm_usage.store import LLMUsageStore
from nanobot.providers.base import LLMUsage

NOW = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)
NOW_MS = int(NOW.timestamp() * 1000)
DAY_MS = 86_400_000


def _call(store, *, at_ms, model, inp, out, cache_read=0, provider="openrouter"):
    usage = LLMUsage(
        input_tokens=inp,
        output_tokens=out,
        total_tokens=inp + out,
        cache_read_tokens=cache_read,
        cache_write_tokens=0,
        reported_tokens=inp + out,
    )
    store.record(
        LLMCallRecord(
            started_at_ms=at_ms, duration_ms=10, provider=provider, model=model,
            source="user", stream=False, finish_reason="stop", usage=usage,
        )
    )


@pytest.fixture
def db(tmp_path):
    path = tmp_path / "llm_usage.sqlite3"
    store = LLMUsageStore(path)
    _call(store, at_ms=NOW_MS, model="m-a", inp=1_000_000, out=100_000, cache_read=400_000)
    _call(store, at_ms=NOW_MS - DAY_MS, model="m-a", inp=200_000, out=0)
    _call(store, at_ms=NOW_MS, model="m-free", inp=5, out=5)
    store.close()
    return path


def _settings(**kw):
    base = {"prices": {"openrouter/m-a": {"input": 1.0, "output": 10.0, "cache_read": 0.1}}}
    return costs._clean({**base, **kw})


def test_cost_per_day_and_model(db):
    body = costs.payload(days=30, db=db, settings=_settings(), now=NOW)
    today = body["days"][-1]
    a = next(m for m in today["models"] if m["model"] == "m-a")
    # 600k fresh * $1 + 400k cache * $0.1 + 100k out * $10 = 0.6 + 0.04 + 1.0
    assert a["cost_usd"] == pytest.approx(1.64)
    assert body["days"][0]["cost_usd"] == pytest.approx(0.2)
    assert body["today_cost_usd"] == pytest.approx(1.64)
    assert body["total_cost_usd"] == pytest.approx(1.84)
    assert body["unpriced_models"] == ["openrouter/m-free"]


def test_bare_model_key_and_cap_alert(db):
    s = _settings(prices={"m-a": {"input": 1.0, "output": 10.0}}, daily_cap_usd=2.4, alert_pct=80)
    body = costs.payload(days=1, db=db, settings=s, now=NOW)
    assert len(body["days"]) == 1
    assert body["today_cost_usd"] == pytest.approx(2.0)  # cache read billed at input price
    assert body["alert"] is True and body["over_cap"] is False
    no_cap = costs.payload(days=1, db=db, settings=_settings(), now=NOW)
    assert no_cap["alert"] is False and no_cap["over_cap"] is False


def test_missing_db_is_empty(tmp_path):
    body = costs.payload(db=tmp_path / "none.sqlite3", settings=_settings(), now=NOW)
    assert body["days"] == [] and body["today_cost_usd"] == 0.0


def test_bad_prices_are_dropped():
    s = costs._clean({"prices": {"x": {"input": -1, "output": 1}, "y": {"input": 1}, "z": {"input": True, "output": 1}}})
    assert s["prices"] == {} and s["alert_pct"] == 80.0 and s["daily_cap_usd"] is None


def _post(body, auth):
    raw = json.dumps(body).encode("utf-8")

    class _Content:
        @staticmethod
        async def read(_limit: int) -> bytes:
            return raw

    headers = {"Content-Type": "application/json"}
    if auth:
        headers["Authorization"] = f"Bearer {auth}"
    return SimpleNamespace(method="POST", path=costs.PREFIX + "/settings", headers=headers,
                           content_length=len(raw), content=_Content())


class _Tokens:
    def check_api_token(self, request):
        return request.headers.get("Authorization") == "Bearer api"


async def _fallback(_request):
    raise AssertionError("fallback should not run")


async def test_settings_post(tmp_path, monkeypatch):
    path = tmp_path / "costs.json"
    monkeypatch.setenv("NANOBOT_COSTS_FILE", str(path))
    handler = costs.costs_post_handler("master", _Tokens(), _fallback)
    assert (await handler(_post({"daily_cap_usd": 5}, None))).status == 401
    assert (await handler(_post({"alert_pct": 0}, "api"))).status == 400
    ok = await handler(_post({"daily_cap_usd": 5, "prices": {"m": {"input": 1, "output": 2}}}, "api"))
    assert ok.status == 200
    saved = costs.load_settings(path)
    assert saved["daily_cap_usd"] == 5.0 and saved["prices"] == {"m": {"input": 1.0, "output": 2.0}}
    if sys.platform != "win32":  # no POSIX modes on Windows
        assert path.stat().st_mode & 0o777 == 0o600
    await handler(_post({"daily_cap_usd": None}, "api"))
    assert costs.load_settings(path)["daily_cap_usd"] is None
    assert costs.load_settings(path)["prices"]  # untouched fields kept
