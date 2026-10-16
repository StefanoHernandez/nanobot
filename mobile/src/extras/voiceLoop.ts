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
  const { session } = useSession();
  const recorder = typeof useAudioRecorder === "function" ? useAudioRecorder(safePreset) : (dummyRecorder as never);

  const [machine, setMachine] = useState<VoiceLoopState>({ state: "idle", emptyCount: 0 });
  const machineRef = useRef(machine);
  machineRef.current = machine;

  const [metering, setMetering] = useState(-60);
  const detectorRef = useRef(new SilenceDetector());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnStartedAt = useRef(0);
  const recordingRef = useRef(false);

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
    setMachine((prev) => {
      const next = voiceLoopReducer(prev, event);
      if (next.state !== prev.state) {
        announce(next.state);
      }
      return next;
    });
  }, [announce]);

  const clearTick = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dropFile = useCallback(() => {
    try {
      if (recorder.uri) new File(recorder.uri).delete();
    } catch {}
  }, [recorder]);

  const resetAudioMode = useCallback(() => {
    return setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  }, []);

  // Full stop & cleanup
  const stopAll = useCallback(async () => {
    clearTick();
    recordingRef.current = false;
    try {
      await recorder.stop();
    } catch {}
    dropFile();
    await resetAudioMode();
    speechStore.getState().stop();
    try {
      await deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch {}
  }, [recorder, clearTick, dropFile, resetAudioMode]);

  const stop = useCallback(async () => {
    await stopAll();
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
      await recorder.stop();
    } catch {}

    const uri = recorder.uri;
    try {
      if (!uri || durationMs < 200) {
        dispatch({ type: "transcript", text: "" });
        return;
      }
      const dataUrl = `data:audio/mp4;base64,${await new File(uri).base64()}`;
      if (session?.frameLimit != null && dataUrl.length + (session.frameReserve ?? 256) > session.frameLimit) {
        toast.show(i18n.t("voice.error.tooBig"));
        await stopAll();
        dispatch({ type: "transcriptError", error: "tooBig" });
        return;
      }
      if (!session) {
        await stopAll();
        dispatch({ type: "transcriptError", error: "unavailable" });
        return;
      }
      const text = await session.client.transcribeAudio(dataUrl, { durationMs });
      dropFile();
      await resetAudioMode();

      const trimmed = text?.trim() ?? "";
      if (!trimmed) {
        dispatch({ type: "transcript", text: "" });
      } else {
        dispatch({ type: "transcript", text: trimmed });
        threadStore.getState().send(session, chatKey, trimmed);
        speechStore.getState().markVoiceDictated(chatKey, true);
      }
    } catch (e) {
      dropFile();
      await resetAudioMode();
      await stopAll();
      dispatch({ type: "transcriptError", error: e instanceof Error ? e.message : "transcription" });
      toast.show(i18n.t("voice.error.transcription"));
      announce("error");
    }
  }, [recorder, session, chatKey, clearTick, dropFile, resetAudioMode, stopAll, dispatch, announce]);

  // Start recording when entering "listening"
  const startRecording = useCallback(async () => {
    if (recordingRef.current) return;
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        toast.show(i18n.t("voice.error.permission"));
        await stop();
        return;
      }
      await setAudioModeAsync({ allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
    } catch {
      await stop();
      toast.show(i18n.t("voice.error.unavailable"));
      return;
    }

    turnStartedAt.current = Date.now();
    detectorRef.current.reset(turnStartedAt.current);
    clearTick();

    timerRef.current = setInterval(() => {
      const status = (recorder as { getStatus?: () => { metering?: number } }).getStatus?.();
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
  }, [recorder, clearTick, dispatch, runTranscription, stopAll, stop, announce]);

  // Trigger recording when state changes to "listening"
  useEffect(() => {
    if (machine.state === "listening" && !recordingRef.current) {
      void startRecording();
    }
  }, [machine.state, startRecording]);

  // Start the entire loop from idle
  const start = useCallback(async () => {
    try {
      await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    } catch {}
    dispatch({ type: "start" });
    await startRecording();
  }, [dispatch, startRecording]);

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
        // Check if speech was queued or if speakingId is already active
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
    start,
    stop,
    interrupt,
  };
}
