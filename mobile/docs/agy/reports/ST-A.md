# ST-A Report: Settings, Journal and Backup Improvements

- **Branch:** `agy/ST-A`
- **Brief:** `mobile/docs/agy/briefs/ST-A.md`
- **Owner:** agy (formerly Grok in brief)

---

## 1. Summary of Parts and Commits

### Part 1: Journal writes yesterday at 3am, manual run with date picker
- **Commit:** `099e4eb7d` (`feat(journal): journal writes yesterday at 3am, manual run with date picker`)
- **Backend (`nanobot/ext/journal.py`):**
  - Default hour changed from 22 to 3 (`DEFAULT_JOURNAL_HOUR = 3`).
  - Scheduled journal job (`run_journal_job`) writes the previous day: `local_today(tz) - timedelta(days=1)`.
  - Prompt and summary text updated to reflect that the run consolidates yesterday's activity.
  - Manual runs (`write_journal_for_day`) continue to support any specified date up to today.
- **Frontend (`mobile/src/ecosystem/journal.ts` & `MemoryScreen.tsx`):**
  - Default hour fallback normalized to 3 in `normalizeJournal`.
  - Added "Scrivi un altro giorno" button beside the today journal button in `MemoryScreen.tsx`.
  - Opens `@react-native-community/datetimepicker` clamped to `maximumDate={new Date()}`.
  - Selecting a past date triggers `writeJournal(dateStr)` for that specific day.
  - Updated copy in `it.json` and `en.json` (`models.tasks.journalHelp`) from evening to nightly ("notturno" / "nightly").

### Part 2: Backup SD destination setting and external workspace backup
- **Commit:** `51feae8fa` (`feat(backup): SD destination setting and external workspace backup`)
- **Backend (`nanobot/ext/backup.py`):**
  - Settings stored in `~/.nanobot/backup.json` (`{"dir": "/abs/path"}`).
  - `backup_dir()` resolution order: `NANOBOT_BACKUP_DIR` env var -> `backup.json` setting -> default `~/nanobot-backups` (or `~/.nanobot/backups`).
  - New route `POST /api/ext/backup/settings`: validates path is absolute, not inside home or workspace, creatable and writable; otherwise returns `400 invalid_dir`.
  - External workspace backup: when configured workspace is outside home dir, `create_backup` walks the external workspace and archives files under prefix `workspace-external/`.
  - Exclusions apply (.git, node_modules, cache, venv) while explicitly keeping `memory/.git` to protect Dream history.
  - Restore: `restore_backup()` stages and extracts `workspace-external/*` safely back to the configured workspace path.
  - Tested: 11 tests in `tests/ext/test_backup.py`.
- **Frontend (`mobile/src/extras/backup.ts` & `BackupSection.tsx`):**
  - Added `saveBackupSettingsRequest` and `saveDir` in `backupStore`.
  - `BackupSection.tsx` renders a "Cartella dei backup" text field (`dirInput`) initialized with current dir, with hint `"Consigliato: una cartella sulla SD, es. /media/arduino/agentsd/nanobot-backups"`, and "Salva" button.
  - Workspace excluded warning card disappears once workspace is included.

### Part 3: Voice engine choice rendered as chips
- **Commit:** `29eb51eec` (`fix(settings): render voice engine choice as chips`)
- **Frontend (`mobile/src/screens/settings/AppearanceSection.tsx`):**
  - Replaced wide buttons in `ListItem.right` with wrapping `Chips` located directly below the `ListItem` row title.
  - Replaced horizontal nowrap rows for Theme and Language with wrapping `Chips` from `./common`.
  - Both options ("Sul telefono (consigliato)" and "Sul server") render cleanly without overflowing on phone screens.
  - Test added in `mobile/test/screens/settings.test.tsx` verifying both options render as chips and pressing saves preference.

### Part 4: Rich system and agent overview screen
- **Commit:** `2913ea8e5` (`feat(settings): rich system and agent overview screen`)
- **Frontend (`mobile/src/screens/settings/OverviewSection.tsx`):**
  - Redesigned `OverviewSection` into a vertical stack of 7 independent cards:
    1. **Stato:** online/offline badge, uptime, version, and small progress bars for CPU, RAM, Disk, and Temperature with "Dettagli" link to `/settings/machine`.
    2. **Spesa:** today cost, month cost, and daily cap (if set) with "Dettagli" link to `/settings/costs`.
    3. **Uso:** 30-day token bar chart with peak Y-axis label, highlighted today bar, tap-to-inspect bar for date & tokens, total tokens and daily average.
    4. **Modello:** active model and provider, plus subagent, Dream, and journal model presets on one line each, navigating to `/settings/models`.
    5. **Memoria:** Dream on/off & last run date/time, journal on/off, scheduled hour & last day written, navigating to `/ecosystem/memory`.
    6. **Lavagna:** summary counters for cards in `running`, `review`, and `blocked`, navigating to `/ecosystem/kanban`.
    7. **Capacità:** Web, Image, and Voice rendered as compact chips navigating to `/settings/capabilities`.
  - Each card loads independently; failures show "non disponibile" without breaking other cards or the screen.
  - Pull-to-refresh (`RefreshControl`) triggers concurrent reload across all cards.
  - Created test suite in `mobile/test/screens/overview.test.tsx`.
- **Follow-up commit:** `9039548b7` (`test(settings): align journalHelp expectations with nightly journal`)
  - Updated existing `models-settings.test.tsx` test expectations to reflect nightly journal copy.

---

## 2. Self-Check against the Brief (file:line citations)

| Brief Requirement | Implementation Location |
|---|---|
| Part 1: Default hour is 3:00 (night) | `nanobot/ext/journal.py:35`, `mobile/src/ecosystem/journal.ts:28` |
| Part 1: Scheduled journal writes yesterday (`D - 1`) | `nanobot/ext/journal.py:339-340` |
| Part 1: Prompt & title reflect yesterday | `nanobot/ext/journal.py:347-353` |
| Part 1: "Scrivi un altro giorno" date picker in MemoryScreen | `mobile/src/screens/ecosystem/memory/MemoryScreen.tsx:142-162` |
| Part 1: `models.tasks.journalHelp` says nightly / notturno | `mobile/src/i18n/it.json:710`, `mobile/src/i18n/en.json:710` |
| Part 2: Setting stored in `~/.nanobot/backup.json` | `nanobot/ext/backup.py:46-59` |
| Part 2: `backup_dir()` order (env, setting file, default) | `nanobot/ext/backup.py:53-59` |
| Part 2: `POST /api/ext/backup/settings` validation (`invalid_dir`) | `nanobot/ext/backup.py:382-414` |
| Part 2: External workspace included under `workspace-external/` | `nanobot/ext/backup.py:126-154` |
| Part 2: `memory/.git` preserved in backup | `nanobot/ext/backup.py:137-142` |
| Part 2: Restore extracts `workspace-external/*` back to workspace | `nanobot/ext/backup.py:284-307` |
| Part 2: `BackupSection` text field, hint, and Save button | `mobile/src/screens/settings/BackupSection.tsx:126-146` |
| Part 3: Voice engine choice rendered as `Chips` under row | `mobile/src/screens/settings/AppearanceSection.tsx:123-149` |
| Part 3: Rest of section checked (Theme, Language use `Chips`) | `mobile/src/screens/settings/AppearanceSection.tsx:52-70` |
| Part 3: Tests for voice engine chips | `mobile/test/screens/settings.test.tsx:96-107` |
| Part 4: 7-card vertical stack layout | `mobile/src/screens/settings/OverviewSection.tsx:268-450` |
| Part 4: Stato card with CPU, RAM, Disk, Temp bars & details link | `mobile/src/screens/settings/OverviewSection.tsx:269-322` |
| Part 4: Spesa card with today, month, cap & details link | `mobile/src/screens/settings/OverviewSection.tsx:324-348` |
| Part 4: Uso card 30d bars, peak, today highlight, tap inspection | `mobile/src/screens/settings/OverviewSection.tsx:350-409` |
| Part 4: Modello card with current + task models on 1 line each | `mobile/src/screens/settings/OverviewSection.tsx:411-441` |
| Part 4: Memoria card with Dream on/off + last run, Journal on/off + hour + last day | `mobile/src/screens/settings/OverviewSection.tsx:443-481` |
| Part 4: Lavagna card with running, review, blocked counts | `mobile/src/screens/settings/OverviewSection.tsx:483-529` |
| Part 4: Capacità card with compact chips | `mobile/src/screens/settings/OverviewSection.tsx:531-558` |
| Part 4: Each card loads independently & shows "non disponibile" on failure | `mobile/src/screens/settings/OverviewSection.tsx:94-173` |
| Part 4: Pull-to-refresh reloads all cards | `mobile/src/screens/settings/OverviewSection.tsx:175-188`, `262-266` |
| Part 4: Overview test suite | `mobile/test/screens/overview.test.tsx:1-294` |

---

## 3. Files Created and Modified

### Created
1. `mobile/test/screens/overview.test.tsx` — Test suite for Part 4 OverviewSection.
2. `mobile/docs/agy/reports/ST-A.md` — This report.

### Modified
1. `nanobot/ext/journal.py` — Default hour 3, scheduled run on previous day.
2. `tests/ext/test_journal.py` — Tests for 3am default and yesterday's date logic.
3. `nanobot/ext/backup.py` — Destination setting endpoint, external workspace backup & restore.
4. `tests/ext/test_backup.py` — Tests for backup settings validation, external workspace archiving and restore.
5. `mobile/src/ecosystem/journal.ts` — Default hour normalization to 3.
6. `mobile/src/extras/backup.ts` — API client and store methods for backup settings.
7. `mobile/src/screens/ecosystem/memory/MemoryScreen.tsx` — Added date picker for manual journal runs.
8. `mobile/src/screens/settings/BackupSection.tsx` — Added backup destination directory field and save button.
9. `mobile/src/screens/settings/AppearanceSection.tsx` — Render voice engine, theme, and language choices as `Chips`.
10. `mobile/src/screens/settings/OverviewSection.tsx` — Full rewrite into 7 independent cards with pull-to-refresh and charts.
11. `mobile/src/i18n/it.json` — Italian translation strings for journal, backup, and overview cards.
12. `mobile/src/i18n/en.json` — English translation strings for journal, backup, and overview cards.
13. `mobile/test/ecosystem/journal.test.ts` — Updated hour assertions to 3.
14. `mobile/test/screens/ecosystem-memory.test.tsx` — Updated hour assertions and tests for date picker.
15. `mobile/test/extras/backup-export.test.tsx` — Tests for backup destination directory settings in UI and API.
16. `mobile/test/screens/settings.test.tsx` — Added tests for voice engine chips preference.
17. `mobile/test/screens/models-settings.test.tsx` — Aligned journalHelp test expectations with nightly journal copy.

---

## 4. Raw Verification Outputs

### Python `ruff check`
```text
$ ../nanobot/.venv/bin/ruff check nanobot/ext/journal.py nanobot/ext/backup.py tests/ext/test_journal.py tests/ext/test_backup.py
All checks passed!
```

### Python `basedpyright`
```text
$ ../nanobot/.venv/bin/basedpyright --pythonpath ../nanobot/.venv/bin/python nanobot/ext/journal.py nanobot/ext/backup.py tests/ext/test_journal.py tests/ext/test_backup.py
0 errors, 0 warnings, 0 notes
```

### Full `pytest`
```text
$ ../nanobot/.venv/bin/python -m pytest -p no:cacheprovider tests
=========================== short test summary info ============================
FAILED tests/channels/test_channel_setup.py::test_every_runtime_channel_field_has_a_webui_contract
FAILED tests/tools/test_tool_validation.py::test_exec_rejects_home_path_without_home_directory
FAILED tests/webui/test_remote_pairing.py::test_server_appends_restricted_key_and_revoke_preserves_existing
============ 3 failed, 7872 passed, 58 skipped in 213.34s (0:03:33) ============
```
*(The 3 failed tests are the known environment-specific failures documented in `mobile/docs/agy/README.md`)*

### Full Jest Suite
```text
$ cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest
Test Suites: 115 passed, 115 total
Tests:       931 passed, 931 total
Snapshots:   0 total
Time:        8.57 s
Ran all test suites.
```

### TypeScript Check (`tsc --noEmit`)
```text
$ cd mobile && npx tsc --noEmit
(exit code 0, no output)
```

### Expo Export
```text
$ cd mobile && npx expo export --platform android --output-dir /tmp/nb-export
[expo-share-intent] IOS module disabled
Starting Metro Bundler
Android Bundled 11036ms index.js (2534 modules)
› android bundles (1):
_expo/static/js/android/index-49fa37aa18db001003e1eb2013730681.hbc (7.9MB)
Exported: /tmp/nb-export
```

---

## 5. Unverified / Device-Check Items
- Tested in Node / React Native mock testing environment and verified with production Android bundle export (`expo export`).
- Physical on-device verification on the Android smartphone (visual rendering of chips, native date picker dialog popup, and touch interactions on hardware) not performed in this workspace.
- Physical execution on the Arduino Uno Q mini-PC with an external SD mounted at `/media/...` not executed directly; backup path validation and archive creation tested against simulated POSIX filesystem paths.
