import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "../../ui/ThemeProvider";

export function ModelBadge({ preset, model }: { preset: string | null; model: string | null }) {
  const th = useTheme();
  const name = preset ?? model;
  if (!name) return null;
  return (
    <View style={{ backgroundColor: th.colors.muted, borderRadius: th.radius.sm, paddingHorizontal: 8, paddingVertical: 2, maxWidth: 140 }}>
      <Text numberOfLines={1} style={{ color: th.colors.mutedForeground, fontSize: 12 }}>{name}</Text>
    </View>
  );
}
