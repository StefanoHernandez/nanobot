# ST-A: journal for the day just ended, backups on the SD, audio settings that fit, a better Overview (owner: Grok)

Branch `grok/ST-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires. Server changes stay in fork files (`nanobot/ext/*`). Commit after each part.

## 1. The journal writes the day that just ended (`nanobot/ext/journal.py`, app Memory screen)
**What the user wants:** at night, at 3 by default, the job writes the journal of **yesterday**, so each file covers a full day, 0–24.

**Server:**
- `run_journal_job` writes `local_today(tz) - timedelta(days=1)`.
- The default `hour` becomes **3**, in `load_settings` and in every `22` default.
- An existing `settings.json` keeps its stored hour.
- Update the docstrings.

**Manual run:**
- the route already takes an optional `date`;
- **app:** next to "Scrivi il diario di oggi", add **"Scrivi un altro giorno"**. It opens a date picker using `@react-native-community/datetimepicker`, already used in `AutomationJobSheet.tsx`, limited to today and earlier, and calls `runJournal(session, date)`;
- keep the today button.

**Copy:** `models.tasks.journalHelp` becomes "Il modello che scrive il diario ogni notte". Check `memory.journalHour` and any text that says "sera".

**Tests:**
- the job writes yesterday's file;
- the default hour is 3;
- the app sends the chosen date.

## 2. Backups on the external SD (`nanobot/ext/backup.py`, `mobile/src/screens/settings/BackupSection.tsx`)
**Today:**
- `backup_dir()` is `$NANOBOT_BACKUP_DIR` or `~/nanobot-backups`;
- the archive holds only `~/.nanobot`;
- the user's workspace now lives on the SD (`agents.defaults.workspace = /media/arduino/agentsd/nanobot-workspace`), so **it is not backed up at all**. The app only shows `backup.workspaceExcludedWarning`.

**Change:**
- **Destination setting:**
  - stored in `~/.nanobot/backup.json`, `{"dir": "/abs/path"}`;
  - `backup_dir()` order: env var, then that file, then the default;
  - new route `POST /api/ext/backup/settings {dir}`. The dir must be absolute, must exist or be creatable, and must be writable, otherwise `400 invalid_dir`. It must not be inside `~/.nanobot` or inside the workspace, otherwise `400 invalid_dir`;
  - the existing GET payload already returns `dir`.
- **Include the external workspace:**
  - when the workspace is outside `~/.nanobot`, `create_backup` also walks it, using the same loop and skips, under the arcname prefix `workspace-external/`;
  - skip `.git` objects only if the size matters. **Keep `memory/.git`**: Dream's history lives there.
- **Restore:** `workspace-external/*` goes back to the configured workspace path, with the same safety rules as home. If that is too risky to do safely, restore only home and say in the report that workspace restore is manual. Do not guess.
- **App, in `BackupSection`:**
  - a "Cartella dei backup" field with the current dir and Save;
  - a short note: "Consigliato: una cartella sulla SD, es. /media/arduino/agentsd/nanobot-backups";
  - the workspace warning disappears once the workspace is included.
- **Tests:**
  - the settings route: valid, relative, inside home, not writable;
  - a backup with an external workspace contains `workspace-external/...`, including `memory/.git`;
  - `MAX_BACKUPS` still prunes in the new dir.

## 3. The audio settings row goes off screen
**Today:** in `mobile/src/screens/settings/AppearanceSection.tsx` around 122–158, the speech-recognition choice puts two wide `Button`s ("Sul telefono (consigliato)" / "Sul server") in a row inside `ListItem.right`, which overflows on a phone.

**Fix:**
- put the choice **under** the row title as `Chips`, the same component as `ModelsSection.tsx`'s provider choice, so it wraps;
- check the rest of that section for the same pattern.

**Test:** both options render as chips, and pressing one saves the pref.

## 4. A better Overview (Impostazioni → Panoramica, `mobile/src/screens/settings/OverviewSection.tsx`)
**Today:** a 30-day token bar chart, the current model, and three capability rows.

**Goal:** the first screen tells at a glance how nanobot and the arduino are doing. It must be readable on a phone.

**Layout, a vertical stack of cards:**
- **Stato:**
  - online/offline, uptime, nanobot version;
  - CPU, RAM, temperature and disk as small bars, using `nanobot/ext/system.py`, which the Sistema screen already uses (reuse its fetch);
  - a "Dettagli" link to that screen.
- **Spesa:** today and this month, plus the cap if set, from the Costs data (reuse its fetch); a "Dettagli" link.
- **Uso:** keep the 30-day chart, but readable:
  - Y-axis label of the peak;
  - today highlighted;
  - tap a bar to see its day and value;
  - total and daily average.
- **Modello:** current model and provider, plus the models for tasks (subagent, Dream, journal) on one line each.
- **Memoria:**
  - Dream on/off and its last run;
  - journal on/off, its hour and its last day written (`fetchJournal`).
- **Lavagna:** the count of cards running, in review and blocked; tap opens the Lavagna.
- **Capacità:** keep Web/Image/Voice, as compact chips.

**How:**
- every card loads on its own;
- a failed source shows "non disponibile" in that card and never breaks the screen;
- pull-to-refresh reloads all;
- use the existing theme tokens and components;
- no new dependencies; draw the bars with plain `View`s.

**Tests:**
- every card renders with mocked data;
- one failing source shows the fallback while the others still render.

## Checks
- `.venv/bin/python -m pytest -p no:cacheprovider tests`. The 3 known failures are in the README.
- `.venv/bin/ruff check` and `.venv/bin/basedpyright` on the touched Python files.
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`

## Do not
- Add dependencies.
- Edit upstream files or `mobile/vendor/**`.
- Import `@react-navigation/*`.

## Report
`mobile/docs/agy/reports/ST-A.md`, per part:
- the files;
- the tests;
- any deviations;
- what needs a phone or the arduino to check.

Commit, push `grok/ST-A`, and give the last hash. Do not merge.
