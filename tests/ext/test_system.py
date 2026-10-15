"""Machine dashboard readings from /proc-style text."""

from __future__ import annotations

from nanobot.ext import system as sysx


def test_cpu_percent_is_a_delta_between_reads(monkeypatch):
    monkeypatch.setattr(sysx, "_cpu_prev", None)
    assert sysx.cpu_percent("cpu  100 0 100 800 0 0 0 0 0 0\n") is None  # first read: no delta
    # +100 busy, +100 idle since the previous read -> 50 %
    assert sysx.cpu_percent("cpu  150 0 150 900 0 0 0 0 0 0\n") == 50.0


def test_memory_uses_available_not_free():
    text = "MemTotal:  4000000 kB\nMemFree:  100000 kB\nMemAvailable: 2000000 kB\nSwapTotal: 1048576 kB\nSwapFree: 524288 kB\n"
    assert sysx.memory(text) == {"total_mb": 3906, "used_mb": 1953, "swap_total_mb": 1024, "swap_used_mb": 512}


def test_temperature_takes_the_hottest_zone(tmp_path):
    for i, milli in enumerate(["45000", "61500", "garbage"]):
        zone = tmp_path / f"thermal_zone{i}"
        zone.mkdir()
        (zone / "temp").write_text(milli)
    assert sysx.temperature_c(tmp_path) == 61.5
    assert sysx.temperature_c(tmp_path / "missing") is None


def test_log_errors_returns_only_recent_error_lines(tmp_path):
    log = tmp_path / "gateway.log"
    lines = [f"2026-10-15 10:00:{i:02d} | INFO     | ok {i}" for i in range(50)]
    lines += [f"2026-10-15 10:01:{i:02d} | ERROR    | boom {i} " + "x" * 400 for i in range(30)]
    log.write_text("\n".join(lines))
    errors = sysx.log_errors(log)
    assert len(errors) == sysx.MAX_LOG_ERRORS
    assert all("| ERROR" in e and len(e) <= sysx.MAX_LOG_LINE for e in errors)
    assert "boom 29" in errors[-1]
    assert sysx.log_errors(tmp_path / "none.log") == []


def test_uptime_parses_proc_uptime():
    assert sysx.uptime_s("12345.67 54321.00\n") == 12345
    assert sysx.uptime_s("") is None
