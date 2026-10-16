# JR-A report

Branch `grok/JR-A`, from `origin/main` (`f26179f6e`). Not merged.

## Files

- `nanobot/ext/journal.py` — collect a day, prompt, settings, files, HTTP, the cron job
- `tests/ext/test_journal.py`
- `mobile/src/ecosystem/journal.ts`
- `mobile/src/screens/ecosystem/memory/MemoryScreen.tsx`
- `mobile/src/i18n/it.json`, `mobile/src/i18n/en.json`
- `mobile/test/ecosystem/journal.test.ts`
- `mobile/test/screens/ecosystem-memory.test.tsx`
- `mobile/docs/agy/reports/JR-A.md`

### Upstream hooks

- `nanobot/webui/ws_http.py` — `# Fork` GET `/api/ext/journal`
- `nanobot/channels/websocket/runtime.py` — `# Fork` POST settings and run
- `nanobot/cli/gateway_runtime.py` — `# Fork` next to Dream: run the job, and register it at startup
- `nanobot/templates/agent/identity.md` — one prompt line, in both workspace branches (only one is rendered)

No new dependencies. `mobile/vendor/**` was not edited.

## How the job runs

It follows Dream. When the system job `"journal"` fires, `run_journal_job` calls `agent.process_direct` in an ephemeral `journal:` session, with a silent progress callback, and returns `None` from the cron callback so nothing is posted to a chat. Journal sessions are pruned the same way dream sessions are.

The server writes the file. The turn's text is saved to `memory/journal/YYYY-MM-DD.md`. The agent is not given file tools. A day with no chat or kanban material skips the turn and writes nothing. Running again overwrites that day.

The job is registered only when `memory/journal/settings.json` has `enabled: true` (default off, hour 22). Saving settings updates or removes the job. The schedule is `0 <hour> * * *` in the configured timezone.

## System prompt

`nanobot/templates/agent/identity.md`, next to `MEMORY.md`:

`Daily journals are in memory/journal/YYYY-MM-DD.md; read them when asked about past days`

## Checks

```
.venv/bin/python -m pytest -p no:cacheprovider tests/ext/ tests/agent
2057 passed in 67.56s

.venv/bin/ruff check nanobot/ext/journal.py nanobot/webui/ws_http.py nanobot/channels/websocket/runtime.py nanobot/cli/gateway_runtime.py tests/ext/test_journal.py
All checks passed!

.venv/bin/basedpyright nanobot/ext/journal.py
0 errors, 0 warnings, 0 notes

cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest
Test Suites: 110 passed, 110 total
Tests:       908 passed, 908 total

cd mobile && npx tsc --noEmit
(no output, exit 0)
```

`tests/ext/test_journal.py`: 7 passed. Jest still prints the pre-existing worker force-exit line.

## Deviations

- The prompt is in Italian for the four section titles the brief names, and it tells the model to write in the language of the chats.
- The phone shows a journal day with the app `Markdown` viewer. The memory pages on this screen are still plain text.
- The POST hook does not read `gateway.config.agents`: that object is the channel config. The handler loads the timezone with `load_config()`. Startup uses `config.agents.defaults.timezone`.
- Not verified on a phone.
