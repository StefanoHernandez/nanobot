import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";

/** Collapsed by default (WebUI ReasoningRow shows only a one-line preview until opened). */
export function ReasoningBlock({ text, streaming }: { text: string; streaming?: boolean }) {
  const th = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginVertical: 4 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={{ flexDirection: "row", alignItems: "center", minHeight: 48, gap: 8 }}>
        <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.medium, fontSize: 13 }}>{t("thread.reasoning")}</Text>
        {streaming ? <ActivityIndicator size="small" color={th.colors.mutedForeground} /> : null}
        <Text style={{ color: th.colors.mutedForeground }}>{open ? "▾" : "▸"}</Text>
      </Pressable>
      {open ? (
        <Text selectable style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, lineHeight: 19, borderLeftWidth: 2, borderLeftColor: th.colors.border, paddingLeft: 10 }}>{text}</Text>
      ) : null}
    </View>
  );
}
