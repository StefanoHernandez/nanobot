import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../ThemeProvider";

export type ListItemProps = {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  right?: React.ReactNode;
  left?: React.ReactNode;
};

export function ListItem({ title, subtitle, onPress, onLongPress, right, left }: ListItemProps) {
  const th = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? th.colors.accent : "transparent" }]}
    >
      {left}
      <View style={styles.body}>
        <Text numberOfLines={1} style={{ color: th.colors.foreground, fontFamily: th.font.regular, fontSize: 16 }}>{title}</Text>
        {subtitle ? <Text numberOfLines={2} style={{ color: th.colors.mutedForeground, fontSize: 13 }}>{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  body: { flex: 1 },
});
