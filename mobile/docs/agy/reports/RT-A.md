# RT-A report

## Files changed

- `nanobot/ext/router.py` (new)
- `nanobot/channels/websocket/runtime.py`
- `nanobot/webui/ws_http.py`
- `tests/ext/test_router.py` (new)
- `mobile/docs/agy/reports/RT-A.md` (this file)

No new dependencies.

## Brief checklist

| Item | Implementation |
| --- | --- |
| `ext_post_handler(channel, fallback)` builds today's POST chain | `nanobot/ext/router.py:53-76` |
| `dispatch_ext_get(server, request, got)` with `to_thread` for projects, `await` for search | `nanobot/ext/router.py:79-91` |
| Ordered tables per method; disjoint-prefix comment | `nanobot/ext/router.py:14-42` |
| `runtime.py` fork hook only | `nanobot/channels/websocket/runtime.py:720-724`, `BinaryHTTPBridge(binary_handler)` at `:737` |
| `ws_http.py` single GET hook | `nanobot/webui/ws_http.py:636-641` |
| Tests: every `/api/ext/<name>` prefix | `tests/ext/test_router.py` (`test_post_*`, `test_get_*` parametrized) |
| Tests: outside `/api/ext/` → fallback / `None` | `tests/ext/test_router.py:132-142`, `:158-167` |
| No changes under `nanobot/ext/` except `router.py` | verified |
| No `ruff format` | verified |

## Other fork hooks left in upstream files (unchanged by RT-A)

`nanobot/webui/ws_http.py`:

- `nanobot.ext.webapp.harden` on static SPA response (~654)
- Device bootstrap: `live_device_id`, `remember_device_tokens` (~748–805)
- `privileged_request` in `_allow_webui_package_install` and skill deletion (~1906, ~1954)

`nanobot/channels/websocket/runtime.py`: only the router POST hook (no other fork blocks).

## `git diff upstream/main --stat` (runtime.py + ws_http.py)

**Before RT-A** (inline ext blocks): `2 files changed, 153 insertions(+), 5 deletions(-)`

**After RT-A** (router hooks only, plus pre-existing fork hooks in ws_http.py): `2 files changed, 32 insertions(+), 5 deletions(-)`

## Checks

### pytest

```
12 failed, 10989 passed, 123 skipped, 4 warnings in 598.36s (0:09:58)
```

Failures (not introduced by RT-A; README-known or environment on this PC):

- `tests/channels/test_channel_setup.py::test_every_runtime_channel_field_has_a_webui_contract`
- `tests/webui/test_remote_pairing.py::test_server_appends_restricted_key_and_revoke_preserves_existing` (umask 002)
- `tests/tools/test_tool_validation.py::test_exec_rejects_home_path_without_home_directory` (flaky full run)
- `tests/webui/test_cli_apps_api.py::test_cli_apps_payload_keeps_loop_responsive[full|installed]`
- `tests/agent/test_runner_governance.py` (4 tests)
- `tests/channels/test_scheduled_delivery.py` (3 tests)
- `tests/test_benchmark_session_storage.py::test_session_storage_benchmark_emits_auditable_windows_safe_result`

Router + websocket + webui subset:

```
3 failed, 1484 passed in 42.99s
```

(same `cli_apps` + `remote_pairing` failures; all `tests/ext/test_router.py` and websocket route tests passed.)

Command: `PYTHONPATH=<worktree> ../nanobot/.venv/bin/python -m pytest -p no:cacheprovider -q tests nanobot`

### ruff check

```
All checks passed!
```

(on `nanobot/ext/router.py`, `runtime.py`, `ws_http.py`, `tests/ext/test_router.py`)

### basedpyright

```
0 errors, 0 warnings, 0 notes
```

```
../nanobot/.venv/bin/basedpyright --pythonpath ../nanobot/.venv/bin/python nanobot/ext/router.py nanobot/channels/websocket/runtime.py nanobot/webui/ws_http.py tests/ext/test_router.py
```

## Deviations

None.

## Not verified on device

N/A (server-only task).
