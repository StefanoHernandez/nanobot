# RT-A: one router for the fork's HTTP routes (owner: Cursor)

Branch `agy/RT-A`, from `origin/main`, **in your own worktree** (`../nanobot-agy-rt-a`). Follow `mobile/docs/agy/README.md` (full `pytest tests`). **Server only.** Other tasks run in parallel: KB-C (`nanobot/ext/kanban_dispatch.py`), DOC-A and CV-A (docs only). Do not touch their files.

## Why
The fork's routes are wired into two upstream files that change every week:
- `nanobot/channels/websocket/runtime.py` (`start()`, about line 720) builds the POST chain by hand: projects, then six handlers in a loop, then journal, automations and skill proposals, each with its own import and comment;
- `nanobot/webui/ws_http.py` (about line 635) has twelve GET blocks, one per module.

Each block is a place where an upstream edit can conflict, and the order looks meaningful from outside although every module owns a distinct prefix `/api/ext/<name>`. Goal: **one call per upstream file**, with the list of modules in one fork file.

## 1. `nanobot/ext/router.py` (new)
- `ext_post_handler(channel, fallback) -> handler`: builds today's POST chain exactly as `runtime.py` does now, with the same arguments (`secret`, `tokens`, `workspaces`, `cron`, `sessions`, `install_connection_tracking()`), on top of `fallback`. `channel` is the websocket channel object (`self` in `start()`), so the router reads `channel.config`, `channel.gateway` as the current code does.
- `async dispatch_ext_get(server, request, got) -> response | None`: runs today's GET dispatchers in today's order, keeping `asyncio.to_thread` for projects and `await` for search.
- One ordered table per method (module, factory) so adding a module is one line. Keep the order identical to today; write one comment saying that prefixes are disjoint, so the order only matters for speed.
- Do not change any `*_post_handler` / `dispatch_*_get` signature or behaviour.

## 2. Hooks in upstream files
- `runtime.py`: replace the whole fork block (imports, chain, journal/automations/skill proposals blocks) with:
  ```python
  # Fork (nanobot/ext/router.py): every /api/ext POST route.
  from nanobot.ext.router import ext_post_handler

  binary_handler = ext_post_handler(self, handle_binary)
  ```
  Keep `BinaryHTTPBridge(binary_handler)` where it is today.
- `ws_http.py`: replace the twelve GET blocks with one:
  ```python
  # Fork (nanobot/ext/router.py): every /api/ext GET route.
  from nanobot.ext.router import dispatch_ext_get

  response = await dispatch_ext_get(self, request, got)
  if response is not None:
      return response
  ```
- After the change, `git diff upstream/main -- nanobot/channels/websocket/runtime.py nanobot/webui/ws_http.py` must show only these hooks (plus any fork hook outside these two blocks that exists today: leave those alone, list them in the report).

## 3. Tests (`tests/ext/test_router.py`)
- Every `/api/ext/<name>` prefix that exists today (projects, devices, kanban, approvals, costs, prompts, backup, journal, automations, skills; GET also memory, system, search) reaches its module: patch each module's handler/dispatcher with a stub and assert the right one answered.
- A path outside `/api/ext/` reaches `fallback` (POST) / returns `None` (GET).
- Existing websocket route tests (`nanobot/channels/websocket/tests/`, `tests/webui/`) pass unchanged.

## Checks
- `.venv/bin/python -m pytest -p no:cacheprovider -q tests nanobot` (known failures: see README).
- `ruff check` and `basedpyright` on the files you touched.

## Do not
- Change URLs, auth, response bodies, or any module under `nanobot/ext/` other than the new `router.py`.
- Touch `kanban_dispatch.py`, `mobile/**`, `mobile/vendor/**`. Run `ruff format`.

## Report
`mobile/docs/agy/reports/RT-A.md`: files, raw pytest summary, the `git diff upstream/main --stat` for the two upstream files before and after (lines of fork diff), deviations.

Commit (no `Co-Authored-By`), push `agy/RT-A`, give the last hash. Do not merge.
