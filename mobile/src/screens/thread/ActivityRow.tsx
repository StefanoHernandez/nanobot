import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { UIFileEdit, UIMessage } from "@/lib/types";
import { isReasoningOnlyAssistant } from "@/lib/activity-timeline";
import { useT } from "../../i18n";
import { Markdown } from "../../ui/markdown/Markdown";
import { useTheme } from "../../ui/ThemeProvider";
import { ReasoningBlock } from "./ReasoningBlock";
import { FileEditList } from "./FileEditList";

// Same format as WebUI AgentActivityCluster.formatActivityDuration (:500-506).
export function formatActivityDuration(ms: number): string {
  const seconds = ms > 0 && ms < 1000 ? 1 : Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

// WebUI traceLines (:508-511)
const traceLines = (m: UIMessage) => (m.traces?.length ? m.traces : m.content.trim() ? [m.content] : []);

/** Mirrors activityDurationMs (:464-491): completed uses persisted latency, else the createdAt span (live: up to now). */
function durationMs(messages: UIMessage[], live: boolean, now: number, startedAtMs?: number): number {
  const lat = messages.find((m) => Number.isFinite(m.latencyMs))?.latencyMs;
  if (!live && lat !== undefined && lat >= 0) return Math.round(lat);
  const ts = messages.map((m) => m.createdAt).filter(Number.isFinite);
  if (!ts.length) return live && startedAtMs ? Math.max(0, now - startedAtMs) : 0;
  const first = live && startedAtMs ? startedAtMs : Math.min(...ts);
  return Math.max(0, (live ? now : Math.max(...ts)) - first);
}

export function ActivityRow({ messages, live, startedAtMs }: { messages: UIMessage[]; live: boolean; startedAtMs?: number }) {
  const th = useTheme();
  const t = useT();
  // WebUI: auto-open while the turn streams, collapsed once done (outerExpanded :287-291); a manual toggle wins.
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? live;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  let tools = 0;
  for (const m of messages) if (m.kind === "trace") tools += m.traceDetail?.traceCount ?? traceLines(m).length;
  const ms = durationMs(messages, live, now, startedAtMs);
  const label = live
    ? t("thread.activityWorkingFor", { duration: formatActivityDuration(ms) })
    : ms <= 0
      ? t("thread.activityWorked")
      : t("thread.activityWorkedFor", { duration: formatActivityDuration(ms) });
  const title = tools > 0 ? `${label} · ${t("thread.tools", { count: tools })}` : label;

  const fileEdits = useMemo(() => {
    const map = new Map<string, UIFileEdit>();
    for (const m of messages) {
      if (m.fileEdits) {
        for (const edit of m.fileEdits) {
          map.set(edit.call_id, edit); // last one wins
        }
      }
    }
    return Array.from(map.values());
  }, [messages]);

  return (
    <View style={{ marginVertical: 4 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setManual(!open)} style={{ minHeight: 48, justifyContent: "center" }}>
        <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.medium, fontSize: 13 }}>{title} {open ? "▾" : "▸"}</Text>
      </Pressable>
      {open ? (
        <View style={{ borderLeftWidth: 2, borderLeftColor: th.colors.border, paddingLeft: 10 }}>
          {messages.map((m) => {
            if (m.activityKind === "model") return m.content.trim() ? <Markdown key={m.id} text={m.content} fontSize={14} /> : null;
            if (isReasoningOnlyAssistant(m)) return <ReasoningBlock key={m.id} text={m.reasoning ?? ""} streaming={live && !!m.reasoningStreaming} />;
            if (m.kind === "trace")
              return traceLines(m).map((l, i) => (
                <Text key={`${m.id}:${i}`} selectable style={{ color: th.colors.mutedForeground, fontFamily: th.font.mono, fontSize: 12, marginVertical: 2 }}>{l}</Text>
              ));
            return null;
          })}
          <FileEditList edits={fileEdits} />
        </View>
      ) : null}
    </View>
  );
}
