import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { UIMessage } from "@/lib/types";
import { isReasoningOnlyAssistant } from "@/lib/activity-timeline";
import { useT } from "../../i18n";
import { Markdown } from "../../ui/markdown/Markdown";
import { useTheme } from "../../ui/ThemeProvider";
import { ReasoningBlock } from "./ReasoningBlock";
import { ToolActivitySheet } from "./ToolActivitySheet";
import { toolCallsOf } from "./toolCalls";

// Same format as WebUI AgentActivityCluster.formatActivityDuration (:500-506).
export function formatActivityDuration(ms: number): string {
  const seconds = ms > 0 && ms < 1000 ? 1 : Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

/** Mirrors activityDurationMs (:464-491): completed uses persisted latency, else the createdAt span (live: up to now). */
function durationMs(messages: UIMessage[], live: boolean, now: number, startedAtMs?: number): number {
  const lat = messages.find((m) => Number.isFinite(m.latencyMs))?.latencyMs;
  if (!live && lat !== undefined && lat >= 0) return Math.round(lat);
  const ts = messages.map((m) => m.createdAt).filter(Number.isFinite);
  if (!ts.length) return live && startedAtMs ? Math.max(0, now - startedAtMs) : 0;
  const first = live && startedAtMs ? startedAtMs : Math.min(...ts);
  return Math.max(0, (live ? now : Math.max(...ts)) - first);
}

export function ActivityRow({
  messages,
  live,
  startedAtMs,
  chatKey,
}: {
  messages: UIMessage[];
  live: boolean;
  startedAtMs?: number;
  chatKey?: string;
}) {
  const th = useTheme();
  const t = useT();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  const calls = useMemo(() => toolCallsOf(messages), [messages]);
  const tools = calls.length;
  const ms = durationMs(messages, live, now, startedAtMs);

  let title = "";
  if (live) {
    if (ms > 0) {
      const dur = formatActivityDuration(ms);
      title =
        tools > 0
          ? `${t("thread.activityWorkedFor", { duration: dur })} · ${t("thread.tools", { count: tools })} ›`
          : `${t("thread.activityWorkingFor", { duration: dur })} ›`;
    } else {
      title =
        tools > 0
          ? `${t("thread.activityExecuting")} · ${t("thread.tools", { count: tools })} ›`
          : `${t("thread.activityExecuting")} ›`;
    }
  } else {
    if (ms > 0) {
      const dur = formatActivityDuration(ms);
      title =
        tools > 0
          ? `${t("thread.activityWorkedFor", { duration: dur })} · ${t("thread.tools", { count: tools })} ›`
          : `${t("thread.activityWorkedFor", { duration: dur })} ›`;
    } else {
      title =
        tools > 0
          ? `${t("thread.toolsExecuted", { count: tools })} ›`
          : `${t("thread.activityWorked")} ›`;
    }
  }

  const hasInBetweenContent = messages.some(
    (m) => (m.activityKind === "model" && m.content.trim()) || isReasoningOnlyAssistant(m)
  );

  return (
    <View style={{ marginVertical: 4 }}>
      {/* Quiet line instead of pill */}
      <Pressable
        testID="activity-row-line"
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={() => setSheetOpen(true)}
        style={{
          minHeight: 48,
          justifyContent: "center",
          alignSelf: "flex-start",
          paddingVertical: 4,
          paddingHorizontal: 2,
        }}
      >
        <Text
          style={{
            color: th.colors.mutedForeground,
            fontFamily: th.font.medium,
            fontSize: 13,
          }}
        >
          {title}
        </Text>
      </Pressable>

      {/* Model in-between text and reasoning stay readable in the chat, under the line */}
      {hasInBetweenContent ? (
        <View
          style={{
            borderLeftWidth: 2,
            borderLeftColor: th.colors.brandSoft,
            paddingLeft: 12,
            marginLeft: 10,
            marginTop: 4,
          }}
        >
          {messages.map((m) => {
            if (m.activityKind === "model") {
              return m.content.trim() ? (
                <Markdown key={m.id} text={m.content} fontSize={14} />
              ) : null;
            }
            if (isReasoningOnlyAssistant(m)) {
              return (
                <ReasoningBlock
                  key={m.id}
                  text={m.reasoning ?? ""}
                  streaming={live && !!m.reasoningStreaming}
                />
              );
            }
            return null;
          })}
        </View>
      ) : null}

      {/* Tool activity bottom sheet */}
      <ToolActivitySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        messages={messages}
        chatKey={chatKey}
      />
    </View>
  );
}
