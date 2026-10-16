# VC-B Report: On-Device Speech Recognition and Voice Loop Fixes

- **Branch:** `agy/VC-B`
- **Brief:** `mobile/docs/agy/briefs/VC-B.md`
- **Commit Message:** `feat(mobile): on-device speech recognition and voice loop fixes`
- **Verification:**
  - `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`: PASS (101 test suites, 849 passed, 0 failed)
  - `npx tsc --noEmit`: PASS (0 errors)
  - `npx expo install --check`: PASS (`expo-speech-recognition@57.1.1` has no mismatch with Expo SDK 57)

---

## Important Notice on Verification

> [!WARNING]
> Verification was performed entirely through automated unit/integration tests (`jest` and `tsc`). **Nothing was run on a physical device**.
> The speech recognizer, offline recognition mode, and silence length (`DEVICE_SILENCE_MS = 1500`, exported with a `// ponytail:` tuning comment) need testing and calibration on a real Android phone with the Google Speech Services pack installed.

---

## Summary of Implementation

### Part 1: VC-A Bug Fixes (`mobile/src/extras/voiceLoop.ts`)

1. **`startRecording` duplicate invocation:**
   Removed direct call to `startRecording()` from `start()`; starting now transitions state to `"listening"`, and the effect safely initiates recording once.
2. **Mic leak during awaits / termination:**
   Introduced a generational loop token (`loopTokenRef`), incremented on `start()` and `stop()`. It is validated after every `await` in `startRecording()`, `runTranscription()`, and native recognizer events. If stale, the recorder is stopped, temp audio files deleted, and audio mode reset.
3. **Transcription in flight sending after termination:**
   Loop token is validated immediately after `session.client.transcribeAudio` resolves; if stale, transcription output is discarded and nothing is sent.
4. **Stale session handling:**
   Maintained session and recorder references via `sessionRef` and `recorderRef` read dynamically at call time. Session profile switches or closing immediately stop the loop.
5. **Stuck in `waiting` state:**
   - Dispatches `transcript` event only after `threadStore.send` confirms success.
   - If send fails or session closes, stops cleanly and displays localized `common.operationFailed` toast.
   - Added exported `WAITING_TIMEOUT_MS = 180_000` (3 minutes) safety timer that terminates the loop if assistant response never completes.
6. **`machineRef` lag:**
   Updated `machineRef.current = next` synchronously inside `dispatch()`, ensuring speech store subscribers never miss short TTS announcements.
7. **Side effects in updater:**
   Moved `announce(next.state)` outside `setMachine` state updater.
8. **Unconditional hook execution:**
   Extracted voice loop into `VoiceLoopHost` in `Composer.tsx`, rendered conditionally only when `voiceOk` is true. On web or when voice is unavailable, no audio recorder or voice loop hook is created.
9. **Resource cleanup:**
   On too-short audio (<200ms) or missing URI paths, temporary files are deleted and audio mode is reset.

---

### Part 2: Phone Recognizer as Default Engine

#### 2a. Dependency & Engine Layer (`mobile/src/extras/sttEngine.ts`)
- Installed `expo-speech-recognition@57.1.1` and registered `"expo-speech-recognition"` config plugin in `mobile/app.json`.
- Implemented unified `SttEngine` interface (`start(opts)`, `stop()`, `cancel()`, events: `partial`, `final`, `end`, `error`).
- **`DeviceSttEngine`:**
  - Invokes `ExpoSpeechRecognitionModule.start` with:
    - Language from `speechLanguage()` (`it-IT` or `en-US`).
    - `interimResults: true`.
    - `requiresOnDeviceRecognition: true` when target language is present in offline locales via `getSupportedLocales({ androidRecognitionServicePackage: "com.google.android.as" })`.
    - `continuous: false` for one-utterance turns in the voice loop, `continuous: true` for dictation.
    - `EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS` configured via exported `DEVICE_SILENCE_MS = 1500` (with `// ponytail:` comment).
- **`ServerSttEngine`:**
  - Fallback engine using `expo-audio` recorder and server-side `transcribeAudio`.
- **Preference & Fallback:**
  - Added `prefs.voiceEngine()` (`"device" | "server"`, default `"device"`).
  - Automatically falls back to `"server"` if `isRecognitionAvailable()` is false, alerting user once via localized `voice.engineUnavailable` toast.
  - On `language-not-supported` or `service-not-allowed` errors, displays error toast and falls back to server engine for that turn if configured.
- **Visibility helper `isVoiceAvailable(settings)`:**
  - Returns `false` on web (`Platform.OS === "web"`).
  - On mobile, returns `true` if `isRecognitionAvailable() || voiceAvailable(settings)`.

#### 2b. User Interface (`mobile/src/screens/settings/AppearanceSection.tsx`, `Composer.tsx`, `VoiceButton.tsx`, `VoiceLoopBar.tsx`)
- **Settings → Aspetto:**
  - Added "Riconoscimento vocale" section with toggle between `voice.engineDevice` ("Sul telefono (consigliato)") and `voice.engineServer` ("Sul server").
  - Displays offline readiness indicator (`voice.offlineReady` / `voice.offlineMissing`) and helpful hint `voice.offlineHint`.
  - Conforms to font theme styling (`fontFamily: th.font.regular`).
- **Composer Dictation (`VoiceButton.tsx`):**
  - Connected `DeviceSttEngine` for dictation turns when engine preference is device.
  - Emits live partial text to `Composer`, displaying partial draft in `TextInput` in real-time.
  - On stop/end, final text appends to draft without sending.
  - On `language-not-supported` or `service-not-allowed`, seamlessly falls back to server audio recorder.
  - With preference `"server"`, old recording and transcription path is used unchanged.
- **Voice Loop (`voiceLoop.ts` & `VoiceLoopBar.tsx`):**
  - Displays live recognized partial text directly in `VoiceLoopBar` while listening.
  - Turn finishes immediately upon recognizer `final`/`end` event without server transcription round-trip.
  - Dispatches directly to `threadStore.send` and moves to `waiting`.
- **Mic visibility in Composer:**
  - Shows when either device recognition or server transcription is available.
  - Remains completely hidden on web.

---

## Test Coverage

1. `mobile/test/extras/voiceLoop.test.tsx` (30 tests passing):
   - Regression coverage for Part 1 bug fixes items 1–9.
2. `mobile/test/extras/sttEngine.test.ts` (12 tests passing):
   - Device engine start parameters (language, interimResults, silence extra, on-device offline flag).
   - Engine factory and availability resolution.
3. `mobile/test/extras/sttPart2.test.tsx` (8 tests passing):
   - `VoiceLoopBar` partial text rendering.
   - Dictation live partial text in Composer and final draft appending.
   - Voice loop direct send on final recognizer event.
   - Error mapping to toast and fallback to server recording.
   - Preference `"server"` preserves legacy path unchanged.
   - Mic visibility with device engine when server transcription is disabled.
   - Web voice UI hiding.
   - Settings AppearanceSection engine toggle and offline hints.
