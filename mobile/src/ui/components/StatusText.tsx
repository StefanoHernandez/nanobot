import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../ThemeProvider";

type Tone = "accent" | "success" | "warning" | "danger" | "muted";

function toneColors(th: ReturnType<typeof useTheme>, tone: Tone): { fg: string; soft: string } {
  const c = th.colors;
  switch (tone) {
    case "accent":
      return { fg: c.accentText, soft: c.accentSoft };
    case "success":
      return { fg: c.success, soft: c.successSoft };
    case "warning":
      return { fg: c.warning, soft: c.warningSoft };
    case "danger":
      return { fg: c.destructive, soft: c.dangerSoft };
    default:
      return { fg: c.textMuted, soft: c.surface2 };
  }
}

export function StatusText({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const th = useTheme();
  const { fg } = toneColors(th, tone);
  const cap = th.type.caption;
  return (
    <Text style={{ color: fg, fontFamily: th.font.regular, fontSize: cap.fontSize, lineHeight: cap.lineHeight, letterSpacing: cap.letterSpacing }}>
      {children}
    </Text>
  );
}

export function StatusIcon({
  tone,
  icon,
}: {
  tone: Tone;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}) {
  const th = useTheme();
  const { fg, soft } = toneColors(th, tone);
  return (
    <View style={[styles.iconCircle, { backgroundColor: soft }]}>
      <MaterialCommunityIcons name={icon} size={18} color={fg} />
    </View>
  );
}

const styles = StyleSheet.create({
  iconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
