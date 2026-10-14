import { AccessibilityRole, AccessibilityState, ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "../ThemeProvider";

export type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  disabled?: boolean;
  loading?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
};

export function Button({ title, onPress, variant = "primary", disabled, loading, accessibilityRole, accessibilityState }: ButtonProps) {
  const th = useTheme();
  const c = th.colors;
  const [bg, fg] = {
    primary: [c.primary, c.primaryForeground],
    secondary: [c.secondary, c.secondaryForeground],
    ghost: ["transparent", c.foreground],
    destructive: [c.destructive, c.destructiveForeground],
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole={accessibilityRole ?? "button"}
      accessibilityState={accessibilityState ?? { disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={[styles.base, { backgroundColor: bg, borderRadius: 999, opacity: inactive ? 0.5 : 1 }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontFamily: th.font.medium, fontSize: 16 }}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
});
