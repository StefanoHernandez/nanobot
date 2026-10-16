import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import type { VoiceLoopStatus } from "../../extras/voiceLoop";

export type VoiceLoopBarProps = {
  state: VoiceLoopStatus;
  level: number;
  onStop: () => void;
  onInterrupt: () => void;
};

export function VoiceLoopBar({ state, level, onStop, onInterrupt }: VoiceLoopBarProps) {
  const t = useT();
  const th = useTheme();

  const stateText = (() => {
    switch (state) {
      case "listening":
        return t("voiceLoop.listening");
      case "transcribing":
        return t("voiceLoop.transcribing");
      case "waiting":
        return t("voiceLoop.waiting");
      case "speaking":
        return t("voiceLoop.speaking");
      default:
        return t("voiceLoop.idle");
    }
  })();

  const clampedLevel = Math.max(0, Math.min(1, level));

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: th.colors.card,
          borderRadius: th.radius.lg,
          borderColor: th.colors.border,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.stateText, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
          {stateText}
        </Text>
      </View>

      {state === "listening" ? (
        <View style={[styles.levelTrack, { backgroundColor: th.colors.muted }]}>
          <View
            style={[
              styles.levelFill,
              {
                width: `${Math.round(clampedLevel * 100)}%`,
                backgroundColor: th.colors.brand,
              },
            ]}
          />
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        {state === "speaking" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("voiceLoop.interrupt")}
            onPress={onInterrupt}
            style={[
              styles.interruptButton,
              {
                backgroundColor: th.colors.secondary,
                borderRadius: th.radius.md,
              },
            ]}
          >
            <Text style={[styles.buttonText, { color: th.colors.secondaryForeground, fontFamily: th.font.medium }]}>
              {t("voiceLoop.interrupt")}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("voiceLoop.stop")}
          onPress={onStop}
          style={[
            styles.stopButton,
            {
              backgroundColor: th.colors.destructive,
              borderRadius: th.radius.md,
            },
          ]}
        >
          <Text style={[styles.stopButtonText, { color: th.colors.destructiveForeground, fontFamily: th.font.medium }]}>
            {t("voiceLoop.stop")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 10,
    marginBottom: 8,
    marginTop: 4,
    padding: 16,
    borderWidth: 1,
    alignItems: "center",
  },
  headerRow: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  stateText: {
    fontSize: 20,
    textAlign: "center",
  },
  levelTrack: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 16,
  },
  levelFill: {
    height: "100%",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    width: "100%",
  },
  stopButton: {
    minHeight: 56,
    minWidth: 56,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  stopButtonText: {
    fontSize: 16,
    textAlign: "center",
  },
  interruptButton: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 15,
    textAlign: "center",
  },
});
