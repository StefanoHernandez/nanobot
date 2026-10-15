"""Machine dashboard for the app (fork extension): CPU, RAM, temperature, disk, uptime, log errors.

Linux only (the server is an Arduino UNO Q): reads /proc and /sys directly, no extra
dependency. Restart is not here; the app reuses the existing settings restart.
"""

from __future__ import annotations

import os
import shutil
import threading
import time
from pathlib import Path
from typing import Any

from websockets.http11 import Request as WsRequest
from websockets.http11 import Response

from nanobot.ext.devices import router_admin_authorized
from nanobot.webui.http_utils import http_error, http_json_response

PREFIX = "/api/ext/system"
LOG_TAIL_BYTES = 256 * 1024
MAX_LOG_ERRORS = 20
MAX_LOG_LINE = 300
_STARTED_AT = time.time()

_cpu_lock = threading.Lock()
_cpu_prev: tuple[int, int] | None = None  # (idle, total) jiffies at the previous read


def _read(path: str | Path) -> str | None:
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def cpu_percent(stat_text: str | None = None) -> float | None:
    """CPU busy % since the previous call (the app polls). None on the first call or off Linux."""
    global _cpu_prev
    text = stat_text if stat_text is not None else _read("/proc/stat")
    if not text or not text.startswith("cpu "):
        return None
    fields = [int(x) for x in text.splitlines()[0].split()[1:]]
    idle = fields[3] + (fields[4] if len(fields) > 4 else 0)  # idle + iowait
    total = sum(fields)
    with _cpu_lock:
        prev, _cpu_prev = _cpu_prev, (idle, total)
    if prev is None or total <= prev[1]:
        return None
    return round(100.0 * (1 - (idle - prev[0]) / (total - prev[1])), 1)


def memory(meminfo_text: str | None = None) -> dict[str, int] | None:
    text = meminfo_text if meminfo_text is not None else _read("/proc/meminfo")
    if not text:
        return None
    kb: dict[str, int] = {}
    for line in text.splitlines():
        name, _, rest = line.partition(":")
        parts = rest.split()
        if parts and parts[0].isdigit():
            kb[name] = int(parts[0])
    if "MemTotal" not in kb:
        return None
    available = kb.get("MemAvailable", kb.get("MemFree", 0))
    return {
        "total_mb": kb["MemTotal"] // 1024,
        "used_mb": (kb["MemTotal"] - available) // 1024,
        "swap_total_mb": kb.get("SwapTotal", 0) // 1024,
        "swap_used_mb": (kb.get("SwapTotal", 0) - kb.get("SwapFree", 0)) // 1024,
    }


def temperature_c(thermal_root: str | Path = "/sys/class/thermal") -> float | None:
    """Hottest thermal zone, in °C."""
    best: float | None = None
    try:
        zones = sorted(Path(thermal_root).glob("thermal_zone*"))
    except OSError:
        return None
    for zone in zones:
        raw = _read(zone / "temp")
        if raw and raw.strip().lstrip("-").isdigit():
            value = int(raw.strip()) / 1000
            if -40 < value < 150:
                best = value if best is None else max(best, value)
    return round(best, 1) if best is not None else None


def disk(path: str | Path) -> dict[str, int] | None:
    try:
        usage = shutil.disk_usage(path)
    except OSError:
        return None
    return {"total_gb": usage.total // 1024**3, "used_gb": (usage.total - usage.free) // 1024**3, "free_gb": usage.free // 1024**3}


def uptime_s(uptime_text: str | None = None) -> int | None:
    text = uptime_text if uptime_text is not None else _read("/proc/uptime")
    try:
        return int(float(text.split()[0])) if text else None
    except (ValueError, IndexError):
        return None


def log_errors(log_path: Path) -> list[str]:
    """Last ERROR/CRITICAL lines of the gateway log (truncated). Never the whole log."""
    try:
        with log_path.open("rb") as fh:
            fh.seek(0, os.SEEK_END)
            size = fh.tell()
            fh.seek(max(0, size - LOG_TAIL_BYTES))
            tail = fh.read().decode("utf-8", errors="replace")
    except OSError:
        return []
    hits = [line for line in tail.splitlines() if "| ERROR" in line or "| CRITICAL" in line]
    return [line[:MAX_LOG_LINE] for line in hits[-MAX_LOG_ERRORS:]]


def snapshot() -> dict[str, Any]:
    from nanobot.config.paths import get_logs_dir

    load = os.getloadavg() if hasattr(os, "getloadavg") else None
    return {
        "cpu_percent": cpu_percent(),
        "load": [round(x, 2) for x in load] if load else None,
        "cores": os.cpu_count(),
        "memory": memory(),
        "temperature_c": temperature_c(),
        "disk": disk(Path.home()),
        "uptime_s": uptime_s(),
        "gateway_uptime_s": int(time.time() - _STARTED_AT),
        "log_errors": log_errors(get_logs_dir() / "gateway.log"),
    }


def dispatch_system_get(router: Any, request: WsRequest, got: str) -> Response | None:
    if got != PREFIX:
        return None
    secret = router.config.token_issue_secret.strip() or router.config.token.strip()
    if not router_admin_authorized(secret, router, request):
        return http_error(401, "Unauthorized")
    return http_json_response(snapshot(), extra_headers=[("Cache-Control", "no-store")])
