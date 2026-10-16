import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState } from "react-native";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { File } from "expo-file-system";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { i18n } from "../i18n";
import { speechStore } from "./speech";
import { useSession } from "../state/sessionStore";
import { threadStore } from "../state/threadStore";
import { toast } from "../ui/components/Toast";
import { DeviceSttEngine, isRecognitionAvailable, warnEngineUnavailableOnce } from "./sttEngine";
import { prefs } from "../settings/prefs";
import { settingsStore } from "../settings/store";
import { voiceAvailable } from "./voice";
import type { SettingsPayload } from "@/lib/types";

// ponytail: speech detection threshold; levels above this start speech detection. May need tuning per phone.
export const SPEECH_DB = -40;

// ponytail: minimum duration of sound above threshold to confirm speech start. May need tuning per phone.
export const SPEECH_MIN_MS = 200;

// ponytail: silence detection threshold; levels below this count as silence. May need tuning per phone.
export const SILENCE_DB = -50;

// ponytail: silence duration after speech to detect end of turn. May need tuning per phone.
export const SILENCE_DURATION_MS = 1500;

// ponytail: safety cap for maximum turn length. May need tuning per phone.
export const MAX_TURN_MS = 60_000;

// ponytail: safety timeout when nobody speaks after entering listening. May need tuning per phone.
export const NO_SPEECH_TIMEOUT_MS = 10_000;

export const WAITING_TIMEOUT_MS = 180_000;

export const KEEP_AWAKE_TAG = "voice-loop";

export type SilenceEvent = "speechStart" | "silence" | "maxDuration" | "noSpeechTimeout" | null;

export interface SilenceDetectorOptions {
  speechDb?: number;
  speechMinMs?: number;
  silenceDb?: number;
  silenceDurationMs?: number;
  maxTurnMs?: number;
  noSpeechTimeoutMs?: number;
}

export class SilenceDetector {
  private speechDb: number;
  private speechMinMs: number;
  private silenceDb: number;
  private silenceDurationMs: number;
  private maxTurnMs: number;
  private noSpeechTimeoutMs: number;

  private speechStarted = false;
  private speechCandidateAt: number | null = null;
  private silenceStartAt: number | null = null;
  private turnStartedAt: number | null = null;

  constructor(opts?: SilenceDetectorOptions) {
    this.speechDb = opts?.speechDb ?? SPEECH_DB;
    this.speechMinMs = opts?.speechMinMs ?? SPEECH_MIN_MS;
    this.silenceDb = opts?.silenceDb ?? SILENCE_DB;
    this.silenceDurationMs = opts?.silenceDurationMs ?? SILENCE_DURATION_MS;
    this.maxTurnMs = opts?.maxTurnMs ?? MAX_TURN_MS;
    this.noSpeechTimeoutMs = opts?.noSpeechTimeoutMs ?? NO_SPEECH_TIMEOUT_MS;
  }

  reset(initialTimeMs?: number): void {
    this.speechStarted = false;
    this.speechCandidateAt = null;
    this.silenceStartAt = null;
    this.turnStartedAt = initialTimeMs ?? null;
  }

  push(db: number, tMs: number): SilenceEvent {
    if (this.turnStartedAt === null) {
      this.turnStartedAt = tMs;
    }

    if (tMs - this.turnStartedAt >= this.maxTurnMs) {
      return "maxDuration";
    }

    if (!this.speechStarted) {
      if (tMs - this.turnStartedAt >= this.noSpeechTimeoutMs) {
        return "noSpeechTimeout";
      }

      if (db >= this.speechDb) {
        if (this.speechCandidateAt === null) {
          this.speechCandidateAt = tMs;
        }
        if (tMs - this.speechCandidateAt >= this.speechMinMs) {
          this.speechStarted = true;
          this.silenceStartAt = null;
          return "speechStart";
        }
      } else {
        this.speechCandidateAt = null;
      }
      return null;
    }

    // Speech has started; check for silence
    if (db <= this.silenceDb) {
      if (this.silenceStartAt === null) {
        this.silenceStartAt = tMs;
      }
      if (tMs - this.silenceStartAt >= this.silenceDurationMs) {
        return "silence";
      }
    } else {
      this.silenceStartAt = null;
    }

    return null;
  }
}

export function silenceDetector(
  samples: Array<{ db: number; tMs: number }>,
  opts?: SilenceDetectorOptions,
): SilenceEvent[] {
  const detector = new SilenceDetector(opts);
  const events: SilenceEvent[] = [];
  for (const s of samples) {
    const ev = detector.push(s.db, s.tMs);
    if (ev) events.push(ev);
  }
  return events;
}

export type VoiceLoopStatus = "idle" | "listening" | "transcribing" | "waiting" | "speaking";

export interface VoiceLoopState {
  state: VoiceLoopStatus;
  emptyCount: number;
}

export type VoiceLoopEvent =
  | { type: "start" }
  | { type: "speechStart" }
  | { type: "silence" }
  | { type: "maxDuration" }
  | { type: "noSpeechTimeout" }
  | { type: "transcript"; text: string }
  | { type: "transcriptError"; error?: string }
  | { type: "turnEnded"; hasText: boolean }
  | { type: "speakingDone" }
  | { type: "interrupt" }
  | { type: "stop" }
  | { type: "background" };

export function voiceLoopReducer(
  state: VoiceLoopState | { state: VoiceLoopStatus; emptyCount?: number },
  event: VoiceLoopEvent,
): VoiceLoopState {
  const currentStatus = state.state;
  const emptyCount = state.emptyCount ?? 0;

  if (event.type === "stop" || event.type === "background") {
    return { state: "idle", emptyCount: 0 };
  }

  switch (currentStatus) {
    case "idle":
      if (event.type === "start") {
        return { state: "listening", emptyCount: 0 };
      }
      return { state: "idle", emptyCount };

    case "listening":
      if (event.type === "silence" || event.type === "maxDuration") {
        return { state: "transcribing", emptyCount };
      }
      if (event.type === "noSpeechTimeout") {
        return { state: "idle", emptyCount: 0 };
      }
      if (event.type === "transcript") {
        const text = event.text?.trim() ?? "";
        if (!text) {
          const nextCount = emptyCount + 1;
          if (nextCount >= 2) {
            return { state: "idle", emptyCount: 0 };
          }
          return { state: "listening", emptyCount: nextCount };
        }
        return { state: "waiting", emptyCount: 0 };
      }
      if (event.type === "transcriptError") {
        return { state: "idle", emptyCount: 0 };
      }
      return { state: "listening", emptyCount };

    case "transcribing":
      if (event.type === "transcript") {
        const text = event.text?.trim() ?? "";
        if (!text) {
          const nextCount = emptyCount + 1;
          if (nextCount >= 2) {
            return { state: "idle", emptyCount: 0 };
          }
          return { state: "listening", emptyCount: nextCount };
        }
        return { state: "waiting", emptyCount: 0 };
      }
      if (event.type === "transcriptError") {
        return { state: "idle", emptyCount: 0 };
      }
      return { state: "transcribing", emptyCount };

    case "waiting":
      if (event.type === "turnEnded") {
        if (event.hasText) {
          return { state: "speaking", emptyCount: 0 };
        }
        return { state: "listening", emptyCount: 0 };
      }
      return { state: "waiting", emptyCount };

    case "speaking":
      if (event.type === "speakingDone" || event.type === "interrupt") {
        return { state: "listening", emptyCount: 0 };
      }
      return { state: "speaking", emptyCount };

    default:
      return { state: "idle", emptyCount: 0 };
  }
}

const safePreset =
  typeof RecordingPresets !== "undefined" && RecordingPresets?.HIGH_QUALITY
    ? { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }
    : ({ extension: ".m4a", isMeteringEnabled: true } as never);

const dummyRecorder = {
  uri: null as string | null,
  prepareToRecordAsync: async () => {},
  record: () => {},
  stop: async () => {},
  getStatus: () => ({ isRecording: false, metering: -60 }),
};

export function useVoiceLoop(chatKey: string) {
  const { session, state: sessionState } = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const sessionStateRef = useRef(sessionState);
  sessionStateRef.current = sessionState;

  const recorder = typeof useAudioRecorder === "function" ? useAudioRecorder(safePreset) : (dummyRecorder as never);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  const [machine, setMachine] = useState<VoiceLoopState>({ state: "idle", emptyCount: 0 });
  const machineRef = useRef(machine);

  const [metering, setMetering] = useState(-60);
  const [partialText, setPartialText] = useState("");
  const deviceEngineRef = useRef<DeviceSttEngine | null>(null);
  const lastFinalRef = useRef("");
  const detectorRef = useRef(new SilenceDetector());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnStartedAt = useRef(0);
  const recordingRef = useRef(false);
  const loopTokenRef = useRef(0);

  const level = Math.max(0, Math.min(1, (metering + 60) / 60));

  const announce = useCallback((status: VoiceLoopStatus | "noSpeech" | "error") => {
    try {
      if (status === "noSpeech") {
        AccessibilityInfo.announceForAccessibility(i18n.t("voiceLoop.noSpeech"));
      } else if (status === "error") {
        AccessibilityInfo.announceForAccessibility(i18n.t("voice.error.transcription"));
      } else {
        AccessibilityInfo.announceForAccessibility(i18n.t(`voiceLoop.${status}`));
      }
    } catch {}
  }, []);

  const dispatch = useCallback((event: VoiceLoopEvent) => {
    const prev = machineRef.current;
    const next = voiceLoopReducer(prev, event);
    machineRef.current = next;
    setMachine(next);
    if (next.state !== prev.state) {
      announce(next.state);
    }
  }, [announce]);

  const clearTick = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dropFile = useCallback(() => {
    try {
      if (recorderRef.current.uri) new File(recorderRef.current.uri).delete();
    } catch {}
  }, []);

  const resetAudioMode = useCallback(() => {
    return setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  }, []);

  // Full stop & cleanup
  const stopAll = useCallback(async () => {
    loopTokenRef.current += 1;
    clearTick();
    if (waitingTimerRef.current) {
      clearTimeout(waitingTimerRef.current);
      waitingTimerRef.current = null;
    }
    recordingRef.current = false;
    setPartialText("");
    if (deviceEngineRef.current) {
      const eng = deviceEngineRef.current;
      deviceEngineRef.current = null;
      try {
        await eng.cancel();
      } catch {}
    }
    try {
      await recorderRef.current.stop();
    } catch {}
    dropFile();
    await resetAudioMode();
    speechStore.getState().stop();
    try {
      await deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch {}
  }, [clearTick, dropFile, resetAudioMode]);

  const stop = useCallback(async () => {
    const engine = deviceEngineRef.current;
    let kept = "";
    if (engine) {
      deviceEngineRef.current = null;
      try {
        kept = ((await engine.stop()) ?? "").trim();
      } catch {
        kept = "";
      }
    }
    await stopAll();
    if (kept) dispatch({ type: "transcript", text: kept });
    dispatch({ type: "stop" });
  }, [stopAll, dispatch]);

  const interrupt = useCallback(async () => {
    speechStore.getState().stop();
    dispatch({ type: "interrupt" });
  }, [dispatch]);

  // Transcribe recorded turn
  const runTranscription = useCallback(async () => {
    clearTick();
    recordingRef.current = false;
    const durationMs = Date.now() - turnStartedAt.current;
    try {
      await recorderRef.current.stop();
    } catch {}

    const uri = recorderRef.current.uri;
    const token = loopTokenRef.current;
    try {
      if (!uri || durationMs < 200) {
        dropFile();
        await resetAudioMode();
        dispatch({ type: "transcript", text: "" });
        return;
      }
      const dataUrl = `data:audio/mp4;base64,${await new File(uri).base64()}`;
      if (token !== loopTokenRef.current) {
        dropFile();
        await resetAudioMode();
        return;
      }
      const currentSession = sessionRef.current;
      if (!currentSession) {
        dropFile();
        await resetAudioMode();
        await stopAll();
        toast.show(i18n.t("common.operationFailed"));
        dispatch({ type: "stop" });
        return;
      }
      if (currentSession.frameLimit != null && dataUrl.length + (currentSession.frameReserve ?? 256) > currentSession.frameLimit) {
        dropFile();
        await resetAudioMode();
        toast.show(i18n.t("voice.error.tooBig"));
        await stopAll();
        dispatch({ type: "transcriptError", error: "tooBig" });
        return;
      }

      const text = await currentSession.client.transcribeAudio(dataUrl, { durationMs });
      dropFile();
      await resetAudioMode();

      if (token !== loopTokenRef.current) {
        return;
      }

      const trimmed = text?.trim() ?? "";
      if (!trimmed) {
        dispatch({ type: "transcript", text: "" });
      } else {
        const sent = threadStore.getState().send(currentSession, chatKey, trimmed);
        if (!sent) {
          await stopAll();
          toast.show(i18n.t("common.operationFailed"));
          dispatch({ type: "stop" });
          return;
        }
        speechStore.getState().markVoiceDictated(chatKey, true);
        dispatch({ type: "transcript", text: trimmed });
      }
    } catch (e) {
      dropFile();
      await resetAudioMode();
      if (token !== loopTokenRef.current) return;
      await stopAll();
      dispatch({ type: "transcriptError", error: e instanceof Error ? e.message : "transcription" });
      toast.show(i18n.t("voice.error.transcription"));
      announce("error");
    }
  }, [chatKey, clearTick, dropFile, resetAudioMode, stopAll, dispatch, announce]);

  // Start recording when entering "listening"
  const startRecording = useCallback(async () => {
    if (recordingRef.current) return;
    recordingRef.current = true;
    const token = loopTokenRef.current;

    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (token !== loopTokenRef.current) {
        recordingRef.current = false;
        return;
      }
      if (!granted) {
        recordingRef.current = false;
        toast.show(i18n.t("voice.error.permission"));
        await stop();
        return;
      }
      await setAudioModeAsync({ allowsRecording: true });
      if (token !== loopTokenRef.current) {
        recordingRef.current = false;
        await resetAudioMode();
        return;
      }
      await recorderRef.current.prepareToRecordAsync();
      if (token !== loopTokenRef.current) {
        recordingRef.current = false;
        try { await recorderRef.current.stop(); } catch {}
        dropFile();
        await resetAudioMode();
        return;
      }
      recorderRef.current.record();
    } catch {
      recordingRef.current = false;
      if (token !== loopTokenRef.current) return;
      await stop();
      toast.show(i18n.t("voice.error.unavailable"));
      return;
    }

    if (token !== loopTokenRef.current) return;

    turnStartedAt.current = Date.now();
    detectorRef.current.reset(turnStartedAt.current);
    clearTick();

    timerRef.current = setInterval(() => {
      if (token !== loopTokenRef.current) {
        clearTick();
        return;
      }
      const status = (recorderRef.current as { getStatus?: () => { metering?: number } }).getStatus?.();
      const db = status?.metering ?? -60;
      setMetering(db);

      const now = Date.now();
      const ev = detectorRef.current.push(db, now);

      if (ev === "speechStart") {
        // speech confirmed
      } else if (ev === "silence" || ev === "maxDuration") {
        clearTick();
        dispatch({ type: ev });
        void runTranscription();
      } else if (ev === "noSpeechTimeout") {
        clearTick();
        void stopAll().then(() => {
          dispatch({ type: "noSpeechTimeout" });
          toast.show(i18n.t("voiceLoop.noSpeech"));
          announce("noSpeech");
        });
      }
    }, 100);
  }, [clearTick, dispatch, runTranscription, stopAll, stop, announce, dropFile, resetAudioMode]);

  const checkServerConfigured = async (): Promise<boolean> => {
    const cur = settingsStore.getState().data;
    if (cur) return voiceAvailable(cur);
    const sess = sessionRef.current;
    if (sess?.get) {
      try {
        const st = await sess.get<SettingsPayload>("/api/settings");
        settingsStore.getState().setData(st);
        return voiceAvailable(st);
      } catch {}
    }
    return false;
  };

  const startDeviceListening = useCallback(async () => {
    if (recordingRef.current) return;
    recordingRef.current = true;
    const token = loopTokenRef.current;

    const engine = new DeviceSttEngine();
    deviceEngineRef.current = engine;
    lastFinalRef.current = "";
    setPartialText("");

    engine.on("partial", (text) => {
      if (token !== loopTokenRef.current) return;
      setPartialText(text);
    });

    engine.on("final", (text) => {
      if (token !== loopTokenRef.current) return;
      lastFinalRef.current = text;
    });

    engine.on("end", async () => {
      if (token !== loopTokenRef.current) return;
      recordingRef.current = false;
      deviceEngineRef.current = null;
      setPartialText("");

      const text = (lastFinalRef.current || "").trim();
      if (!text) {
        dispatch({ type: "transcript", text: "" });
        return;
      }

      const currentSession = sessionRef.current;
      if (!currentSession) {
        await stopAll();
        toast.show(i18n.t("common.operationFailed"));
        dispatch({ type: "stop" });
        return;
      }

      const sent = threadStore.getState().send(currentSession, chatKey, text);
      if (!sent) {
        await stopAll();
        toast.show(i18n.t("common.operationFailed"));
        dispatch({ type: "stop" });
        return;
      }

      speechStore.getState().markVoiceDictated(chatKey, true);
      dispatch({ type: "transcript", text });
    });

    engine.on("error", async (code) => {
      if (token !== loopTokenRef.current) return;
      recordingRef.current = false;
      deviceEngineRef.current = null;
      setPartialText("");

      if (code === "language-not-supported" || code === "service-not-allowed") {
        toast.show(i18n.t(`voice.error.${code}`, { defaultValue: i18n.t("voice.error.transcription") }));
        const canFallback = await checkServerConfigured();
        if (token !== loopTokenRef.current) return; // Termina while asking the server
        if (canFallback) {
          void startRecording();
          return;
        }
        await stopAll();
        dispatch({ type: "stop" });
      } else if (code === "speech-timeout" || code === "no-match") {
        dispatch({ type: "transcript", text: "" });
      } else {
        toast.show(i18n.t(code === "not-allowed" ? "voice.error.permission" : "voice.error.transcription"));
        await stopAll();
        dispatch({ type: "stop" });
      }
    });

    try {
      await engine.start({ continuous: false });
    } catch {
      recordingRef.current = false;
      deviceEngineRef.current = null;
      if (token !== loopTokenRef.current) return;
      await stop();
      toast.show(i18n.t("voice.error.unavailable"));
    }
  }, [chatKey, dispatch, startRecording, stopAll, stop]);

  const startListeningTurn = useCallback(async () => {
    const pref = prefs.voiceEngine();
    if (pref === "server") {
      void startRecording();
      return;
    }
    if (!isRecognitionAvailable()) {
      warnEngineUnavailableOnce();
      void startRecording();
      return;
    }
    await startDeviceListening();
  }, [startRecording, startDeviceListening]);

  // Trigger recording when state changes to "listening"
  useEffect(() => {
    if (machine.state === "listening" && !recordingRef.current) {
      void startListeningTurn();
    }
  }, [machine.state, startListeningTurn]);

  // Start the entire loop from idle (only bumps generation and dispatches start; effect enters recording)
  const start = useCallback(async () => {
    loopTokenRef.current += 1;
    try {
      await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    } catch {}
    dispatch({ type: "start" });
  }, [dispatch]);

  // Waiting timeout: 180s in waiting ends the loop
  useEffect(() => {
    if (machine.state === "waiting") {
      waitingTimerRef.current = setTimeout(() => {
        if (machineRef.current.state === "waiting") {
          void stop();
        }
      }, WAITING_TIMEOUT_MS);
    } else {
      if (waitingTimerRef.current) {
        clearTimeout(waitingTimerRef.current);
        waitingTimerRef.current = null;
      }
    }
    return () => {
      if (waitingTimerRef.current) {
        clearTimeout(waitingTimerRef.current);
        waitingTimerRef.current = null;
      }
    };
  }, [machine.state, stop]);

  // Session changes or closes -> end loop
  const prevSessionRef = useRef(session);
  useEffect(() => {
    if (machineRef.current.state !== "idle") {
      if (!session || sessionState !== "open" || prevSessionRef.current !== session) {
        void stop();
      }
    }
    prevSessionRef.current = session;
  }, [session, sessionState, stop]);

  // AppState background / inactive listener
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" && machineRef.current.state !== "idle") {
        void stopAll().then(() => {
          dispatch({ type: "background" });
        });
      }
    });
    return () => sub.remove();
  }, [stopAll, dispatch]);

  // Watch speechStore speakingId when in waiting or speaking
  useEffect(() => {
    return speechStore.subscribe((cur, prev) => {
      const curState = machineRef.current.state;
      if (curState === "waiting") {
        if (cur.speakingId && !prev.speakingId) {
          dispatch({ type: "turnEnded", hasText: true });
        }
      } else if (curState === "speaking") {
        if (!cur.speakingId && prev.speakingId) {
          dispatch({ type: "speakingDone" });
        }
      }
    });
  }, [dispatch]);

  // Watch threadStore running state when waiting (in case turn ends without assistant text)
  useEffect(() => {
    return threadStore.subscribe((cur, prev) => {
      if (machineRef.current.state !== "waiting") return;
      const thCur = cur.threads[chatKey];
      const thPrev = prev.threads[chatKey];
      if (thPrev?.running && thCur && !thCur.running) {
        // Turn ended on thread
        setTimeout(() => {
          if (machineRef.current.state === "waiting") {
            const speaking = speechStore.getState().speakingId;
            if (!speaking) {
              dispatch({ type: "turnEnded", hasText: false });
            }
          }
        }, 50);
      }
    });
  }, [chatKey, dispatch]);

  // Cleanup on unmount or chatKey change
  useEffect(() => {
    return () => {
      if (machineRef.current.state !== "idle") {
        void stopAll();
      }
    };
  }, [chatKey, stopAll]);

  return {
    state: machine.state,
    metering,
    level,
    partialText,
    start,
    stop,
    interrupt,
  };
}
