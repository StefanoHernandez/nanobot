# KB-C report

## Files changed
- `nanobot/ext/kanban_dispatch.py` — memory guard before `dispatch_once` in `kanban_dispatch_loop`
- `tests/ext/test_kanban_dispatch.py` — memory guard tests

## Brief checklist
| Item | Location |
| --- | --- |
| `MIN_AVAILABLE_MB = 400` with `# ponytail:` comment | `nanobot/ext/kanban_dispatch.py:33-34` |
| `_memory_available_mb() -> int \| None` reading `MemAvailable` from `/proc/meminfo` | `nanobot/ext/kanban_dispatch.py:190-211` |
| Skip tick when available below 400 MB (nothing claimed/failed) | `nanobot/ext/kanban_dispatch.py:243-251` |
| No `/proc/meminfo` or unreadable → dispatch unchanged | `nanobot/ext/kanban_dispatch.py:190-194`, `243-259` |
| Info log once when waiting, once when resuming | `nanobot/ext/kanban_dispatch.py:235`, `245-258` |
| Low memory → `dispatch_once` not called, task stays ready | `tests/ext/test_kanban_dispatch.py:460-478` |
| Enough memory → `dispatch_once` called | `tests/ext/test_kanban_dispatch.py:481-494` |
| Missing meminfo → `dispatch_once` called | `tests/ext/test_kanban_dispatch.py:497-510` |
| One waiting log across several low-memory ticks (+ resume) | `tests/ext/test_kanban_dispatch.py:522-547` |

## Deviations
- `_read_proc_meminfo()` helper wraps the file read so tests can exercise parsing without touching real `/proc/meminfo` (brief allows patched helper).
- `basedpyright` on touched files reports unresolved `loguru` import in this worktree environment (same as rest of `kanban_dispatch.py`); `ruff check` passes.

## Raw pytest (targeted)
```
........................
24 passed in 5.59s
```
(Command: `PYTHONPATH=<worktree> .venv/bin/python -m pytest -p no:cacheprovider -q tests/ext/test_kanban_dispatch.py`)

## Raw pytest (full `tests nanobot`)
```
12 failed, 10970 passed, 123 skipped, 4 warnings in 609.49s (0:10:09)
```
Failures (none in `tests/ext/test_kanban_dispatch.py`):
- `tests/agent/test_runner_governance.py` (3)
- `tests/channels/test_channel_setup.py::test_every_runtime_channel_field_has_a_webui_contract`
- `tests/channels/test_scheduled_delivery.py` (3)
- `tests/test_benchmark_session_storage.py::test_session_storage_benchmark_emits_auditable_windows_safe_result`
- `tests/tools/test_tool_validation.py::test_exec_rejects_home_path_without_home_directory`
- `tests/webui/test_cli_apps_api.py` (2)
- `tests/webui/test_remote_pairing.py::test_server_appends_restricted_key_and_revoke_preserves_existing`

README-known on this PC include `test_channel_setup`, `test_remote_pairing`, and `test_exec_rejects_home_path`; the other failures look environmental/flaky and are outside KB-C scope.

## ruff check
```
All checks passed!
```

## basedpyright (touched files)
Unresolved `loguru` import / unknown logger types on `kanobot/ext/kanban_dispatch.py` (environment); no new issues in test logic.

## Dependencies
None added.

## Verification limits
- Memory guard not exercised on real UNO Q hardware; threshold 400 MB not validated on board.
- Full suite not re-run after report commit (prior run captured above).
