# VC-A Report: Continuous Voice Conversation

- **Branch:** `agy/VC-A`
- **Brief:** `mobile/docs/agy/briefs/VC-A.md`
- **Commit Message:** `feat(mobile): continuous voice conversation`
- **Verification:**
  - `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`: PASS (97 test suites, 810 passed, 0 failed)
  - `npx tsc --noEmit`: PASS (0 errors)

---

## Important Notice on Verification

> [!WARNING]
> Verification was performed entirely through automated unit/integration tests (`jest` and `tsc`). **Nothing was run on a physical device**.
> The silence and voice activity detection thresholds (`SPEECH_DB = -40`, `SPEECH_MIN_MS = 200`, `SILENCE_DB = -50`, `SILENCE_DURATION_MS = 1500`) are calibration knobs exported with `// ponytail:` comments and will need fine-tuning on real phones and microphones across environments.

---

## Summary of Implementation

### 1. Loop Architecture & State Machine (`mobile/src/extras/voiceLoop.ts`)
- **States:** `idle → listening → transcribing → waiting → speaking → listening …`
- **State Machine Reducer (`voiceLoopReducer`):**
  - Pure reducer handling events: `start`, `speechStart`, `silence`, `maxDuration`, `noSpeechTimeout`, `transcript(text)`, `transcriptError`, `turnEnded(hasText)`, `speakingDone`, `interrupt`, `stop`, `background`.
  - Resets to `idle` on `stop` and `background` from every state.
  - Two consecutive empty transcripts return to `idle`; one returns to `listening`.
  - Transcription errors return to `idle`.
  - `turnEnded` with `hasText: false` transitions directly to `listening`.
- **Pure Silence Detector (`SilenceDetector` & `silenceDetector`):**
  - Tracks metering levels and timestamps:
    - `SPEECH_DB = -40` dB with `SPEECH_MIN_MS = 200` ms required to confirm speech start (filters out brief noise spikes).
    - `SILENCE_DB = -50` dB with `SILENCE_DURATION_MS = 1500` ms silence after speech required to detect end of turn.
    - Safety caps: `MAX_TURN_MS = 60_000` ms (60 s limit per turn) and `NO_SPEECH_TIMEOUT_MS = 10_000` ms (returns to `idle` with quiet toast `voiceLoop.noSpeech`).
  - All constants exported with `// ponytail:` comments.
- **Hook (`useVoiceLoop`):**
  - Records audio via `expo-audio` with `isMeteringEnabled: true` and safe fallbacks for partial test mocks.
  - Keeps screen active while loop is running using `expo-keep-awake` (`activateKeepAwakeAsync` and `deactivateKeepAwake` with tag `"voice-loop"`).
  - Listens to `AppState`: returns to `idle` when app transitions away from `"active"`.
  - Integrates with `threadStore.send` and `speechStore.markVoiceDictated(chatKey, true)` to send spoken input and trigger auto-read on reply completion.
  - Touch barge-in via `interrupt()` stops TTS and restarts recording.
  - Announces all state changes via `AccessibilityInfo.announceForAccessibility`.

### 2. Audio Dictation Store Adaptation (`mobile/src/extras/speech.ts`)
- Updated `markVoiceDictated(chatKey: string, force?: boolean)` signature and implementation to allow continuous conversation mode to queue auto-read even when user has `prefs.voiceAutoRead()` disabled in general settings, requiring only `speechStore.enabled` (audio replies).

### 3. Accessible UI & Composer Integration (`mobile/src/screens/thread/VoiceLoopBar.tsx`, `Composer.tsx`, `IconButton.tsx`)
- **`VoiceLoopBar`:**
  - Replaces composer while `voiceLoop.state !== "idle"`.
  - Displays state indicator ("Ti ascolto…", "Trascrivo…", "nanobot risponde…", "Parlo…").
  - Real-time metering level bar when in `listening` state.
  - Large **Termina conversazione** button with destructive style and `minHeight: 56`, `minWidth: 56` (≥ 56dp touch target).
  - Touch barge-in **Interrompi** button visible while in `speaking` state (≥ 48dp touch target).
  - Styled with theme tokens and `th.font.*` without hardcoded `fontWeight`.
- **`Composer`:**
  - Added continuous voice icon button (`account-voice`, label `voiceLoop.start`) next to `VoiceButton` when `voiceOk`.
  - Disabled when audio replies are off (`!speechStore.enabled`), with accessible hint `voiceLoop.audioRepliesRequired`.
- **`IconButton`:**
  - Extended with `accessibilityHint?: string` forwarded to underlying `Pressable`.

### 4. Internationalization (`mobile/src/i18n/it.json`, `en.json`)
- Added `voiceLoop` translation namespaces for Italian and English.

---

## Files Changed

### Added
- `mobile/src/extras/voiceLoop.ts`
- `mobile/src/screens/thread/VoiceLoopBar.tsx`
- `mobile/test/extras/voiceLoop.test.tsx`
- `mobile/docs/agy/reports/VC-A.md`

### Modified
- `mobile/package.json` (added `expo-keep-awake: ~57.0.2`)
- `mobile/package-lock.json`
- `mobile/src/extras/speech.ts`
- `mobile/src/screens/thread/Composer.tsx`
- `mobile/src/ui/components/IconButton.tsx`
- `mobile/src/i18n/it.json`
- `mobile/src/i18n/en.json`

---

## Test Coverage
- Unit tests for `voiceLoopReducer`:
  - Full cycle transitions (`idle → listening → transcribing → waiting → speaking → listening`).
  - Empty and whitespace transcripts (1 goes to listening, 2 in a row goes to idle).
  - Transcription error handling.
  - Turn ended without readable text going straight to listening.
  - Touch barge-in `interrupt` while speaking.
  - Stop and background from all five states.
  - No speech timeout.
- Unit tests for `SilenceDetector`:
  - Noise under threshold without speech does not end turn.
  - 100 ms spike above threshold rejected as noise.
  - 200 ms above threshold confirms speech start.
  - 1.4 s silence does not end turn; 1.5 s silence ends turn.
  - 60 s maximum turn duration respected.
  - 10 s timeout without speech triggers `noSpeechTimeout`.
- Integration tests for `useVoiceLoop`:
  - Transcript sent exactly once to `threadStore.send`.
  - `markVoiceDictated` called with `(chatKey, true)`.
  - Recording restarts when TTS finishes (`speakingId -> null`).
  - "Termina" cleans up recorder, temporary file, TTS, keep-awake, and resets audio mode.
  - `AppState` transition to background terminates loop and cleans up resources.
- UI tests:
  - `VoiceLoopBar` state rendering, level bar, Termina button, and Interrompi button.
  - `Composer` continuous voice button disabled state and accessibility hint when audio replies are off.
