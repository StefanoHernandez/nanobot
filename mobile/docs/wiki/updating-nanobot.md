# Updating nanobot
This is the fork's upstream sync recipe as of 2026-10-27. ADR-004 applies: resolve hook conflicts, never move fork logic back into upstream files.

## 1. Branch and merge
1. `git fetch upstream origin`
2. Create `claude/upstream-sync-<YYYYMMDD>` from `origin/main`.
3. Merge `upstream/main` into that branch and fix conflicts (mostly `# Fork` hook sites in `nanobot/`).

## 2. Re-sync `mobile/vendor/`
Vendor must match the same upstream commit as the merge result.

```bash
TMP=$(mktemp -d)
git archive upstream/main | tar -x -C "$TMP"
SYNC_COMMIT=$(git rev-parse upstream/main) bash mobile/scripts/sync-nanobot.sh "$TMP"
rm -rf "$TMP"
```

Commit vendor `VERSION` and `mobile/src/platform/vendorVersion.ts` together with any platform fixes.

## 3. Full checks
From repo root:
- `pytest tests` (entire suite; gateway startup hooks break only in broad runs)
- `cd mobile && npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`

## 4. Fix breakage
- App: `mobile/src/platform/` and `mobile/src/state/` only — never `mobile/vendor/`.
- Server: prefer extending `nanobot/ext/` over editing upstream.
- Log surprises in `mobile/docs/wiki/known-issues.md` and `mobile/docs/wiki/log.md`.

## 5. Recurring traps (from past syncs)
- Tests that mock `shutil.which` must accept the `path=` keyword (upstream CLI resolution passes it).
- MCP connect fakes must accept `**kwargs` on `connect`/`call_tool` style mocks.
- Runtime config contract test: fork adds `MOBILE_ONLY_RUNTIME_PATHS` in `nanobot/ext/subagent_model.py` — expected payload keys differ from stock upstream.
- Vendor TypeScript API drift: fix shims in platform/state (for example `onRunStatus` callbacks that now receive a `RunState` object).
- After vendor sync, if types fail, grep upstream `webui/src/lib` for renamed exports before patching vendor.

## 6. CI
Open a PR from the sync branch. `upstream-sync.yml` automates weekly merges; manual runs follow the same steps.
