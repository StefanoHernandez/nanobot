import * as Speech from "expo-speech";
import { createStore } from "zustand";
import { i18n } from "../i18n";
import { prefs } from "../settings/prefs";
import { sessionStore } from "../state/sessionStore";
import { threadStore } from "../state/threadStore";

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
  // 6. Remove heading markers ("# " after whitespace; keeps "C#", "#1"), quotes and bullets
  s = s.replace(/(^|\s)#{1,6}[ \t]+/g, "$1");
  s = s.replace(/^[ \t]*(>[ \t]?|[-*+][ \t]+)/gm, "");
  // 7. Remove paired emphasis only (keeps "snake_case", "2*3")
  s = s.replace(/(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/g, "$2");
  s = s.replace(/(^|[^\w*])[*_](?=\S)([^*_\n]*?\S)[*_](?![\w*])/g, "$1$2");
  // 8. Collapse whitespace and trim
  return s.replace(/\s+/g, " ").trim();
}

export function speechLanguage(): string {
  const lang = (i18n.language || prefs.language() || "").toLowerCase();
  return lang.startsWith("it") ? "it-IT" : "en-US";
}

/** Android TTS refuses input longer than maxSpeechInputLength: split at sentence/word boundaries. */
export function chunkForSpeech(text: string, max: number = Speech.maxSpeechInputLength || 4000): string[] {
  const limit = Math.max(1, Math.min(max, 4000) - 100);
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const slice = rest.slice(0, limit);
    const cut = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "), slice.lastIndexOf("\n"));
    const at = cut > limit / 2 ? cut + 1 : slice.lastIndexOf(" ") > 0 ? slice.lastIndexOf(" ") : limit;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export type SpeechState = {
  /** Mirrors prefs.audioReplies() so rows re-render when the setting changes. */
  enabled: boolean;
  setEnabled(on: boolean): void;
  speakingId: string | null;
  /** Chat whose next finished turn is auto-read (set by voice dictation), else null. */
  voicePending: string | null;
  speak(id: string, markdownText: string): void;
  stop(): void;
  toggle(id: string, markdownText: string): void;
  markVoiceDictated(chatKey: string, force?: boolean): void;
};

export const speechStore = createStore<SpeechState>((set, get) => ({
  enabled: prefs.audioReplies(),
  setEnabled(on: boolean) {
    prefs.setAudioReplies(on);
    if (!on) get().stop();
    set({ enabled: on });
  },
  speakingId: null,
  voicePending: null,

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
    // QUEUE_ADD on Android: chunks play in order; only the last one ends the "speaking" state.
    const chunks = chunkForSpeech(clean);
    chunks.forEach((chunk, i) => {
      const last = i === chunks.length - 1;
      Speech.speak(chunk, {
        language: speechLanguage(),
        ...(last ? { onDone: clearIfSame } : {}),
        onStopped: clearIfSame,
        onError: clearIfSame,
      });
    });
  },

  stop() {
    set({ speakingId: null, voicePending: null });
    void Speech.stop();
  },

  toggle(id: string, markdownText: string) {
    if (get().speakingId === id) {
      get().stop();
    } else {
      get().speak(id, markdownText);
    }
  },

  markVoiceDictated(chatKey: string, force = false) {
    if (get().enabled && (force || prefs.voiceAutoRead())) {
      set({ voicePending: chatKey });
    }
  },
}));

sessionStore.subscribe((state, prev) => {
  if (state.state === "none" && prev?.state !== "none") {
    speechStore.getState().stop();
  }
});

// Auto-read: when the dictated chat's turn ends, read every answer segment of that turn (after the last
// user message), once. Bound to the chat key, so scrolling or other chats never consume it.
threadStore.subscribe((state, prev) => {
  const key = speechStore.getState().voicePending;
  if (!key) return;
  const cur = state.threads[key];
  if (!cur || cur.running || !prev.threads[key]?.running) return;
  const lastUser = cur.messages.map((m) => m.role).lastIndexOf("user");
  const answers = cur.messages.slice(lastUser + 1).filter((m) => m.role === "assistant" && m.kind !== "trace" && m.content);
  speechStore.setState({ voicePending: null });
  if (answers.length) speechStore.getState().speak(answers[answers.length - 1].id, answers.map((m) => m.content).join("\n\n"));
});
