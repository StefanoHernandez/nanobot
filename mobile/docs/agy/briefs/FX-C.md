# FX-C: a model choice for the journal, and the recording controls stay on screen (owner: Grok)

Branch `grok/FX-C`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it says to always run (the whole `pytest tests` and the Android export).

## 1. Pick the model that writes the journal
Dream and subagents already have a model choice in Impostazioni → Modelli → "Modelli per attività" (`mobile/src/screens/settings/TaskModels.tsx`). The journal (`nanobot/ext/journal.py`) always uses the chat model. Add a third row, "Diario", that works the same way.

**Server (`nanobot/ext/journal.py`, fork file only):**
- `settings.json` gains `"model"`: a preset name, or `null` for "the same as the chat". The default is `null`.
- `parse_settings`:
  - `model` is optional; when it is missing, keep the stored value;
  - it is `null` or a string naming an existing preset in `config.model_presets`. Anything else gives `400 invalid_model`;
  - `"default"` means `null`, the same as in `subagent_model.py`;
  - `enabled` and `hour` stay required, as today, so the app always sends all three fields.
- `load_settings` returns `model`, and `null` when the field is missing or bad. `GET /api/ext/journal` returns it.
- **The turn uses that model.** `agent_turn` reads the settings **at each turn**, so a change works without a restart:
  - when `model` is set, it resolves the runtime the way `nanobot/ext/subagent_model.py` does (`agent.runtime_resolver.resolve_preset(name)`) and passes it to `process_direct(runtime=...)`;
  - if the preset is gone or fails, it logs a warning and uses the chat model. The journal must never fail because of the model.
- **Tests** in `tests/ext/test_journal.py`:
  - settings with a valid preset, with an unknown preset (400), and with `null`;
  - a missing `model` keeps the old value;
  - the turn passes the preset's runtime;
  - a broken preset falls back to the chat model.

**App:**
- `src/ecosystem/journal.ts`:
  - `model: string | null` in the normalized settings;
  - `saveJournalSettings` sends it.
- `TaskModels.tsx`:
  - add a row "Diario", with help text `models.tasks.journalHelp`: "Il modello che scrive il diario della sera" / "The model that writes the evening journal";
  - it reads the journal settings with `fetchJournal`, and saves with `saveJournalSettings({ enabled, hour, model })`, keeping `enabled` and `hour` as they are;
  - reuse the same picker Sheet the other two rows use;
  - when the journal route is missing, as on an older server, hide only that row.
- i18n in `it` and `en`.
- **Tests:**
  - the row shows the current model or "Come la chat";
  - picking a preset sends `{enabled, hour, model}` with the other two fields unchanged.

## 2. While recording, the stop button goes off the right edge
**Today:** in `src/screens/thread/Composer.tsx`, the tools row holds, from left to right:
- paperclip and prompts;
- `EffortPill` and `ContextIndicator`;
- a spacer;
- the voice-loop button;
- `VoiceButton`.

While recording, `VoiceButton` turns into dot + timer + X + stop, and the send button can appear too. On a phone about 360–412 dp wide, the row is too wide and the **stop button is pushed off the screen**.

**The fix:**
- `VoiceButton` gets `onRecordingChange?: (recording: boolean) => void`. Call it for both engines, device and server, when recording starts and when it ends. "Ends" covers stop, cancel, error and unmount.
- **While recording,** `Composer` hides `EffortPill`, `ContextIndicator` and the voice-loop button. Paperclip and prompts can stay.
- **Make the row safe anyway:** wrap the left-hand tools in a `View` with `flexShrink: 1` and `overflow: "hidden"`. Give the right-hand group `flexShrink: 0`. If something is still too wide, the left side gets cut, never the stop button.
- **Tests:**
  - while recording, the stop button (`voice.stop`) is rendered, and `EffortPill`/`ContextIndicator` are not;
  - after stop, they come back.

## Checks
- `.venv/bin/python -m pytest -p no:cacheprovider tests`. The 3 known failures are listed in the README; anything else is yours.
- `.venv/bin/ruff check` and `.venv/bin/basedpyright` on the files you touched.
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`

## Do not
- Add new dependencies.
- Edit `mobile/vendor/**` or upstream files. All of this fits in fork files and app files.
- Import `@react-navigation/*`.

## Report
`mobile/docs/agy/reports/FX-C.md` with:
- the files you touched;
- the test numbers;
- any deviations.

Commit, push `grok/FX-C`, and give the last hash. Do not merge.
