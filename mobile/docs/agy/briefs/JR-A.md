# JR-A: automatic daily journal (owner: Grok)

Branch `grok/JR-A`, from `origin/main`. Follow `mobile/docs/agy/README.md`: no rebase, one branch, a report at the end. Ignore `look-test/`, and add files by path only.

## Goal
Every evening nanobot writes a short **journal of the day**:
- what was talked about;
- what was decided;
- what is still open;
- which Kanban cards finished, failed or are waiting.

Later the user asks "cosa avevo deciso martedì sul NAS?" and nanobot reads the journal.

**No vector memory.** It is plain Markdown files.

## Where the data lives (read these first)
- **Chats** are stored by `nanobot/session/manager.py` in the runtime sessions directory, **outside the workspace**. The agent's file tools cannot read them, so the server must collect them.
- **Memory** is in `nanobot/agent/memory.py` (`MemoryStore`: `MEMORY.md`, `history.jsonl`).
- **Dream** is the existing nightly memory job. It runs as a system cron job named `"dream"` in `nanobot/cli/gateway_runtime.py` (around line 575):
  - it builds a prompt;
  - it runs a turn in its own session key;
  - then it prunes those sessions.

  **The journal must work the same way.** Copy Dream's pattern; do not invent a second LLM path.
- **Kanban runs** come from `nanobot/ext/kanban.py` (`task_runs` + `tasks`).

## Part 1: server
- **New `nanobot/ext/journal.py`, the fork file:**
  - `collect_day(day: date) -> str`. It builds the material for one local day:
    - **chats:** user and assistant text of the sessions with messages that day. Skip tool calls and results, and skip system sessions: `kanban:*`, `cron:*`, dream and journal sessions. Read `nanobot/session/keys.py`;
    - **Kanban:** runs finished that day, with title, status, summary and error;
    - cap the total (about 24 000 chars). When it is over, keep the newest content and cut each message.
  - `journal_prompt(day, material) -> str`. A short prompt, in the user's language. It asks for Markdown with the sections: "Di cosa abbiamo parlato", "Decisioni", "Da fare / aperto", "Lavagna". It says to keep it short and to invent nothing.
  - **Output:** `<workspace>/memory/journal/YYYY-MM-DD.md`, one file per day. Running it again overwrites that day. A day with no material writes nothing.
  - **Settings** are stored in `<workspace>/memory/journal/settings.json`, `{"enabled": false, "hour": 22}`. **Off by default.**
- **HTTP**, in `journal.py`, with the same auth as the memory pages routes (`nanobot/ext/memory_pages.py`, wired in `nanobot/webui/` with a thin `# Fork` hook):
  - `GET /api/ext/journal` returns `{enabled, hour, days: ["2026-10-16", ...]}`, newest first;
  - `GET /api/ext/journal/day?date=YYYY-MM-DD` returns `{date, text}`. A bad date gives 400; a missing day gives 404;
  - `POST /api/ext/journal/settings`, body `{enabled, hour}`. `hour` is 0–23, otherwise 400;
  - `POST /api/ext/journal/run`, body `{date?}`, default today. It writes that day **now** and returns `{date, written: bool}`.
- **Scheduling.** A thin `# Fork` hook next to Dream in `gateway_runtime.py`:
  - when enabled, a system job named `"journal"` runs every day at `hour`, local time, for **today**;
  - when the settings change, the job is updated;
  - the job runs the turn the same way Dream does. The agent writes the file with its own file tools, or the server writes the text the turn returns. Choose the simpler one that fits Dream's code and explain it in the report;
  - the journal sessions are pruned the way dream sessions are;
  - **the job never notifies the user and never posts in their chats.**
- **Reading from chat.**
  - Add **one line** to the memory instructions the agent already gets: "Daily journals are in memory/journal/YYYY-MM-DD.md; read them when asked about past days". Find where `MEMORY.md` is described in the system prompt, and keep it to one line because it rides in every prompt.
  - Do not add a new tool.
- **Tests** in `tests/ext/test_journal.py`:
  - `collect_day` picks only that day, skips tool output and system sessions, and respects the cap;
  - a day with no material writes nothing;
  - settings validation;
  - the routes: list, day, bad date, missing day, run;
  - the job is scheduled only when enabled.

  Mock the LLM turn.

## Part 2: app (Memory screen, `mobile/src/screens/ecosystem/memory/MemoryScreen.tsx`)
- **New `src/ecosystem/journal.ts`**, with `fetchJournal`, `fetchJournalDay`, `saveJournalSettings` and `runJournal`. Normalize the responses. Use the same POST and error shape as `kanban.ts` (`.status` / `.code`).
- **A "Diario" section or tab in the Memory screen:**
  - a switch "Diario automatico" plus the time, Chips or a small hour picker, using `saveJournalSettings`;
  - "Scrivi il diario di oggi", using `runJournal`, with a loading state and a toast when the day had nothing to write;
  - a list of the days, newest first. Tapping a day opens the text in the existing Markdown viewer the app uses for memory pages. Reuse it.
- Add i18n in `it` and `en`.
- **Tests:**
  - normalizing the responses;
  - the switch sends the settings;
  - "Scrivi" calls run and refreshes the list;
  - tapping a day shows its text.

## Checks
- `.venv/bin/python -m pytest -p no:cacheprovider tests/ext/ tests/agent`
- `.venv/bin/ruff check nanobot/ext/journal.py` plus every file you touched
- `.venv/bin/basedpyright nanobot/ext/journal.py`
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`

Never run `ruff format`. Read the results yourself before committing.

## Do not
- Use vector memory or embeddings.
- Add new dependencies.
- Edit `mobile/vendor/**`.
- Put upstream edits beyond thin `# Fork` hooks.
- Send the journal anywhere outside the workspace.

## Report
`mobile/docs/agy/reports/JR-A.md` with:
- the files you touched, with the upstream hooks listed apart;
- the test numbers;
- how the job runs the turn and who writes the file;
- the system-prompt line and where it went;
- any deviations.

Commit, push `grok/JR-A`, and give the last hash. Do not merge.
