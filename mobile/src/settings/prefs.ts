import { i18n } from "../i18n";
import { kv } from "../platform/storage";

export type Language = "system" | "it" | "en";
export type VoiceEngine = "device" | "server";
const LANG = "pref.language";
const SOUND = "pref.notificationSound";
const KANBAN_NOTIFY = "pref.kanbanNotifications";
const kanbanNotifyListeners = new Set<() => void>();
const BACKGROUND_CONN = "pref.backgroundConnection";
const backgroundConnListeners = new Set<() => void>();
const AUTO_READ = "pref.voiceAutoRead";
const AUDIO = "pref.audioReplies";
const VOICE_ENGINE = "pref.voiceEngine";
const DEFAULT_TEMP = "pref.defaultTemperature";

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
  /** Board task notifications; on unless explicitly disabled. */
  kanbanNotifications: (): boolean => kv.get(KANBAN_NOTIFY) !== "0",
  setKanbanNotifications(on: boolean): void {
    kv.set(KANBAN_NOTIFY, on ? "1" : "0");
    for (const listener of kanbanNotifyListeners) listener();
  },
  /** The main layout does not re-render when this switch changes. */
  subscribeKanbanNotifications(listener: () => void): () => void {
    kanbanNotifyListeners.add(listener);
    return () => {
      kanbanNotifyListeners.delete(listener);
    };
  },
  /** Background connection via foreground service; on unless explicitly disabled. */
  backgroundConnection: (): boolean => kv.get(BACKGROUND_CONN) !== "0",
  setBackgroundConnection(on: boolean): void {
    kv.set(BACKGROUND_CONN, on ? "1" : "0");
    for (const listener of backgroundConnListeners) listener();
  },
  subscribeBackgroundConnection(listener: () => void): () => void {
    backgroundConnListeners.add(listener);
    return () => {
      backgroundConnListeners.delete(listener);
    };
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
  /** "Voice engine": "device" (default) or "server". */
  voiceEngine: (): VoiceEngine => {
    const v = kv.get(VOICE_ENGINE);
    return v === "server" ? "server" : "device";
  },
  setVoiceEngine(e: VoiceEngine): void {
    kv.set(VOICE_ENGINE, e);
  },
  defaultTemperature: (): number => {
    const v = kv.get(DEFAULT_TEMP);
    if (!v) return 0.1;
    const n = parseFloat(v);
    return !isNaN(n) && n >= 0 && n <= 2 ? Math.round(n * 10) / 10 : 0.1;
  },
  setDefaultTemperature(t: number): void {
    const clamped = Math.max(0, Math.min(2, Math.round(t * 10) / 10));
    kv.set(DEFAULT_TEMP, String(clamped));
  },
};

