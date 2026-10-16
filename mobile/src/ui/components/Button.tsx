import { AccessibilityRole, AccessibilityState, ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "../ThemeProvider";

export type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  color?: string;
  disabled?: boolean;
  loading?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
};

export function Button({ title, onPress, variant = "primary", color, disabled, loading, accessibilityRole, accessibilityState }: ButtonProps) {
  const th = useTheme();
  const c = th.colors;
  let [bg, fg] = {
    primary: [c.primary, c.primaryForeground],
    secondary: [c.secondary, c.secondaryForeground],
    ghost: ["transparent", c.foreground],
    destructive: [c.destructive, c.destructiveForeground],
  }[variant];
  if (color) fg = color;
  const inactive = disabled || loading;
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
          // A physical press: the pill sinks slightly instead of only changing colour.
          transform: [{ scale: pressed && !inactive ? 0.97 : 1 }],
          boxShadow: variant === "primary" && !inactive ? `0 8px 20px -10px ${c.primary}` : undefined,
          borderWidth: variant === "secondary" ? 1 : 0,
          borderColor: c.border,
        },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontFamily: th.font.medium, fontSize: 15, letterSpacing: 0.2 }}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" },
});
