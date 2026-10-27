import React from "react";
import { Text } from "react-native";
import { useTheme } from "../ThemeProvider";

export function SectionLabel({ children }: { children: string }) {
  const th = useTheme();
  const t = th.type.eyebrow;
  return (
    <Text
      style={{
        color: th.colors.textMuted,
        fontFamily: th.font.semibold,
        fontSize: t.fontSize,
        lineHeight: t.lineHeight,
        letterSpacing: t.letterSpacing,
        textTransform: "uppercase",
        paddingLeft: 16,
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}
