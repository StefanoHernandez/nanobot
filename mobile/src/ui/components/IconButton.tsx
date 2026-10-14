import React from "react";
import { ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../ThemeProvider";

export type IconButtonProps = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  disabled?: boolean;
  loading?: boolean;
  color?: string;
};

export function IconButton({ icon, onPress, accessibilityLabel, size = 24, disabled, loading, color }: IconButtonProps) {
  const th = useTheme();
  const isDisabled = !!disabled || !!loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
      {loading ? (
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
