"""Fork extension: model info enrichment and catalog fallback from models.dev."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, cast

from nanobot.config.paths import get_data_dir

# In-memory cache: (timestamp, cache_path, catalog_data)
_memory_cache: tuple[float, Path, dict[str, Any]] | None = None

# Verified provider spec name -> models.dev provider id mapping.
# 'xai' was dropped because nanobot registers only 'xai_grok' (OAuth hybrid with 'xai-grok/*' model ids).
MODELS_DEV_PROVIDER_MAP: dict[str, str] = {
    "opencode_go": "opencode-go",
    "opencode": "opencode",
    "opencode_zen": "opencode",
    "openai": "openai",
    "anthropic": "anthropic",
    "gemini": "google",
    "deepseek": "deepseek",
    "openrouter": "openrouter",
    "mistral": "mistral",
    "groq": "groq",
    "moonshot": "moonshotai",
    "zhipu": "zhipuai",
    "dashscope": "alibaba",
    "minimax": "minimax",
}

CACHE_TTL_SECONDS: float = 24 * 3600.0


def _cache_file_path() -> Path:
    raw = os.environ.get("NANOBOT_MODELS_DEV_CACHE")
    if raw:
        return Path(raw)
    return get_data_dir() / "cache" / "models-dev.json"


def _as_dict(val: object) -> dict[str, Any] | None:
    if isinstance(val, dict):
        return cast(dict[str, Any], val)
    return None


def models_dev_catalog(http_get: Any) -> dict[str, Any]:
    """Fetch https://models.dev/api.json and cache it in memory and on disk for 24 h.

    On network error, uses the stale file if there is one, otherwise {}; never raises.
    """
    global _memory_cache
    now = time.time()
    cache_path = _cache_file_path()

    # 1. Use fresh in-memory cache if available (< 24 h)
    if _memory_cache is not None:
        cached_time, cached_path, cached_data = _memory_cache
        if cached_path == cache_path and now - cached_time < CACHE_TTL_SECONDS:
            return cached_data

    # 2. Use fresh disk cache if available (< 24 h)
    if cache_path.is_file():
        try:
            mtime = cache_path.stat().st_mtime
            if now - mtime < CACHE_TTL_SECONDS:
                raw = cast(object, json.loads(cache_path.read_text(encoding="utf-8")))
                data = _as_dict(raw)
                if data is not None:
                    _memory_cache = (mtime, cache_path, data)
                    return data
        except Exception:
            pass

    # 3. Refresh from models.dev
    try:
        response: Any = http_get(
            "https://models.dev/api.json",
            headers={"Accept": "application/json"},
            timeout=10.0,
        )
        if hasattr(response, "raise_for_status"):
            response.raise_for_status()
        raw_body: object = response.json() if hasattr(response, "json") else json.loads(str(getattr(response, "text", "{}")))
        data = _as_dict(raw_body)
        if data is not None:
            _memory_cache = (now, cache_path, data)
            try:
                cache_path.parent.mkdir(parents=True, exist_ok=True)
                cache_path.write_text(json.dumps(data), encoding="utf-8")
            except Exception:
                pass
            return data
    except Exception:
        pass

    # 4. On network/fetch error, fall back to stale cache file if present
    if cache_path.is_file():
        try:
            raw_stale = cast(object, json.loads(cache_path.read_text(encoding="utf-8")))
            stale_data = _as_dict(raw_stale)
            if stale_data is not None:
                _memory_cache = (cache_path.stat().st_mtime, cache_path, stale_data)
                return stale_data
        except Exception:
            pass

    # 5. Fall back to stale memory cache if present
    if _memory_cache is not None and _memory_cache[1] == cache_path:
        return _memory_cache[2]

    return {}


def _extract_reasoning_efforts(info: dict[str, Any]) -> list[str] | None:
    raw_options: object = info.get("reasoning_options")
    if not isinstance(raw_options, list):
        return None
    for opt_obj in cast(list[object], raw_options):
        opt = _as_dict(opt_obj)
        if opt is not None and opt.get("type") == "effort":
            raw_values: object = opt.get("values")
            if isinstance(raw_values, list):
                efforts = [v for v in cast(list[object], raw_values) if isinstance(v, str)]
                if efforts:
                    return efforts
    return None


def enrich_rows(
    provider_name: str,
    rows: list[dict[str, Any]],
    catalog: dict[str, Any],
) -> list[dict[str, Any]]:
    """Enrich model rows with context_window, max_output_tokens, and reasoning_efforts."""
    mdev_provider = (
        MODELS_DEV_PROVIDER_MAP.get(provider_name)
        or MODELS_DEV_PROVIDER_MAP.get(provider_name.replace("-", "_"))
    )
    if not mdev_provider:
        return rows

    raw_provider_data: object = catalog.get(mdev_provider)
    provider_data = _as_dict(raw_provider_data)
    if provider_data is None:
        return rows

    raw_models: object = provider_data.get("models")
    catalog_models = _as_dict(raw_models)
    if catalog_models is None:
        return rows

    enriched: list[dict[str, Any]] = []
    for raw_row in rows:
        row = _as_dict(raw_row)
        if row is None:
            enriched.append(raw_row)
            continue
        model_id = row.get("id")
        if not isinstance(model_id, str):
            enriched.append(row)
            continue

        raw_info: object = catalog_models.get(model_id)
        model_info = _as_dict(raw_info)
        if model_info is None:
            enriched.append(row)
            continue

        updated = dict(row)
        raw_limit: object = model_info.get("limit")
        limit = _as_dict(raw_limit)
        if limit is not None:
            context: object = limit.get("context")
            if updated.get("context_window") is None and isinstance(context, int) and context > 0:
                updated["context_window"] = context

            output: object = limit.get("output")
            if isinstance(output, int) and output > 0:
                updated["max_output_tokens"] = output

        if not updated.get("reasoning_efforts"):
            efforts = _extract_reasoning_efforts(model_info)
            if efforts is not None:
                updated["reasoning_efforts"] = efforts

        enriched.append(updated)

    return enriched


def enrich_provider_rows(
    provider_name: str,
    rows: list[dict[str, Any]],
    *,
    http_get: Any,
) -> list[dict[str, Any]]:
    """Helper to load models.dev catalog and enrich provider rows."""
    catalog = models_dev_catalog(http_get)
    return enrich_rows(provider_name, rows, catalog)


def unsupported_provider_models_payload(
    provider_name: str,
    base_payload: dict[str, Any],
    *,
    http_get: Any,
) -> dict[str, Any] | None:
    """Return models.dev model catalog for an unsupported provider if mapped."""
    mdev_provider = (
        MODELS_DEV_PROVIDER_MAP.get(provider_name)
        or MODELS_DEV_PROVIDER_MAP.get(provider_name.replace("-", "_"))
    )
    if not mdev_provider:
        return None

    catalog = models_dev_catalog(http_get)
    raw_provider_data: object = catalog.get(mdev_provider)
    provider_data = _as_dict(raw_provider_data)
    if provider_data is None:
        return None

    raw_models: object = provider_data.get("models")
    catalog_models = _as_dict(raw_models)
    if catalog_models is None or not catalog_models:
        return None

    rows: list[dict[str, Any]] = []
    for model_id, raw_info in catalog_models.items():
        info = _as_dict(raw_info)
        if info is None:
            continue
        raw_name: object = info.get("name")
        label = raw_name if isinstance(raw_name, str) else None
        raw_limit: object = info.get("limit")
        limit = _as_dict(raw_limit)
        raw_ctx = limit.get("context") if limit is not None else None
        ctx = raw_ctx if isinstance(raw_ctx, int) else None
        efforts = _extract_reasoning_efforts(info) or []

        row_item: dict[str, Any] = {
            "id": model_id,
            "label": label,
            "context_window": ctx,
            "reasoning_efforts": efforts,
        }
        if limit is not None:
            raw_out = limit.get("output")
            if isinstance(raw_out, int):
                row_item["max_output_tokens"] = raw_out
        rows.append(row_item)

    return {
        **base_payload,
        "status": "available",
        "source": "models.dev",
        "models": rows,
        "model_count": len(rows),
    }
