import { Platform } from "react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { speechLanguage } from "./speech";
import { prefs, type VoiceEngine } from "../settings/prefs";
import { voiceAvailable } from "./voice";
import { toast } from "../ui/components/Toast";
import { i18n } from "../i18n";
import type { SettingsPayload } from "@/lib/types";

// ponytail: default 1500ms complete silence threshold for speech recognizer; tune on real device if needed
export const DEVICE_SILENCE_MS = 1500;

export type SttEvents = {
  partial: (text: string) => void;
  final: (text: string) => void;
  end: () => void;
  error: (code: string) => void;
};

export interface SttEngine {
  readonly name: VoiceEngine;
  start(opts?: { continuous?: boolean }): Promise<void>;
  stop(): Promise<string | null>;
  cancel(): Promise<void>;
  on<K extends keyof SttEvents>(event: K, listener: SttEvents[K]): () => void;
}

let installedLocalesCache: string[] | null = null;

export async function getInstalledLocales(fresh = false): Promise<string[]> {
  if (installedLocalesCache && !fresh) return installedLocalesCache;
  try {
    if (typeof ExpoSpeechRecognitionModule?.getSupportedLocales === "function") {
      const res = await ExpoSpeechRecognitionModule.getSupportedLocales({
        androidRecognitionServicePackage: "com.google.android.as",
      });
      installedLocalesCache = res?.installedLocales ?? [];
      return installedLocalesCache;
    }
  } catch {}
  return [];
}

export async function isOfflineLocaleInstalled(lang?: string): Promise<boolean> {
  const target = (lang ?? speechLanguage()).toLowerCase();
  // Exact locale only: an it-CH pack does not make it-IT work offline.
  const has = (list: string[]) => list.some((l) => l.toLowerCase().replace("_", "-") === target);
  // A missing pack may have been downloaded since the last look, so only a hit is trusted from cache.
  return has(await getInstalledLocales()) || has(await getInstalledLocales(true));
}

export function isRecognitionAvailable(): boolean {
  if (Platform.OS === "web") return false;
  try {
    return !!ExpoSpeechRecognitionModule?.isRecognitionAvailable?.();
  } catch {
    return false;
  }
}

export class DeviceSttEngine implements SttEngine {
  readonly name = "device" as const;
  private listeners: { [K in keyof SttEvents]?: ((...args: any[]) => void)[] } = {};
  private unsubscribers: (() => void)[] = [];
  private finalText = "";
  private stopResolver: ((text: string | null) => void) | null = null;
  /** Set once the turn ends or fails: the native module fires "end" after "error", and must not twice. */
  private done = false;

  on<K extends keyof SttEvents>(event: K, listener: SttEvents[K]): () => void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]?.push(listener as any);
    return () => {
      this.listeners[event] = this.listeners[event]?.filter((l) => l !== listener);
    };
  }

  private emit<K extends keyof SttEvents>(event: K, ...args: Parameters<SttEvents[K]>): void {
    const list = this.listeners[event] as ((...a: any[]) => void)[] | undefined;
    if (list) {
      for (const fn of list) {
        fn(...args);
      }
    }
  }

  /** Ends the turn once: drops the native listeners, so a later engine never hears this one's events. */
  private finish(): boolean {
    if (this.done) return false;
    this.done = true;
    this.cleanupNativeListeners();
    return true;
  }

  async start(opts?: { continuous?: boolean }): Promise<void> {
    this.finalText = "";
    this.done = false;
    this.cleanupNativeListeners();

    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync?.();
    if (perm && !perm.granted) {
      this.finish();
      this.emit("error", "not-allowed");
      return;
    }

    const lang = speechLanguage();
    const isInstalled = await isOfflineLocaleInstalled(lang);
    if (this.done) return; // cancelled while asking

    const subResult = ExpoSpeechRecognitionModule.addListener("result", (ev: any) => {
      const text = ev?.results?.[0]?.transcript ?? "";
      // Continuous dictation yields one final per sentence: keep them all, not only the last.
      const joined = (head: string) => (this.finalText ? `${this.finalText} ${head}` : head).trim();
      if (ev?.isFinal) {
        this.finalText = joined(text);
        this.emit("final", this.finalText);
      } else {
        this.emit("partial", joined(text));
      }
    });
    this.unsubscribers.push(() => subResult.remove());

    const subEnd = ExpoSpeechRecognitionModule.addListener("end", () => {
      if (!this.finish()) return;
      this.emit("end");
      if (this.stopResolver) {
        this.stopResolver(this.finalText || null);
        this.stopResolver = null;
      }
    });
    this.unsubscribers.push(() => subEnd.remove());

    const subError = ExpoSpeechRecognitionModule.addListener("error", (ev: any) => {
      if (!this.finish()) return;
      const code = ev?.error ?? "unknown";
      this.emit("error", code);
      if (this.stopResolver) {
        this.stopResolver(null);
        this.stopResolver = null;
      }
    });
    this.unsubscribers.push(() => subError.remove());

    ExpoSpeechRecognitionModule.start({
      lang,
      interimResults: true,
      continuous: opts?.continuous ?? false,
      requiresOnDeviceRecognition: isInstalled,
      androidIntentOptions: {
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: DEVICE_SILENCE_MS,
      },
    });
  }

  async stop(): Promise<string | null> {
    if (this.done) return this.finalText || null;
    return new Promise<string | null>((resolve) => {
      this.stopResolver = resolve;
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        resolve(this.finalText || null);
      }
    });
  }

  async cancel(): Promise<void> {
    this.stopResolver = null;
    this.finish();
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {}
  }

  private cleanupNativeListeners(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }
}

export class ServerSttEngine implements SttEngine {
  readonly name = "server" as const;
  private listeners: { [K in keyof SttEvents]?: ((...args: any[]) => void)[] } = {};

  on<K extends keyof SttEvents>(event: K, listener: SttEvents[K]): () => void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]?.push(listener as any);
    return () => {
      this.listeners[event] = this.listeners[event]?.filter((l) => l !== listener);
    };
  }

  emit<K extends keyof SttEvents>(event: K, ...args: Parameters<SttEvents[K]>): void {
    const list = this.listeners[event] as ((...a: any[]) => void)[] | undefined;
    if (list) {
      for (const fn of list) {
        fn(...args);
      }
    }
  }

  async start(): Promise<void> {}
  async stop(): Promise<string | null> {
    return null;
  }
  async cancel(): Promise<void> {}
}

let hasWarnedEngineUnavailable = false;

export function resetEngineUnavailableWarning(): void {
  hasWarnedEngineUnavailable = false;
}

export function warnEngineUnavailableOnce(): void {
  if (!hasWarnedEngineUnavailable) {
    hasWarnedEngineUnavailable = true;
    toast.show(i18n.t("voice.engineUnavailable"));
  }
}

export function getSttEngine(): SttEngine {
  const chosen = prefs.voiceEngine();
  if (chosen === "server") {
    return new ServerSttEngine();
  }
  if (!isRecognitionAvailable()) {
    warnEngineUnavailableOnce();
    return new ServerSttEngine();
  }
  return new DeviceSttEngine();
}

/**
 * Mic is visible when either engine is usable.
 * Device: isRecognitionAvailable().
 * Server: voiceAvailable(settings).
 * Hidden on web.
 */
export function isVoiceAvailable(settings: Pick<SettingsPayload, "transcription"> | null | undefined): boolean {
  if (Platform.OS === "web") return false;
  return isRecognitionAvailable() || voiceAvailable(settings);
}
