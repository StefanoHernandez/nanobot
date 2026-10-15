export const VOICE_MIN_MS = 650;
export const VOICE_MAX_MS = 120_000;

export type VoiceError = "permission" | "tooShort" | "tooLong" | "tooBig" | "transcription" | "unavailable";
export type VoiceState = "idle" | "recording" | "transcribing" | "error";

/** The browser does not record. Continuous voice stays on the phone. */
export function voiceAvailable(_settings?: unknown): boolean {
  return false;
}

export function useVoiceInput(_onTranscript?: (text: string) => void) {
  return {
    state: "idle" as VoiceState,
    elapsedMs: 0,
    error: null as string | null,
    start: async () => {},
    stop: async () => null as string | null,
    cancel: () => {},
  };
}
