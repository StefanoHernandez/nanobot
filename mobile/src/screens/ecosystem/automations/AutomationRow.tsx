import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useT } from "../../../i18n";
import { useTheme } from "../../../ui/ThemeProvider";
import type { SessionAutomationJob } from "@/lib/types";

export function formatSchedule(schedule?: SessionAutomationJob["schedule"]): string {
  if (!schedule) return "—";
  if (schedule.kind === "cron") {
    if (schedule.expr) {
      return schedule.tz ? `${schedule.expr} (${schedule.tz})` : schedule.expr;
    }
    return "cron";
  }
  if (schedule.kind === "every") {
    if (schedule.every_ms) {
      const mins = Math.round(schedule.every_ms / 60000);
      if (mins >= 60 && mins % 60 === 0) return `Every ${mins / 60}h`;
      return `Every ${mins}m`;
    }
    return "every";
  }
  if (schedule.kind === "at") {
    if (schedule.at_ms) return new Date(schedule.at_ms).toLocaleString();
    return "at";
  }
  return schedule.kind || "—";
}

export function AutomationRow({
  job,
  onPress,
  onToggle,
  toggling,
}: {
  job: SessionAutomationJob;
  onPress: (job: SessionAutomationJob) => void;
  onToggle: (job: SessionAutomationJob, enabled: boolean) => Promise<void>;
  toggling?: boolean;
}) {
  const t = useT();
  const th = useTheme();

  const title = job.name || (job.payload?.message ? job.payload.message.split("\n")[0] : t("automations.title"));
  const scheduleStr = formatSchedule(job.schedule);
  const nextRunTime = job.state?.next_run_at_ms
    ? new Date(job.state.next_run_at_ms).toLocaleString()
    : null;
  const targetChat = job.origin?.title || job.origin?.chat_id || null;

  return (
    <Pressable
      style={[
        styles.container,
        {
          backgroundColor: th.colors.card,
          borderBottomColor: th.colors.border,
        },
      ]}
      onPress={() => onPress(job)}
    >
      <View style={styles.content}>
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            {
              color: th.colors.foreground,
              fontFamily: th.font.medium,
            },
          ]}
        >
          {title}
        </Text>

        <Text
          numberOfLines={1}
          style={[styles.subtitle, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}
        >
          {scheduleStr}
        </Text>

        {nextRunTime ? (
          <Text
            numberOfLines={1}
            style={[styles.caption, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}
          >
            {t("automations.nextRun", { time: nextRunTime })}
          </Text>
        ) : null}

        {targetChat ? (
          <Text
            numberOfLines={1}
            style={[styles.caption, { color: th.colors.primary, fontFamily: th.font.regular }]}
          >
            {t("automations.targetChat", { title: targetChat })}
          </Text>
        ) : null}
      </View>

      <View style={styles.switchWrapper}>
        {toggling ? (
          <ActivityIndicator size="small" color={th.colors.primary} />
        ) : (
          <Switch
            accessibilityRole="switch"
            accessibilityLabel={title}
            value={job.enabled}
            disabled={toggling}
            onValueChange={(val) => onToggle(job, val)}
            thumbColor={job.enabled ? th.colors.primary : th.colors.mutedForeground}
            trackColor={{
              false: th.colors.muted,
              true: th.colors.primary,
            }}
          />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 64,
  },
  content: {
    flex: 1,
    marginRight: 12,
    gap: 2,
  },
  title: {
    fontSize: 16,
  },
  subtitle: {
    fontSize: 14,
  },
  caption: {
    fontSize: 13,
  },
  switchWrapper: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
});
