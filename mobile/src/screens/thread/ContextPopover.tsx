import React from "react";
import { Text, View } from "react-native";
import { useT } from "../../i18n";
import type { UIMessage } from "@/lib/types";
import { latestContextUsage, recentRoundUsage } from "../../state/usage";
import { Sheet } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";

/** 1234 -> "1.2k", 128000 -> "128k". */
export const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

/** Context fill %, clamped to 100. */
export const pct = (used: number, total: number) => Math.min(100, Math.round((used / total) * 100));

const BAR_H = 80;

export function ContextPopover({ open, onClose, messages }: { open: boolean; onClose: () => void; messages: UIMessage[] }) {
  const t = useT();
  const th = useTheme();
  const u = latestContextUsage(messages);
  const rounds = recentRoundUsage(messages, 8).reverse(); // oldest on the left
  const max = Math.max(1, ...rounds.map((r) => r.inputTokens + r.outputTokens + r.cachedTokens));
  const seg = [
    { key: "input", color: th.colors.primary },
    { key: "output", color: th.colors.accent },
    { key: "cached", color: th.colors.mutedForeground },
  ] as const;
  const h = (n: number) => (n / max) * BAR_H;
  const fg = { color: th.colors.popoverForeground, fontFamily: th.font.regular };
  return (
    <Sheet open={open} onClose={onClose} title={t("context.title")}>
      {u?.contextWindowTokens ? (
        <Text style={[fg, { fontSize: 15, marginBottom: 12 }]}>
          {t("context.summary", { used: compact(u.contextTokens), total: compact(u.contextWindowTokens), pct: pct(u.contextTokens, u.contextWindowTokens) })}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: BAR_H + 20 }}>
        {rounds.map((r, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
            <View style={{ width: "100%" }}>
              <View style={{ height: h(r.cachedTokens), backgroundColor: seg[2].color }} />
              <View style={{ height: h(r.outputTokens), backgroundColor: seg[1].color }} />
              <View style={{ height: h(r.inputTokens), backgroundColor: seg[0].color }} />
            </View>
            <Text testID="round-label" style={{ color: th.colors.mutedForeground, fontSize: 10 }}>{`${r.estimated ? "~" : ""}${compact(r.inputTokens)}`}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        {seg.map((s) => (
          <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 10, height: 10, backgroundColor: s.color }} />
            <Text style={{ color: th.colors.mutedForeground, fontSize: 12 }}>{t(`context.${s.key}`)}</Text>
          </View>
        ))}
      </View>
    </Sheet>
  );
}
