import { useCallback, useEffect, useRef, useState } from "react";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { File } from "expo-file-system";
import { useSession } from "../state/sessionStore";
import type { SettingsPayload } from "@/lib/types";

export const VOICE_MIN_MS = 650;
export const VOICE_MAX_MS = 120_000;

/** Error codes; the UI maps them to i18n. `transcription` may carry `: detail`. */
export type VoiceError = "permission" | "tooShort" | "tooLong" | "tooBig" | "transcription" | "unavailable";
export type VoiceState = "idle" | "recording" | "transcribing" | "error";

export function voiceAvailable(settings: Pick<SettingsPayload, "transcription"> | null | undefined): boolean {
  const t = settings?.transcription;
  // ponytail: xiaomi_mimo needs WAV conversion (web does it in a Worker); unsupported in v1, add a PCM/WAV recorder if needed.
  return !!t && t.enabled && t.provider_configured && t.provider !== "xiaomi_mimo";
}

/** onTranscript receives the text when the 120 s auto-stop (not a manual stop()) finishes. */
export function useVoiceInput(onTranscript?: (text: string) => void) {
  const { session } = useSession();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<VoiceState>("idle");
  const [elapsedMs, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const busy = useRef(false);
  const cb = useRef(onTranscript);
  cb.current = onTranscript;

  const clearTick = () => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
  };
  const recording = useRef(false);
  const resetMode = () => setAudioModeAsync({ allowsRecording: false }).catch(() => {});

  const fail = (code: string) => {
    setError(code);
    setState("error");
    return null;
  };
  const dropFile = () => {
    try { if (recorder.uri) new File(recorder.uri).delete(); } catch {}
  };
  // Unmount while recording: stop, delete the temp file, reset the audio mode, clear the timer.
  const unmount = useRef(() => {});
  unmount.current = () => {
    clearTick();
    if (!recording.current) return;
    recording.current = false;
    recorder.stop().catch(() => {}).finally(() => { dropFile(); resetMode(); });
  };
  useEffect(() => () => unmount.current(), []);

  const finish = useCallback(async (): Promise<string | null> => {
    clearTick();
    recording.current = false;
    const durationMs = Date.now() - startedAt.current;
    try { await recorder.stop(); } catch {}
    const uri = recorder.uri;
    try {
      if (!uri || durationMs < VOICE_MIN_MS) return fail("tooShort");
      const dataUrl = `data:audio/mp4;base64,${await new File(uri).base64()}`;
      if (session?.frameLimit != null && dataUrl.length + (session.frameReserve ?? 256) > session.frameLimit) return fail("tooBig");
      setState("transcribing");
      const text = await session!.client.transcribeAudio(dataUrl, { durationMs });
      setState("idle");
      return text;
    } catch (e) {
      const d = e instanceof Error && e.message !== "error" ? e.message : "";
      return fail(d ? `transcription: ${d}` : "transcription");
    } finally {
      dropFile();
      resetMode();
      busy.current = false;
    }
  }, [recorder, session]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(async () => {
    if (busy.current) return;
    if (!session) { fail("unavailable"); return; }
    busy.current = true;
    setError(null);
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) { busy.current = false; fail("permission"); return; }
      await setAudioModeAsync({ allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recording.current = true;
    } catch {
      busy.current = false;
      resetMode();
      fail("unavailable");
      return;
    }
    startedAt.current = Date.now();
    setElapsed(0);
    setState("recording");
    tick.current = setInterval(() => {
      const e = Date.now() - startedAt.current;
      setElapsed(Math.min(e, VOICE_MAX_MS));
      if (e >= VOICE_MAX_MS) finish().then((t) => t != null && cb.current?.(t));
    }, 200);
  }, [session, recorder, finish]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => (state === "recording" ? finish() : Promise.resolve(null)), [state, finish]);

  const cancel = useCallback(() => {
    if (state !== "recording") return;
    clearTick();
    recording.current = false;
    recorder.stop().catch(() => {}).finally(() => { dropFile(); resetMode(); });
    busy.current = false;
    setState("idle");
  }, [state, recorder]); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, elapsedMs, error, start, stop, cancel };
}
