"""Tests for models.dev catalog fetching and model enrichment (nanobot/ext/model_info.py)."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from unittest.mock import Mock

import pytest

import nanobot.ext.model_info as mi


@pytest.fixture(autouse=True)
def isolated_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    cache_path = tmp_path / "cache" / "models-dev.json"
    monkeypatch.setattr(mi, "_cache_file_path", lambda: cache_path)
    monkeypatch.setattr(mi, "_memory_cache", None)
    return cache_path


@pytest.fixture(autouse=True)
def reset_failure_time(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(mi, "_last_failure_time", None)


def make_fake_catalog() -> dict[str, Any]:
    return {
        "opencode-go": {
            "models": {
                "glm-5.3": {
                    "id": "glm-5.3",
                    "name": "GLM-5.3",
                    "limit": {"context": 1000000, "output": 131072},
                    "reasoning": True,
                    "reasoning_options": [
                        {"type": "effort", "values": ["low", "high", "max"]}
                    ],
                },
                "toggle-model": {
                    "id": "toggle-model",
                    "name": "Toggle Model",
                    "limit": {"context": 256000, "output": 8192},
                    "reasoning": True,
                    "reasoning_options": [{"type": "toggle"}],
                },
            }
        },
        "anthropic": {
            "models": {
                "claude-sonnet-4-5": {
                    "id": "claude-sonnet-4-5",
                    "name": "Claude Sonnet 4.5",
                    "limit": {"context": 200000, "output": 64000},
                    "reasoning": True,
                    "reasoning_options": [
                        {"type": "effort", "values": ["low", "medium", "high"]}
                    ],
                }
            }
        },
    }


class FakeResponse:
    def __init__(self, data: Any, status_code: int = 200) -> None:
        self._data = data
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self) -> Any:
        return self._data


def test_context_and_efforts_are_filled_for_matching_id():
    catalog = make_fake_catalog()
    rows = [{"id": "glm-5.3", "label": "glm-5.3", "context_window": None}]
    enriched = mi.enrich_rows("opencode_go", rows, catalog)
    assert len(enriched) == 1
    assert enriched[0]["id"] == "glm-5.3"
    assert enriched[0]["context_window"] == 1000000
    assert enriched[0]["max_output_tokens"] == 131072
    assert enriched[0]["reasoning_efforts"] == ["low", "high", "max"]


def test_row_that_already_has_context_window_keeps_it():
    catalog = make_fake_catalog()
    rows = [{"id": "glm-5.3", "label": "glm-5.3", "context_window": 500000}]
    enriched = mi.enrich_rows("opencode_go", rows, catalog)
    assert len(enriched) == 1
    assert enriched[0]["context_window"] == 500000
    assert enriched[0]["reasoning_efforts"] == ["low", "high", "max"]


def test_toggle_only_models_get_no_efforts():
    catalog = make_fake_catalog()
    rows = [{"id": "toggle-model", "label": "toggle-model", "context_window": None}]
    enriched = mi.enrich_rows("opencode_go", rows, catalog)
    assert len(enriched) == 1
    assert enriched[0]["context_window"] == 256000
    assert "reasoning_efforts" not in enriched[0] or enriched[0].get("reasoning_efforts") == []


def test_unknown_provider_is_unchanged():
    catalog = make_fake_catalog()
    rows = [{"id": "glm-5.3", "label": "glm-5.3", "context_window": None}]
    enriched = mi.enrich_rows("unknown_provider_xyz", rows, catalog)
    assert enriched == rows


def test_cache_is_used_within_24h_and_refreshed_after(isolated_cache: Path, monkeypatch: pytest.MonkeyPatch):
    catalog = make_fake_catalog()
    call_count = 0

    def fake_http_get(url: str, **kwargs):
        nonlocal call_count
        call_count += 1
        assert url == "https://models.dev/api.json"
        assert kwargs.get("headers") == {"Accept": "application/json"}
        assert kwargs.get("timeout") == 10.0
        return FakeResponse(catalog)

    current_time = 1000000.0
    monkeypatch.setattr(mi.time, "time", lambda: current_time)

    # First call: fetches from network and writes cache
    data1 = mi.models_dev_catalog(fake_http_get)
    assert data1 == catalog
    assert call_count == 1
    assert isolated_cache.exists()

    # Second call within 24h: returns memory/disk cache without network
    current_time += 3600.0  # 1 hour later
    data2 = mi.models_dev_catalog(fake_http_get)
    assert data2 == catalog
    assert call_count == 1

    # Reset memory cache to force reading from disk cache within 24h
    monkeypatch.setattr(mi, "_memory_cache", None)
    data3 = mi.models_dev_catalog(fake_http_get)
    assert data3 == catalog
    assert call_count == 1

    # Time advanced beyond 24h (e.g. 25 hours later): refreshes cache
    current_time += 25 * 3600.0
    new_mtime = current_time - (25 * 3600.0)
    os.utime(isolated_cache, (new_mtime, new_mtime))
    monkeypatch.setattr(mi, "_memory_cache", None)

    data4 = mi.models_dev_catalog(fake_http_get)
    assert data4 == catalog
    assert call_count == 2


def test_network_error_with_stale_cache_uses_cache_and_without_cache_returns_unchanged(
    isolated_cache: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    catalog = make_fake_catalog()
    # Write a stale cache file
    isolated_cache.parent.mkdir(parents=True, exist_ok=True)
    isolated_cache.write_text(json.dumps(catalog), encoding="utf-8")

    current_time = 2000000.0
    monkeypatch.setattr(mi.time, "time", lambda: current_time)

    def failing_http_get(url: str, **kwargs):
        raise RuntimeError("network failure")

    # Network error with stale cache -> returns stale catalog from file
    res = mi.models_dev_catalog(failing_http_get)
    assert res == catalog

    # Enriched rows work with stale cache
    rows = [{"id": "glm-5.3", "context_window": None}]
    enriched = mi.enrich_rows("opencode_go", rows, res)
    assert enriched[0]["context_window"] == 1000000

    # Remove cache file and reset memory cache: network error without cache -> returns {}
    isolated_cache.unlink()
    monkeypatch.setattr(mi, "_memory_cache", None)

    res_empty = mi.models_dev_catalog(failing_http_get)
    assert res_empty == {}

    # With empty catalog, rows are returned unchanged
    enriched_unchanged = mi.enrich_rows("opencode_go", rows, res_empty)
    assert enriched_unchanged == rows


def test_unsupported_provider_models_payload(monkeypatch: pytest.MonkeyPatch):
    catalog = make_fake_catalog()
    fake_http_get = Mock(return_value=FakeResponse(catalog))
    base_payload = {
        "provider": "anthropic",
        "label": "Anthropic",
        "catalog_kind": "unsupported",
        "models": [],
        "model_count": 0,
        "message": None,
        "fetched_at": 123456.0,
    }

    # For mapped unsupported provider (Anthropic)
    result = mi.unsupported_provider_models_payload("anthropic", base_payload, http_get=fake_http_get)
    assert result is not None
    assert result["status"] == "available"
    assert result["source"] == "models.dev"
    assert result["model_count"] == 1
    assert result["models"][0]["id"] == "claude-sonnet-4-5"
    assert result["models"][0]["label"] == "Claude Sonnet 4.5"
    assert result["models"][0]["context_window"] == 200000
    assert result["models"][0]["reasoning_efforts"] == ["low", "medium", "high"]

    # For unknown unsupported provider
    result_unknown = mi.unsupported_provider_models_payload("unsupported_other", base_payload, http_get=fake_http_get)
    assert result_unknown is None


def test_failed_fetch_is_not_retried_for_ten_minutes(monkeypatch: pytest.MonkeyPatch):
    calls: list[str] = []

    def failing_http_get(url: str, **kwargs):
        calls.append(url)
        raise RuntimeError("offline")

    current_time = 5000000.0
    monkeypatch.setattr(mi.time, "time", lambda: current_time)

    assert mi.models_dev_catalog(failing_http_get) == {}
    assert len(calls) == 1

    current_time += 9 * 60.0
    assert mi.models_dev_catalog(failing_http_get) == {}
    assert len(calls) == 1  # still inside the failure window: no network

    current_time += 2 * 60.0
    assert mi.models_dev_catalog(failing_http_get) == {}
    assert len(calls) == 2  # window over: tries again


def test_a_success_after_a_failure_clears_the_failure_window(monkeypatch: pytest.MonkeyPatch):
    catalog = make_fake_catalog()
    responses: list[Any] = [RuntimeError("offline"), FakeResponse(catalog)]

    def http_get(url: str, **kwargs):
        item = responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    current_time = 6000000.0
    monkeypatch.setattr(mi.time, "time", lambda: current_time)
    assert mi.models_dev_catalog(http_get) == {}
    current_time += 11 * 60.0
    assert mi.models_dev_catalog(http_get) == catalog
    assert mi._last_failure_time is None


def test_empty_catalog_is_not_cached(isolated_cache: Path, monkeypatch: pytest.MonkeyPatch):
    fake_http_get = Mock(return_value=FakeResponse({}))
    current_time = 7000000.0
    monkeypatch.setattr(mi.time, "time", lambda: current_time)

    assert mi.models_dev_catalog(fake_http_get) == {}
    assert not isolated_cache.exists()
    assert mi._memory_cache is None

    # The empty answer counts as a failure: no new request for 10 minutes, then it asks again.
    assert mi.models_dev_catalog(fake_http_get) == {}
    assert fake_http_get.call_count == 1
    current_time += 11 * 60.0
    mi.models_dev_catalog(fake_http_get)
    assert fake_http_get.call_count == 2


def test_cache_is_written_atomically_through_a_temp_file(isolated_cache: Path, monkeypatch: pytest.MonkeyPatch):
    catalog = make_fake_catalog()
    replaced: list[tuple[str, str]] = []
    real_replace = os.replace

    def spy_replace(src: Any, dst: Any) -> None:
        assert Path(src).parent == isolated_cache.parent
        assert Path(src) != isolated_cache
        assert not isolated_cache.exists()  # the final path only appears with the rename
        replaced.append((str(src), str(dst)))
        real_replace(src, dst)

    monkeypatch.setattr(mi.os, "replace", spy_replace)
    assert mi.models_dev_catalog(lambda url, **kw: FakeResponse(catalog)) == catalog

    assert replaced == [(replaced[0][0], str(isolated_cache))]
    assert json.loads(isolated_cache.read_text(encoding="utf-8")) == catalog
    assert list(isolated_cache.parent.iterdir()) == [isolated_cache]


def test_failed_atomic_write_removes_the_temp_file(isolated_cache: Path, monkeypatch: pytest.MonkeyPatch):
    catalog = make_fake_catalog()

    def failing_replace(src: Any, dst: Any) -> None:
        raise OSError("disk full")

    monkeypatch.setattr(mi.os, "replace", failing_replace)
    assert mi.models_dev_catalog(lambda url, **kw: FakeResponse(catalog)) == catalog

    assert not isolated_cache.exists()
    assert list(isolated_cache.parent.iterdir()) == []


def test_failure_window_belongs_to_its_cache_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    catalog = make_fake_catalog()
    monkeypatch.setattr(mi.time, "time", lambda: 8000000.0)

    def failing_http_get(url: str, **kwargs):
        raise RuntimeError("offline")

    assert mi.models_dev_catalog(failing_http_get) == {}

    other_cache = tmp_path / "other" / "models-dev.json"
    monkeypatch.setattr(mi, "_cache_file_path", lambda: other_cache)
    assert mi.models_dev_catalog(lambda url, **kw: FakeResponse(catalog)) == catalog
