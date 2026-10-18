# SK-A report

Branch `agy/SK-A`, from `origin/main` (`b3d267e46`). Not merged.

## Files

- `nanobot/ext/skill_proposals.py` — proposal storage, CRUD, validation, `WriteProposalTool`, `propose_from_chat`, nightly scout job, route dispatchers
- `tests/ext/test_skill_proposals.py` — unit & integration tests for skill proposals and scout
- `mobile/src/screens/ecosystem/skills/proposalsApi.ts` — client API helpers and types for proposals and scout
- `mobile/src/screens/ecosystem/skills/SkillProposalRow.tsx` — proposal card component with badge ("Proposta" / "Aggiornamento"), summary, reason and date
- `mobile/src/screens/ecosystem/skills/SkillProposalSheet.tsx` — detail modal with markdown render, reason, "Attiva" and "Scarta" actions
- `mobile/src/screens/ecosystem/skills/SkillsScreen.tsx` — proposed skills section above installed list and nightly scout switch
- `mobile/src/screens/thread/ThreadScreen.tsx` — "Crea skill da questa chat" thread menu action with loading spinner and toasts
- `mobile/src/i18n/it.json`, `mobile/src/i18n/en.json` — translations for proposals, scout switch, and thread action
- `mobile/test/screens/skill-proposals.test.tsx` — Jest tests for proposals section, activate/reject, update badge, and thread menu action
- `mobile/docs/agy/reports/SK-A.md`

### Upstream hooks

- `nanobot/webui/ws_http.py` — `# Fork` GET `/api/ext/skills/proposals` and GET `/api/ext/skills/proposals/<name>`
- `nanobot/channels/websocket/runtime.py` — `# Fork` POST `/api/ext/skills/proposals/<name>/activate`, reject, propose, and GET/POST `/api/ext/skills/scout`
- `nanobot/cli/gateway_runtime.py` — `# Fork` system cron runner for `skill-scout`, startup job registration, and `bind_skill_proposals_turn`

No new dependencies added. `mobile/vendor/**` was not edited.

## The prompt used

In `nanobot/ext/skill_proposals.py`, the ephemeral agent turn runs with the following prompt instruction:

`You are an expert at distilling reusable procedures into nanobot skills. Analyze the conversation history below and determine whether it contains a reusable, step-by-step procedure, workflow, or pattern. If yes, call the write_proposal tool with a concise kebab-case name, a 1-2 line summary, a concise explanation in reason, and the full SKILL.md content following standard nanobot SKILL.md conventions. If no reusable procedure is found, simply output why without calling the tool.`

The scout job uses a similar prompt targeting recent `memory/history.jsonl` entries since the `.cursor` position, with a hard cap of at most 2 proposals per night.

## Checks

```
.venv/bin/python -m pytest -p no:cacheprovider tests/ext/test_skill_proposals.py
============================== 8 passed in 0.77s ===============================

.venv/bin/ruff check nanobot/ext/skill_proposals.py nanobot/webui/ws_http.py nanobot/channels/websocket/runtime.py nanobot/cli/gateway_runtime.py tests/ext/test_skill_proposals.py
All checks passed!

.venv/bin/basedpyright nanobot/ext/skill_proposals.py nanobot/webui/ws_http.py nanobot/channels/websocket/runtime.py nanobot/cli/gateway_runtime.py tests/ext/test_skill_proposals.py
0 errors, 0 warnings, 0 notes

cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest
Test Suites: 130 passed, 130 total
Tests:       1037 passed, 1037 total
Snapshots:   0 total
Time:        17.255 s

cd mobile && npx tsc --noEmit
(exit code 0)

cd mobile && npx npx expo export --platform android --output-dir /tmp/nb-export
› android bundles (1):
_expo/static/js/android/index-fde594c722bdc27db6bbe6ea32e51ba5.hbc (8MB)
Exported: /tmp/nb-export

Full pytest suite:
.venv/bin/python -m pytest -p no:cacheprovider tests
8064 passed, 58 skipped (7 pre-existing failures on PC: test_channel_setup matrix dep, test_scheduled_delivery, test_benchmark_session_storage missing uv.lock, test_exec_rejects_home_path, test_server_appends_restricted_key umask 002)
```

## Deviations

None. All items specified in `mobile/docs/agy/briefs/SK-A.md` were implemented according to specifications.

## What needs phone / Arduino to check

- Live invocation of LLM turn against actual model provider to test extraction quality on real conversations.
- Nightly cron trigger of `skill-scout` running on the live host/Arduino with real `memory/history.jsonl` records.
- Verification of native touch handling, scrolling, and theme rendering across dark/light mode on physical Android device.
