import { i18n } from "../i18n";
import { kv } from "../platform/storage";

export type Language = "system" | "it" | "en";
const LANG = "pref.language";
const SOUND = "pref.notificationSound";
const AUTO_READ = "pref.voiceAutoRead";
const AUDIO = "pref.audioReplies";

const device = () => Intl.DateTimeFormat().resolvedOptions().locale.split("-")[0];

export const prefs = {
  language: (): Language => {
    const v = kv.get(LANG);
    return v === "it" || v === "en" ? v : "system";
  },
  setLanguage(l: Language): void {
    if (l === "system") kv.del(LANG);
    else kv.set(LANG, l);
    void i18n.changeLanguage(l === "system" ? device() : l);
  },
  notificationSound: (): boolean => kv.get(SOUND) === "1",
  setNotificationSound(on: boolean): void {
    kv.set(SOUND, on ? "1" : "0");
  },
  /** "Audio replies": shows the Listen button (on-device TTS, free). Off by default. */
  audioReplies: (): boolean => kv.get(AUDIO) === "1",
  setAudioReplies(on: boolean): void {
    kv.set(AUDIO, on ? "1" : "0");
  },
  voiceAutoRead: (): boolean => kv.get(AUTO_READ) === "1",
  setVoiceAutoRead(on: boolean): void {
    kv.set(AUTO_READ, on ? "1" : "0");
  },
};
