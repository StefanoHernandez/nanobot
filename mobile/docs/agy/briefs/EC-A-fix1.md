# EC-A-fix1: review fixes (owner: agy)

Same branch `agy/EC-A`, same worktree. Follow `mobile/docs/agy/README.md` (full pytest). Do not merge `main`, do not rebase.

## 1. Enabling an installed feature now needs full power (MED, regression)
`settings_system.py` `_features_action`: the new `if action == "enable" and not install_only and not request.local_browser` returns 403. On `main` enabling an already installed feature was allowed; only package **install** depended on `local_browser`. Remove that check; keep `remote_install_disabled` (and `full_power_required` only where `main` already refused). Test: non-privileged enable of an installed feature → 200.

## 2. Secret scrubbing is incomplete (MED)
`scrub_mcp_error` (`nanobot/agent/tools/mcp.py`) misses `X-API-Key: abc`, `token: abc` (space after colon), JSON `"api_key": "abc"`, `Authorization: Basic …`, and bare values like `ctx7sk-…`. And `stderr_tail[-200:]` is cut **before** scrubbing.
- First replace every known secret value of that server (`cfg.headers` values, `cfg.env` values, the value after any `--*key*`/`--*token*` arg, URL query values) with `[redacted]` (plain `str.replace`, values ≥ 4 chars); then the regexes, allowing `\s*` and an optional quote after `[=:]`; scrub first, cut after.
- Tests for each form above and for a value present only in `cfg.env`.

## 3. npx hint (MED)
Set `npx_cache_broken` only on `ERR_MODULE_NOT_FOUND`, or on `npm error`/`npm ERR!` (case-insensitive) together with `_npx`. Drop the server-side Italian `hint_message`: the app shows the text from the code; make sure the app text includes `npm cache clean --force`. Test the detection from a real stderr string (not by calling `record_mcp_failure` yourself).

## 4. Child stderr no longer reaches the log (MED)
After a stdio failure, log the (scrubbed) stderr tail at warning level.

## 5. Preset over an entry with no explicit type (MED)
`_materialize_server`: `existing.type` may be `None` (auto-detected). Compare the inferred type: `existing.type or ("stdio" if existing.command else "streamableHttp")`. When transports match, keep the saved field values (the saved key must survive a re-enable without retyping). Tests: untyped stdio entry keeps args/env/cwd; preset over an HTTP entry that has stray `args` (the arduino case) clears them.

## 6. Small ones (LOW)
- Show the last failure only while the server is configured and enabled; drop the entry when a server is removed.
- `_resolved_cli_search_path`: do not cache a failed/timed-out lookup (cache only success); use the same search path for `shutil.which("npm"/"uv")`; drop the `TypeError` fallback in `_which` and fix the test mocks instead.
- `optional_features.py`: also map Debian's "ensurepip is disabled" to `unsupported_install_env`; detect uv tool envs from `sys.prefix` (e.g. a `uv-receipt.toml` next to it) instead of `"uv" in sys.executable`.
- App `McpTab.tsx`/`CliAppsTab.tsx`: show the lock only after a refusal with those codes (or when the payload says so), not on every non-installed item; replace the `any` casts with typed fields.
- Tests: fallback path equals the plain `PATH`; `uv tool dir --bin` success; screen-level test that `PluginsTab` and `McpSheet` show the reason.
- Report: fix the stdio→HTTP survey (verify each URL from the vendor's docs; GitHub, Linear, Notion, Sentry publish official remote MCP endpoints; if you cannot verify, say "not verified").

## Checks, Do not, Report
As in `EC-A.md`. Append a "fix1" section to `mobile/docs/agy/reports/EC-A.md`. Commit (no `Co-Authored-By`), push `agy/EC-A`, give the last hash.
