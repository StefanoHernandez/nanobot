# FX-C report

Branch `grok/FX-C`, from `origin/main`. Not merged.

## Files

- `nanobot/ext/journal.py` — `settings.json` stores `model`; the turn resolves that preset
- `tests/ext/test_journal.py`
- `mobile/src/ecosystem/journal.ts`
- `mobile/src/screens/settings/TaskModels.tsx`
- `mobile/src/screens/ecosystem/memory/MemoryScreen.tsx` — keep `model` in local state after an hour or switch save
- `mobile/src/screens/thread/VoiceButton.tsx`
- `mobile/src/screens/thread/Composer.tsx`
- `mobile/src/i18n/en.json`, `mobile/src/i18n/it.json`
- `mobile/test/ecosystem/journal.test.ts`
- `mobile/test/screens/models-settings.test.tsx`
- `mobile/test/screens/composer-recording.test.tsx`

No new dependencies. `mobile/vendor/**` was not edited.

## Brief checklist

| Item | Where |
| --- | --- |
| `model` is a preset name or `null`; default `null` | `nanobot/ext/journal.py:67` |
| missing `model` keeps the stored value | `nanobot/ext/journal.py:99` |
| `null` or an existing preset; anything else is `400 invalid_model` | `nanobot/ext/journal.py:77` |
| `"default"` means `null` | `nanobot/ext/journal.py:78` |
| `enabled` and `hour` stay required | `nanobot/ext/journal.py:94` |
| `load_settings` returns `null` when `model` is missing or bad | `nanobot/ext/journal.py:67` |
| `GET /api/ext/journal` returns `model` | `nanobot/ext/journal.py:450` |
| each turn reads settings and passes `runtime=` | `nanobot/ext/journal.py:389` |
| a missing preset logs a warning and uses the chat model | `nanobot/ext/journal.py:395` |
| `JournalIndex.model` and `saveJournalSettings` send it | `mobile/src/ecosystem/journal.ts:6`, `mobile/src/ecosystem/journal.ts:108` |
| Diario row, same sheet, keeps `enabled` and `hour` | `mobile/src/screens/settings/TaskModels.tsx:62` |
| missing journal route hides only that row | `mobile/src/screens/settings/TaskModels.tsx:40` |
| i18n `it` and `en` | `models.tasks.journal`, `models.tasks.journalHelp` |
| `onRecordingChange` for device and server, including stop, cancel, error, and unmount | `mobile/src/screens/thread/VoiceButton.tsx:63` |
| while recording, hide effort, context, and the voice loop | `mobile/src/screens/thread/Composer.tsx:419`, `mobile/src/screens/thread/Composer.tsx:430` |
| left tools `flexShrink: 1` and `overflow: "hidden"`; right group `flexShrink: 0` | `mobile/src/screens/thread/Composer.tsx:554` |

## Checks

This worktree has no `.venv`. Commands used `/home/stefano/Documenti/ProgettiPersonali/nanobot/.venv` with `PYTHONPATH=.` so imports come from this tree.

```
PYTHONPATH=. …/python -m pytest -p no:cacheprovider tests
3 failed, 7874 passed, 53 skipped in 219.94s
```

The three failures are the ones already known on this PC: `test_every_runtime_channel_field_has_a_webui_contract`, `test_exec_rejects_home_path_without_home_directory`, `test_server_appends_restricted_key_and_revoke_preserves_existing`.

```
ruff check nanobot/ext/journal.py tests/ext/test_journal.py
All checks passed!

basedpyright nanobot/ext/journal.py
0 errors, 0 warnings, 0 notes

cd mobile && npx tsc --noEmit
(no output, exit 0)

cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest
Test Suites: 114 passed, 114 total
Tests:       922 passed, 922 total

cd mobile && npx expo export --platform android --output-dir /tmp/nb-export
Android Bundled, exported to /tmp/nb-export
```

## Deviations

- The left tool group also sets `minWidth: 0`. Without it, React Native will not shrink that row below its content, so the stop button could still be pushed off.
- Changing the journal hour or the automatic switch on the memory screen still omits `model`, so the server keeps the stored preset. The screen copies `model` back from the response because `JournalIndex` now includes it.

## Not verified

Not run on a phone. The recording test checks that the stop control is mounted and that effort and context are not; it does not measure a 360 dp layout.
