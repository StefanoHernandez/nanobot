# VC-A: continuous voice conversation (owner: agy)

Branch `agy/VC-A`, from `main`. App only, with no server changes.

User decisions:
- the loop stops **only with a button**, with no stop word;
- it works **only while the app is open and in the foreground**. In background it stops, with no foreground service.

## Read first
- `src/extras/voice.ts` (`useVoiceInput`: recording with expo-audio, transcription, temp file cleanup).
- `src/extras/speech.ts`:
  - `speechStore`;
  - `markVoiceDictated`;
  - the `threadStore.subscribe` auto-read: when the dictated chat's turn ends, it reads the answers aloud.
- `src/screens/thread/VoiceButton.tsx` and `Composer.tsx`.
- `mobile/docs/agy/README.md` and `mobile/docs/design/companion.md`.

Reuse all of them. Do not write a second recorder, a second TTS or a second auto-read.

## Loop
States: `idle → listening → transcribing → waiting (the bot is answering) → speaking → listening …`

1. **listening:** record with metering on (`isMeteringEnabled: true`, and read `metering` through `useAudioRecorderState` or the recorder status every ~100 ms).
   - Speech has started once the level stays above `SPEECH_DB` (-40 dB) for 200 ms.
   - The turn ends when, after speech, the level stays below `SILENCE_DB` (-50 dB) for **1.5 s**.
   - Safety caps:
     - 60 s maximum per turn;
     - if nobody speaks within 10 s, the loop goes back to `idle` with the quiet toast `voiceLoop.noSpeech`.
   - Put the thresholds in exported constants (the calibration knob), each with a `ponytail:` comment that says they may need tuning per phone.
2. **transcribing:** the same transcription path as `useVoiceInput`.
   - An empty or whitespace-only transcript goes back to `listening`.
   - Two empty transcripts in a row go to `idle`.
   - A transcription error shows the existing voice error toast, then `idle`.
3. **waiting:** send the text into the chat with the thread's normal `send` (not the draft), then call `speechStore.markVoiceDictated(chatKey)`. That needs audio replies enabled: if they are off, the loop button is disabled and its hint says to turn them on.
4. **speaking:** the existing auto-read reads the answer. When `speakingId` goes back to `null` after it was set for this turn, go to `listening`. If the turn ends without text to read (for example only tools), go straight to `listening`.
5. **Stop:**
   - a large "Termina conversazione" button, always visible while the loop is active, returns to `idle` from any state: stop the recorder and delete the temp file, `speechStore.stop()`, and reset the audio mode. It does **not** stop the bot's turn, which goes on in the chat.
   - while `speaking`, a second "Interrompi" button stops the TTS and goes straight to `listening`. This is touch barge-in, not voice barge-in.
6. **App goes to background** (`AppState` not `active`), **chat change, or screen unmount:** go to `idle` with the same cleanup as Stop.
7. **Screen stays on** while the loop is active: add `expo-keep-awake` with `npx expo install expo-keep-awake` (an SDK package, so it is allowed), using `activateKeepAwakeAsync` / `deactivateKeepAwake` with a tag.

## UI
- In the composer, next to the existing `VoiceButton`, add an icon `IconButton` (`account-voice`, label `voiceLoop.start`). It is visible only when `voiceOk` (as for `VoiceButton`).
- When active, the composer is replaced by a `VoiceLoopBar`:
  - a large state indicator ("Ti ascolto…", "Trascrivo…", "nanobot risponde…", "Parlo…");
  - a level bar driven by metering while `listening`;
  - the **Termina** button (destructive, ≥ 56dp) and, while `speaking`, **Interrompi**.
- The Compagno face (if visible in the thread) follows the state. That is optional; skip it if it needs more than a prop.
- Accessibility: every state change is announced with `AccessibilityInfo.announceForAccessibility`.
- i18n keys go in it and en. Use theme tokens and `th.font.*`, no `fontWeight`, touch targets ≥ 48dp.

## Structure
- `src/extras/voiceLoop.ts`:
  - a pure state reducer `voiceLoopReducer(state, event)` with events `start`, `speechStart`, `silence`, `maxDuration`, `noSpeechTimeout`, `transcript(text)`, `transcriptError`, `turnEnded(hasText)`, `speakingDone`, `interrupt`, `stop`, `background`;
  - a hook `useVoiceLoop(chatKey)` that wires the reducer to expo-audio, `speechStore`, `threadStore` and `AppState`;
  - a pure `silenceDetector(samples, opts)` (or a small class that takes `push(db, tMs)`) that is testable without audio.
- `src/screens/thread/VoiceLoopBar.tsx`.

## Tests (write first)
- The reducer: the full cycle, two empty transcripts go to `idle`, a transcription error goes to `idle`, `interrupt` while speaking goes to `listening`, and `stop`/`background` from every state go to `idle`.
- `silenceDetector`:
  - no speech means no end;
  - speech then 1.4 s of silence does not end the turn, 1.5 s does;
  - a brief 100 ms noise spike is not speech;
  - the 60 s max is respected.
- The hook (with the recorder and `expo-speech` mocked as the existing voice tests do; the stores stay real):
  - the transcript is sent exactly once;
  - `markVoiceDictated` is called;
  - when speech ends, recording restarts;
  - Termina stops the recorder, stops TTS and deletes the temp file;
  - AppState background ends the loop;
  - keep-awake is activated and deactivated.
- The button is disabled with audio replies off, and its hint is shown.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- No edits to `mobile/vendor/**` or to server Python. The only new dependency is `expo-keep-awake`.
- Commit `feat(mobile): continuous voice conversation`.
- Report in `mobile/docs/agy/reports/VC-A.md`. Say nothing was run on a device. The silence thresholds need a test on a real phone.
