"""Costs per model per day, with a daily cap and an alert threshold (fork extension).

Token counts come from upstream's llm_usage store (read-only); prices are set by the
user in ``~/.nanobot/ext_costs.json`` (USD per 1M tokens). The cap is soft: the app
alerts and shows ``over_cap``, nothing is blocked.
"""

from __future__ import annotations

import json
import math
import os
import sqlite3
import tempfile
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from aiohttp import web
from websockets.http11 import Request as WsRequest
from websockets.http11 import Response

from nanobot.ext.devices import DeviceError, _read_json, _router_admin_authorized, admin_authorized
from nanobot.webui.http_utils import http_error, http_json_response

PREFIX = "/api/ext/costs"
MAX_DAYS = 90
MAX_PRICES = 200
PRICE_FIELDS = ("input", "output", "cache_read", "cache_write")
_lock = threading.Lock()


def costs_file_path() -> Path:
    raw = os.environ.get("NANOBOT_COSTS_FILE", "").strip()
    return Path(raw).expanduser() if raw else Path.home() / ".nanobot" / "ext_costs.json"


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) and value >= 0 else None


def _clean_prices(raw: Any) -> dict[str, dict[str, float]]:
    """``{"provider/model" or "model": {input, output, cache_read?, cache_write?}}``, bad entries dropped."""
    if not isinstance(raw, dict):
        return {}
    out: dict[str, dict[str, float]] = {}
    for key, entry in list(raw.items())[:MAX_PRICES]:
        if not isinstance(key, str) or not key.strip() or len(key) > 300 or not isinstance(entry, dict):
            continue
        price = {f: v for f in PRICE_FIELDS if (v := _num(entry.get(f))) is not None}
        if "input" in price and "output" in price:
            out[key.strip()] = price
    return out


def _clean(data: Any) -> dict[str, Any]:
    data = data if isinstance(data, dict) else {}
    cap = _num(data.get("daily_cap_usd"))
    alert = _num(data.get("alert_pct"))
    return {
        "prices": _clean_prices(data.get("prices")),
        "daily_cap_usd": cap if cap else None,
        "alert_pct": min(alert, 100.0) if alert else 80.0,
    }


def load_settings(path: Path | None = None) -> dict[str, Any]:
    try:
        return _clean(json.loads((path or costs_file_path()).read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return _clean(None)


def save_settings(state: dict[str, Any], path: Path | None = None) -> None:
    path = path or costs_file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".costs-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(state, fh)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def call_cost(row: dict[str, Any], price: dict[str, float]) -> float:
    """USD for summed token counts. ``input`` includes cache reads/writes (upstream contract);
    anything in ``total`` beyond input is billed as output (hidden reasoning included)."""
    inp, total = row["input_tokens"], row["total_tokens"]
    cr, cw = row["cache_read_tokens"], row["cache_write_tokens"]
    fresh = max(0, inp - cr - cw)
    out = max(row["output_tokens"], total - inp)
    usd = (
        fresh * price["input"]
        + cr * price.get("cache_read", price["input"])
        + cw * price.get("cache_write", price["input"])
        + out * price["output"]
    )
    return usd / 1_000_000


def _zone(name: str | None) -> timezone | ZoneInfo:
    try:
        return ZoneInfo(name) if name else timezone.utc
    except ZoneInfoNotFoundError:
        return timezone.utc


def _timezone_name() -> str | None:
    try:
        from nanobot.config.loader import load_config

        return load_config().agents.defaults.timezone
    except Exception:
        return None


def _rows(db: Path, start_ms: int) -> list[sqlite3.Row]:
    if not db.exists():
        return []
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=2)
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(
            """
            SELECT started_at_ms, provider, model,
                   COALESCE(input_tokens, 0) AS input_tokens,
                   COALESCE(output_tokens, 0) AS output_tokens,
                   COALESCE(total_tokens, 0) AS total_tokens,
                   COALESCE(cache_read_tokens, 0) AS cache_read_tokens,
                   COALESCE(cache_write_tokens, 0) AS cache_write_tokens
            FROM llm_calls WHERE started_at_ms >= ? AND total_tokens > 0
            """,
            (start_ms,),
        ).fetchall()
    except sqlite3.Error:
        return []
    finally:
        conn.close()


def payload(
    *,
    days: int = 30,
    db: Path | None = None,
    settings: dict[str, Any] | None = None,
    timezone_name: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    from nanobot.llm_usage import llm_usage_store_path

    days = max(1, min(MAX_DAYS, days))
    settings = settings if settings is not None else load_settings()
    zone = _zone(timezone_name)
    today = (now or datetime.now(timezone.utc)).astimezone(zone).date()
    first = today - timedelta(days=days - 1)
    start_ms = int(datetime.combine(first, datetime.min.time(), zone).timestamp() * 1000)
    prices = settings["prices"]

    keys = ("input_tokens", "output_tokens", "total_tokens", "cache_read_tokens", "cache_write_tokens")
    grouped: dict[tuple[str, str, str], dict[str, int]] = {}
    for row in _rows(db or llm_usage_store_path(), start_ms):
        day = datetime.fromtimestamp(row["started_at_ms"] / 1000, timezone.utc).astimezone(zone).date()
        acc = grouped.setdefault((day.isoformat(), row["provider"], row["model"]), dict.fromkeys(keys, 0))
        for k in keys:
            acc[k] += int(row[k])

    by_day: dict[str, dict[str, Any]] = {}
    unpriced: set[str] = set()
    for (day, provider, model), tokens in sorted(grouped.items()):
        price = prices.get(f"{provider}/{model}") or prices.get(model)
        cost = round(call_cost(tokens, price), 6) if price else None
        if price is None:
            unpriced.add(f"{provider}/{model}")
        entry = by_day.setdefault(day, {"date": day, "cost_usd": 0.0, "models": []})
        entry["models"].append({"provider": provider, "model": model, **tokens, "cost_usd": cost})
        entry["cost_usd"] = round(entry["cost_usd"] + (cost or 0.0), 6)

    today_cost = by_day.get(today.isoformat(), {}).get("cost_usd", 0.0)
    cap, alert_pct = settings["daily_cap_usd"], settings["alert_pct"]
    return {
        "currency": "USD",
        "today": today.isoformat(),
        "today_cost_usd": today_cost,
        "total_cost_usd": round(sum(d["cost_usd"] for d in by_day.values()), 6),
        "days": list(by_day.values()),
        "unpriced_models": sorted(unpriced),
        "prices": prices,
        "daily_cap_usd": cap,
        "alert_pct": alert_pct,
        "alert": bool(cap) and today_cost >= cap * alert_pct / 100,
        "over_cap": bool(cap) and today_cost >= cap,
    }


def dispatch_costs_get(router: Any, request: WsRequest, got: str) -> Response | None:
    if got != PREFIX:
        return None
    secret = router.config.token_issue_secret.strip() or router.config.token.strip()
    if not _router_admin_authorized(secret, router, request):
        return http_error(401, "Unauthorized")
    raw = parse_qs(urlsplit(request.path).query).get("days", ["30"])[0]
    days = int(raw) if raw.isdigit() else 30
    body = payload(days=days, timezone_name=_timezone_name())
    return http_json_response(body, extra_headers=[("Cache-Control", "no-store")])


async def _handle_post(secret: str, tokens: Any, request: web.BaseRequest) -> web.StreamResponse:
    if request.method != "POST":
        return web.json_response({"error": "method_not_allowed"}, status=405)
    if not admin_authorized(secret, tokens, request):
        return web.json_response({"error": "unauthorized"}, status=401)
    if request.path != PREFIX + "/settings":
        return web.json_response({"error": "not_found"}, status=404)
    try:
        body = await _read_json(request)
    except DeviceError as exc:
        return web.json_response({"error": exc.code}, status=exc.status)
    with _lock:
        state = load_settings()
        if "prices" in body:
            if not isinstance(body["prices"], dict):
                return web.json_response({"error": "invalid_body"}, status=400)
            state["prices"] = _clean_prices(body["prices"])
        if "daily_cap_usd" in body:
            cap = body["daily_cap_usd"]
            if cap is not None and _num(cap) is None:
                return web.json_response({"error": "invalid_body"}, status=400)
            state["daily_cap_usd"] = _num(cap) or None
        if "alert_pct" in body:
            pct = _num(body["alert_pct"])
            if pct is None or not 1 <= pct <= 100:
                return web.json_response({"error": "invalid_body"}, status=400)
            state["alert_pct"] = pct
        save_settings(state)
    return web.json_response({"ok": True, **state})


def costs_post_handler(secret: str, tokens: Any, fallback: Any) -> Any:
    async def handler(request: web.BaseRequest) -> web.StreamResponse:
        path = request.path
        if path != PREFIX and not path.startswith(PREFIX + "/"):
            return await fallback(request)
        response = await _handle_post(secret, tokens, request)
        response.headers["Cache-Control"] = "no-store"
        response.force_close()
        return response

    return handler
