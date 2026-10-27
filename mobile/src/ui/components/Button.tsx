import React from "react";
import { AccessibilityRole, AccessibilityState, ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../ThemeProvider";
import { withAlpha } from "../theme";

export type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "inverse";
  color?: string;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
};

export function Button({ title, onPress, variant = "primary", color, disabled, loading, icon, accessibilityRole, accessibilityState }: ButtonProps) {
  const th = useTheme();
  const c = th.colors;
  let [bg, fg] = {
    primary: [c.primary, c.primaryForeground],
    secondary: [c.surface2, c.foreground],
    ghost: ["transparent", c.textSecondary],
    destructive: [c.dangerSoft, c.destructive],
    inverse: [c.inverse, c.inverseForeground],
  }[variant];
  if (color) fg = color;
  const inactive = disabled || loading;
  const glow = variant === "primary" && !inactive ? `0 6px 18px -8px ${withAlpha(c.primary, 0.55)}` : undefined;
  return (
    <Pressable
      accessibilityRole={accessibilityRole ?? "button"}
      accessibilityState={accessibilityState ?? { disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderRadius: 999,
          opacity: inactive ? 0.5 : 1,
          transform: [{ scale: pressed && !inactive ? 0.97 : 1 }],
          boxShadow: glow,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : icon ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {icon}
          <Text style={{ color: fg, fontFamily: th.font.label, fontSize: 15, letterSpacing: th.type.body.letterSpacing }}>{title}</Text>
        </View>
      ) : (
        <Text style={{ color: fg, fontFamily: th.font.label, fontSize: 15, letterSpacing: th.type.body.letterSpacing }}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" },
});
