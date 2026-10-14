import * as Speech from "expo-speech";
import { createStore } from "zustand";
import { i18n } from "../i18n";
import { prefs } from "../settings/prefs";
import { sessionStore } from "../state/sessionStore";

export function stripMarkdownForSpeech(md: string): string {
  if (!md) return "";
  let s = md;
  // 1. Remove fenced code blocks ```...```
  s = s.replace(/```[\s\S]*?```/g, "");
  // 2. Remove inline backtick code `code` -> code, and any remaining backticks
  s = s.replace(/`([^`]+)`/g, "$1").replace(/`/g, "");
  // 3. Remove images ![alt](url) -> ""
  s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
  // 4. Convert links [text](url) -> text
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // 5. Remove HTML tags <...>
  s = s.replace(/<[^>]+>/g, "");
  // 6. Remove headings # Heading -> Heading
  s = s.replace(/#+/g, "");
  // 7. Remove bold / italic / strike markers
  s = s.replace(/[*_~]+/g, "");
  // 8. Collapse whitespace and trim
  return s.replace(/\s+/g, " ").trim();
}

export function speechLanguage(): string {
  const lang = (i18n.language || prefs.language() || "").toLowerCase();
  return lang.startsWith("it") ? "it-IT" : "en-US";
}

export type SpeechState = {
  speakingId: string | null;
  voicePending: boolean;
  speak(id: string, markdownText: string): void;
  stop(): void;
  toggle(id: string, markdownText: string): void;
  markVoiceDictated(): void;
};

export const speechStore = createStore<SpeechState>((set, get) => ({
  speakingId: null,
  voicePending: false,

  speak(id: string, markdownText: string) {
    void Speech.stop();
    const clean = stripMarkdownForSpeech(markdownText).trim();
    if (!clean) {
      set({ speakingId: null });
      return;
    }
    set({ speakingId: id });
    const clearIfSame = () => {
      if (get().speakingId === id) set({ speakingId: null });
    };
    Speech.speak(clean, {
      language: speechLanguage(),
      onDone: clearIfSame,
      onStopped: clearIfSame,
      onError: clearIfSame,
    });
  },

  stop() {
    set({ speakingId: null, voicePending: false });
    void Speech.stop();
  },

  toggle(id: string, markdownText: string) {
    if (get().speakingId === id) {
      get().stop();
    } else {
      get().speak(id, markdownText);
    }
  },

  markVoiceDictated() {
    if (prefs.voiceAutoRead()) {
      set({ voicePending: true });
    }
  },
}));

sessionStore.subscribe((state, prev) => {
  if (state.state === "none" && prev?.state !== "none") {
    speechStore.getState().stop();
  }
});
