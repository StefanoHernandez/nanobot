import React from "react";
import { Text, View } from "react-native";
import { useT } from "../../i18n";
import type { UIMessage } from "@/lib/types";
import { isWritable } from "../../state/chatsStore";
import { useSession } from "../../state/sessionStore";
import { useThreadSlice } from "../../state/threadStore";
import { latestContextUsage, recentRoundUsage } from "../../state/usage";
import { Button, Sheet, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";

/** 1234 -> "1.2k", 128000 -> "128k". */
export const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

/** Context fill %, clamped to 100. */
export const pct = (used: number, total: number) => Math.min(100, Math.round((used / total) * 100));

/** At or above this fill the meter and the composer ring switch to the warning colour. */
export const CONTEXT_WARN_PCT = 80;

const BAR_H = 88;

export function ContextPopover({ open, onClose, messages, chatKey }: { open: boolean; onClose: () => void; messages: UIMessage[]; chatKey?: string }) {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();
  const thread = useThreadSlice(chatKey ?? "");
  const canCompact = !!chatKey && !!session && isWritable(chatKey);
  const compactChat = () => {
    if (!canCompact || !thread.send("/compact")) {
      toast.show(t("context.compactFailed"));
      return;
    }
    onClose();
  };
  const c = th.colors;
  const u = latestContextUsage(messages);
  const rounds = recentRoundUsage(messages, 8).reverse(); // oldest on the left
  const latest = rounds[rounds.length - 1];
  const max = Math.max(1, ...rounds.map((r) => r.inputTokens + r.outputTokens + r.cachedTokens));
  const seg = [
    { key: "input", color: c.chartInput, value: latest?.inputTokens },
    { key: "output", color: c.chartOutput, value: latest?.outputTokens },
    { key: "cached", color: c.chartCached, value: latest?.cachedTokens },
  ] as const;
  const h = (n: number) => (n / max) * BAR_H;
  const fill = u?.contextWindowTokens ? pct(u.contextTokens, u.contextWindowTokens) : null;
  const warn = fill !== null && fill >= CONTEXT_WARN_PCT;
  const muted = { color: c.mutedForeground, fontFamily: th.font.regular };

  return (
    <Sheet open={open} onClose={onClose} title={t("context.title")}>
      {canCompact ? (
        <View style={{ marginBottom: 16 }}>
          <Button title={t("context.compact")} variant="secondary" onPress={compactChat} />
        </View>
      ) : null}
      {u?.contextWindowTokens && fill !== null ? (
        <View style={{ marginBottom: 20 }}>
          <View accessible accessibilityLabel={t("context.summary", { used: compact(u.contextTokens), total: compact(u.contextWindowTokens), pct: fill })} style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={{ color: warn ? c.chartWarn : c.popoverForeground, fontFamily: th.font.displayBold, fontSize: 30, lineHeight: 36 }}>
              {compact(u.contextTokens)}
            </Text>
            <Text style={[muted, { fontSize: 15 }]}>{t("context.ofTotal", { total: compact(u.contextWindowTokens), pct: fill })}</Text>
          </View>
          <View testID="context-meter" style={{ height: 8, borderRadius: 4, backgroundColor: c.muted, marginTop: 10, overflow: "hidden" }}>
            <View style={{ width: `${fill}%`, height: "100%", borderRadius: 4, backgroundColor: warn ? c.chartWarn : c.chartInput }} />
          </View>
          {warn ? <Text style={{ color: c.chartWarn, fontFamily: th.font.medium, fontSize: 13, marginTop: 6 }}>{t("context.nearLimit")}</Text> : null}
        </View>
      ) : null}

      {rounds.length > 0 ? (
        <>
          <Text style={{ color: c.popoverForeground, fontFamily: th.font.medium, fontSize: 14, marginBottom: 8 }}>{t("context.recentRounds", { count: rounds.length })}</Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: BAR_H + 20 }}>
            {rounds.map((r, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
                <View style={{ width: "100%", borderTopLeftRadius: 4, borderTopRightRadius: 4, overflow: "hidden", gap: 1 }}>
                  {r.cachedTokens > 0 ? <View style={{ height: h(r.cachedTokens), backgroundColor: seg[2].color }} /> : null}
                  {r.outputTokens > 0 ? <View style={{ height: h(r.outputTokens), backgroundColor: seg[1].color }} /> : null}
                  <View style={{ height: h(r.inputTokens), backgroundColor: seg[0].color }} />
                </View>
                <Text testID="round-label" style={[muted, { fontSize: 11, marginTop: 4 }]}>{`${r.estimated ? "~" : ""}${compact(r.inputTokens)}`}</Text>
              </View>
            ))}
          </View>

          <View style={{ marginTop: 16, gap: 8 }}>
            <Text style={[muted, { fontSize: 13 }]}>{t("context.latestRound")}</Text>
            {seg.map((s) => (
              <View key={s.key} testID={`legend-${s.key}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 24 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.color }} />
                <Text style={{ flex: 1, color: c.popoverForeground, fontFamily: th.font.regular, fontSize: 15 }}>{t(`context.${s.key}`)}</Text>
                <Text style={{ color: c.popoverForeground, fontFamily: th.font.medium, fontSize: 15, fontVariant: ["tabular-nums"] }}>
                  {s.value !== undefined ? compact(s.value) : "–"}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Sheet>
  );
}
