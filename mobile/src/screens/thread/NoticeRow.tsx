import React from "react";
import { Text, View } from "react-native";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import type { Notice } from "../../state/threadStore";

export function NoticeRow({ notice }: { notice: Notice }) {
  const th = useTheme();
  const t = useT();
  const KNOWN = ["compaction", "recovery", "fallback", "stream_error", "retry"];
  const label = KNOWN.includes(notice.kind) ? t(`thread.notice.${notice.kind}`, { defaultValue: notice.text }) : notice.text;
  const bad = notice.kind === "stream_error";
  return (
    <View accessibilityRole="alert" style={{ alignSelf: "center", marginVertical: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: th.radius.md, backgroundColor: bad ? th.colors.destructive : th.colors.muted }}>
      <Text style={{ fontSize: 12, color: bad ? th.colors.destructiveForeground : th.colors.mutedForeground }}>{label}</Text>
    </View>
  );
}
