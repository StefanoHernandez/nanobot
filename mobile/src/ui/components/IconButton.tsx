import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../ThemeProvider";

export type IconButtonProps = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  size?: number;
  disabled?: boolean;
  loading?: boolean;
  color?: string;
  /** Draws a round filled button (e.g. the brand-coloured send); `color` is the icon colour on it. */
  fill?: string;
};

export function IconButton({ icon, onPress, accessibilityLabel, accessibilityHint, size = 24, disabled, loading, color, fill }: IconButtonProps) {
  const th = useTheme();
  const isDisabled = !!disabled || !!loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={isDisabled ? undefined : onPress}
      hitSlop={4}
      style={[
        styles.base,
        {
          minWidth: Math.max(48, size + 16),
          minHeight: Math.max(48, size + 16),
          opacity: isDisabled ? 0.38 : 1,
        },
      ]}
    >
      {fill ? (
        <View style={{ width: size + 16, height: size + 16, borderRadius: (size + 16) / 2, backgroundColor: fill, alignItems: "center", justifyContent: "center" }}>
          {loading ? <ActivityIndicator size="small" color={color} /> : <MaterialCommunityIcons name={icon} size={size - 2} color={color ?? th.colors.foreground} />}
        </View>
      ) : loading ? (
        <ActivityIndicator size="small" color={th.colors.foreground} />
      ) : (
        <MaterialCommunityIcons name={icon} size={size} color={color ?? th.colors.foreground} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
});
