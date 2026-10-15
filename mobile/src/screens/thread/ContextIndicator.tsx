import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useT } from "../../i18n";
import { latestContextUsage } from "../../state/usage";
import { useThreadSlice } from "../../state/threadStore";
import { useTheme } from "../../ui/ThemeProvider";
import { CONTEXT_WARN_PCT, ContextPopover, pct as pctOf } from "./ContextPopover";

/** Small ring with the context fill %; hidden without usage or a known window. */
export function ContextIndicator({ chatKey }: { chatKey: string }) {
  const t = useT();
  const th = useTheme();
  const { messages = [] } = useThreadSlice(chatKey);
  const [open, setOpen] = useState(false);
  const u = latestContextUsage(messages);
  if (!u || !u.contextWindowTokens) return null;
  const pct = pctOf(u.contextTokens, u.contextWindowTokens);
  const color = pct >= CONTEXT_WARN_PCT ? th.colors.chartWarn : th.colors.chartInput;
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={t("context.title")} onPress={() => setOpen(true)} hitSlop={4} style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: color, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: th.colors.foreground, fontSize: 10, fontFamily: th.font.medium }}>{`${pct}%`}</Text>
        </View>
      </Pressable>
      <ContextPopover open={open} onClose={() => setOpen(false)} messages={messages} />
    </>
  );
}
