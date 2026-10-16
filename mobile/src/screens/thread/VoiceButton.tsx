import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Text, View } from "react-native";
import { speechStore } from "../../extras/speech";
import { useVoiceInput, voiceAvailable } from "../../extras/voice";
import { DeviceSttEngine, isRecognitionAvailable, warnEngineUnavailableOnce } from "../../extras/sttEngine";
import { prefs } from "../../settings/prefs";
import { settingsStore } from "../../settings/store";
import { useSession } from "../../state/sessionStore";
import { useT } from "../../i18n";
import { IconButton, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import type { SettingsPayload } from "@/lib/types";

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

function Dot() {
  const th = useTheme();
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [o]);
  return <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: th.colors.destructive, opacity: o }} />;
}

/** The transcript is handed to onTranscript (appended to the draft by the caller); never sent. */
export function VoiceButton({
  chatKey,
  onTranscript,
  onPartial,
}: {
  chatKey: string;
  onTranscript: (text: string) => void;
  onPartial?: (text: string) => void;
}) {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();

  const handleTranscript = useCallback((text: string) => {
    if (text) {
      speechStore.getState().markVoiceDictated(chatKey);
      onTranscript(text);
    }
  }, [chatKey, onTranscript]);

  const serverVoice = useVoiceInput(handleTranscript);

  // Device engine state
  const [deviceState, setDeviceState] = useState<"idle" | "recording">("idle");
  const [deviceElapsed, setDeviceElapsed] = useState(0);
  const deviceEngineRef = useRef<DeviceSttEngine | null>(null);
  const deviceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deviceStartAtRef = useRef(0);
  const lastFinalRef = useRef("");
  const handledRef = useRef(false);

  useEffect(() => {
    if (!serverVoice.error) return;
    const [code, ...detail] = serverVoice.error.split(": ");
    toast.show(code === "transcription" && detail.length ? detail.join(": ") : t(`voice.error.${code}`, { defaultValue: t("voice.error.transcription") }));
  }, [serverVoice.error, t]);

  const clearDeviceTimer = useCallback(() => {
    if (deviceTimerRef.current) {
      clearInterval(deviceTimerRef.current);
      deviceTimerRef.current = null;
    }
  }, []);

  const stopDeviceRecording = useCallback(async () => {
    clearDeviceTimer();
    setDeviceState("idle");
    const engine = deviceEngineRef.current;
    deviceEngineRef.current = null;
    if (!engine) return;
    try {
      const text = await engine.stop();
      onPartial?.("");
      if (!handledRef.current) {
        handledRef.current = true;
        const res = (text ?? lastFinalRef.current).trim();
        if (res) handleTranscript(res);
      }
    } catch {
      onPartial?.("");
      if (!handledRef.current) {
        handledRef.current = true;
        const res = lastFinalRef.current.trim();
        if (res) handleTranscript(res);
      }
    }
  }, [clearDeviceTimer, onPartial, handleTranscript]);

  const cancelDeviceRecording = useCallback(async () => {
    clearDeviceTimer();
    onPartial?.("");
    setDeviceState("idle");
    handledRef.current = true;
    const engine = deviceEngineRef.current;
    deviceEngineRef.current = null;
    if (!engine) return;
    try {
      await engine.cancel();
    } catch {}
  }, [clearDeviceTimer, onPartial]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearDeviceTimer();
      if (deviceEngineRef.current) {
        deviceEngineRef.current.cancel().catch(() => {});
      }
    };
  }, [clearDeviceTimer]);

  const checkServerConfigured = async (): Promise<boolean> => {
    const cur = settingsStore.getState().data;
    if (cur) return voiceAvailable(cur);
    if (session?.get) {
      try {
        const st = await session.get<SettingsPayload>("/api/settings");
        settingsStore.getState().setData(st);
        return voiceAvailable(st);
      } catch {}
    }
    return false;
  };

  const startDevice = useCallback(async () => {
    if (deviceEngineRef.current) return; // a second tap while the first one is still starting
    const engine = new DeviceSttEngine();
    deviceEngineRef.current = engine;
    lastFinalRef.current = "";
    handledRef.current = false;

    engine.on("partial", (text) => {
      onPartial?.(text);
    });

    engine.on("final", (text) => {
      lastFinalRef.current = text;
    });

    engine.on("end", () => {
      if (deviceEngineRef.current === engine) deviceEngineRef.current = null;
      clearDeviceTimer();
      onPartial?.("");
      setDeviceState("idle");
      if (!handledRef.current) {
        handledRef.current = true;
        const res = lastFinalRef.current.trim();
        if (res) handleTranscript(res);
      }
    });

    engine.on("error", async (code) => {
      clearDeviceTimer();
      onPartial?.("");
      setDeviceState("idle");
      deviceEngineRef.current = null;

      if (code === "language-not-supported" || code === "service-not-allowed") {
        toast.show(t(`voice.error.${code}`, { defaultValue: t("voice.error.transcription") }));
        const canFallback = await checkServerConfigured();
        if (canFallback) {
          void serverVoice.start();
        }
      } else {
        const key = code === "not-allowed" ? "permission" : code;
        toast.show(t(`voice.error.${key}`, { defaultValue: t("voice.error.transcription") }));
      }
    });

    try {
      await engine.start({ continuous: true });
      if (deviceEngineRef.current !== engine) return; // refused (permission) or cancelled while starting
      deviceStartAtRef.current = Date.now();
      setDeviceElapsed(0);
      setDeviceState("recording");
      clearDeviceTimer();
      deviceTimerRef.current = setInterval(() => {
        setDeviceElapsed(Date.now() - deviceStartAtRef.current);
      }, 200);
    } catch {
      clearDeviceTimer();
      onPartial?.("");
      setDeviceState("idle");
      toast.show(t("voice.error.unavailable"));
    }
  }, [clearDeviceTimer, onPartial, handleTranscript, serverVoice, t]);

  const handleStart = useCallback(async () => {
    const pref = prefs.voiceEngine();
    if (pref === "server") {
      void serverVoice.start();
      return;
    }
    if (!isRecognitionAvailable()) {
      warnEngineUnavailableOnce();
      void serverVoice.start();
      return;
    }
    await startDevice();
  }, [serverVoice, startDevice]);

  if (serverVoice.state === "transcribing") {
    return <View accessibilityLabel={t("voice.transcribing")} style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={th.colors.foreground} /></View>;
  }

  if (serverVoice.state === "recording") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Dot />
        <Text style={{ color: th.colors.foreground, marginHorizontal: 6, fontVariant: ["tabular-nums"] }}>{mmss(serverVoice.elapsedMs)}</Text>
        <IconButton icon="close" accessibilityLabel={t("voice.cancel")} onPress={serverVoice.cancel} />
        <IconButton icon="stop-circle-outline" accessibilityLabel={t("voice.stop")} onPress={() => void serverVoice.stop().then((x) => x && handleTranscript(x))} />
      </View>
    );
  }

  if (deviceState === "recording") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Dot />
        <Text style={{ color: th.colors.foreground, marginHorizontal: 6, fontVariant: ["tabular-nums"] }}>{mmss(deviceElapsed)}</Text>
        <IconButton icon="close" accessibilityLabel={t("voice.cancel")} onPress={cancelDeviceRecording} />
        <IconButton icon="stop-circle-outline" accessibilityLabel={t("voice.stop")} onPress={stopDeviceRecording} />
      </View>
    );
  }

  return <IconButton icon="microphone" accessibilityLabel={t("voice.start")} onPress={handleStart} />;
}
