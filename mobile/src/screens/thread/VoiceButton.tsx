import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Text, View } from "react-native";
import { speechStore } from "../../extras/speech";
import { useVoiceInput } from "../../extras/voice";
import { useT } from "../../i18n";
import { IconButton, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";

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
export function VoiceButton({ chatKey, onTranscript }: { chatKey: string; onTranscript: (text: string) => void }) {
  const t = useT();
  const th = useTheme();
  const handleTranscript = (text: string) => {
    if (text) {
      speechStore.getState().markVoiceDictated(chatKey);
      onTranscript(text);
    }
  };
  const { state, elapsedMs, error, start, stop, cancel } = useVoiceInput(handleTranscript);

  useEffect(() => {
    if (!error) return;
    const [code, ...detail] = error.split(": ");
    toast.show(code === "transcription" && detail.length ? detail.join(": ") : t(`voice.error.${code}`, { defaultValue: t("voice.error.transcription") }));
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "transcribing") {
    return <View accessibilityLabel={t("voice.transcribing")} style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={th.colors.foreground} /></View>;
  }
  if (state === "recording") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Dot />
        <Text style={{ color: th.colors.foreground, marginHorizontal: 6, fontVariant: ["tabular-nums"] }}>{mmss(elapsedMs)}</Text>
        <IconButton icon="close" accessibilityLabel={t("voice.cancel")} onPress={cancel} />
        <IconButton icon="stop-circle-outline" accessibilityLabel={t("voice.stop")} onPress={() => void stop().then((x) => x && handleTranscript(x))} />
      </View>
    );
  }
  return <IconButton icon="microphone" accessibilityLabel={t("voice.start")} onPress={() => void start()} />;
}
