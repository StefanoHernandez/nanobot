# VC-B: voice on the phone's own recognizer, plus VC-A fixes (owner: agy)

Branch `agy/VC-B`, from `origin/main` (see the README: no rebase). VC-A is merged. Android only; web keeps voice hidden.

User decision: speech recognition should be **local where possible**.
- **Default engine:** Android's own `SpeechRecognizer`, preferring on-device (offline) recognition. It is free, private and fast. It shows text while you speak, and it detects the end of speech by itself.
- **Fallback:** the current path (record, then server transcription via Groq or another server provider).

## Part 1: VC-A bugs (do these first, each with a test)
All of them are in `src/extras/voiceLoop.ts`.
1. 🔴 **`startRecording` runs twice.** `start()` calls it, and the `listening` effect calls it again before `recordingRef` is set. Keep a single entry point: drop the direct call, or set a starting flag synchronously.
2. 🔴 **The mic leaks when Termina or background lands during the permission or prepare awaits.** Add a **loop token** (a generation number bumped by `start`/`stop`). Re-check it after every `await` in `startRecording`. If it is stale, stop the recorder and return.
3. 🔴 **A transcription in flight sends after Termina.** Check the loop token after `transcribeAudio` resolves: if it is stale, drop the text and send nothing.
4. 🟡 **Stale session.** Keep `session` and `recorder` in refs read at call time. A session change (profile switch, closed) ends the loop.
5. 🟡 **Stuck in `waiting`.**
   - Dispatch `transcript` only after `threadStore.send` succeeds.
   - If the send fails or the session is closed, stop and go to idle with `common.operationFailed`.
   - Add a `waiting` timeout (`WAITING_TIMEOUT_MS = 180_000`, exported) that ends the loop.
6. 🟡 **`machineRef` lags.** Update it synchronously inside `dispatch`, not on render, so the speech-store subscribers never miss a short TTS.
7. 🟡 **Side effect in an updater.** Move `announce()` out of the `setMachine` updater.
8. 🟡 **Hook runs when unused.** `useVoiceLoop` runs in every Composer even when voice is unavailable (and on web). Move it into a child component that is rendered only when voice is available.
9. 🔵 On the too-short or no-uri path, delete the temp file and reset the audio mode.

## Part 2: phone recognizer as the default engine
Add `expo-speech-recognition@57.1.1` (it matches Expo SDK 57). Register its config plugin in `app.json` (microphone permission already exists).

### 2a. Engine layer
- Add `src/extras/sttEngine.ts` with one interface used by **both** dictation (`VoiceButton`) and the voice loop:
  - `start(opts)`;
  - `stop()`, which finishes and returns the final text;
  - `cancel()`;
  - events: `partial(text)`, `final(text)`, `end`, `error(code)`.
- **Device engine:**
  - `ExpoSpeechRecognitionModule.start` with `lang` from `speechLanguage()` (`it-IT` / `en-US`) and `interimResults: true`;
  - `requiresOnDeviceRecognition: true` when `getSupportedLocales({ androidRecognitionServicePackage: "com.google.android.as" }).installedLocales` contains the lang, otherwise `false` (the phone's online service, still free);
  - `continuous: false` for the voice loop: one utterance per turn, and the recognizer ends it on silence.
  - Pass `androidIntentOptions.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS` from an exported constant (`DEVICE_SILENCE_MS = 1500`, with a `ponytail:` comment to tune it on the phone).
- **Server engine:** the current recorder + `transcribeAudio` path, with the metering silence detector in the loop.
- **Choice:** a pref `voiceEngine: "device" | "server"`, default `"device"`.
  - If `isRecognitionAvailable()` is false, use `"server"` automatically, and show `voice.engineUnavailable` once.
  - Map `language-not-supported` and `service-not-allowed` to a toast, and fall back to the server engine for that turn when it is configured.

### 2b. UI
- **Settings → Aspetto**, next to "Risposte audio": "Riconoscimento vocale", a toggle between `voice.engineDevice` ("Sul telefono (consigliato)") and `voice.engineServer` ("Sul server").
  - Under it, a hint: `voice.offlineHint` ("Per usarlo offline scarica la lingua italiana in Impostazioni Android → Riconoscimento vocale").
  - Show whether Italian is installed for offline use (`voice.offlineReady` / `voice.offlineMissing`).
- **Dictation with the device engine:** the partial text shows live in the composer while you speak, and the final text goes into the draft (never sent, as now).
- **Voice loop with the device engine:** while listening, `VoiceLoopBar` shows the partial text. The turn ends on the recognizer's `final` / `end` event, not on metering.
- **Mic visibility:** the mic shows when **either** engine is usable. Device: recognition is available. Server: the existing `voiceAvailable(settings)`. Today it is hidden when the server has no transcription; with the device engine it must show.

## Tests (write first)
- Part 1: one test per item 1-7. Item 8: no recorder hook is created when voice is unavailable.
- Mock `expo-speech-recognition` in jest:
  - device engine start options (lang, interimResults, on-device flag from installedLocales, the silence extra);
  - partial events update the UI text;
  - final sends in the loop and fills the draft in dictation;
  - errors map to toasts and fall back to the server engine.
- With pref `server`, the old path is used unchanged.
- The mic shows with the device engine even when the server transcription is off.
- On web nothing changes: the voice UI stays hidden.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- `npx expo install --check` reports no new mismatch for the added package.
- No edits to `mobile/vendor/**` or to server Python.
- Commit `feat(mobile): on-device speech recognition and voice loop fixes`.
- Report in `mobile/docs/agy/reports/VC-B.md`. Say nothing was run on a device: the recognizer, offline mode and silence length need the phone test.
