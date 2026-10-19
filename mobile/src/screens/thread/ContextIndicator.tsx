import React, { useState } from "react";
import { useStore } from "zustand";
import { Pressable, Text, View } from "react-native";
import { useT } from "../../i18n";
import { latestContextUsage } from "../../state/usage";
import { threadStore, useThreadSlice } from "../../state/threadStore";
import { useTheme } from "../../ui/ThemeProvider";
import { CONTEXT_WARN_PCT, ContextPopover, pct as pctOf } from "./ContextPopover";

const NO_MESSAGES: never[] = [];

/** Small ring with the context fill %; hidden without usage or a known window. */
export function ContextIndicator({ chatKey }: { chatKey: string }) {
  const t = useT();
  const th = useTheme();
  const thread = useThreadSlice(chatKey, (s) => {
    const u = latestContextUsage(s.messages);
    return {
      contextTokens: u?.contextTokens,
      contextWindowTokens: u?.contextWindowTokens,
    };
  });
  const [open, setOpen] = useState(false);
  // The popover's message list streams only while it is open.
  const messages = useStore(threadStore, (s) => (open ? s.threads[chatKey]?.messages : undefined)) ?? NO_MESSAGES;
  const u =
    thread.contextTokens !== undefined && thread.contextWindowTokens
      ? { contextTokens: thread.contextTokens, contextWindowTokens: thread.contextWindowTokens }
      : null;
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
      <ContextPopover open={open} onClose={() => setOpen(false)} messages={messages} chatKey={chatKey} />
    </>
  );
}
