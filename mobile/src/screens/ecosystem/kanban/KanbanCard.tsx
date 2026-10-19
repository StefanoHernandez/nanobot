import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import type { KanbanBot, KanbanTask } from "../../../ecosystem/kanban";
import { useT } from "../../../i18n";
import { Button } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";

function shortWhen(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The brand border of a running card: it breathes, and stays still when the system asks for reduced motion (like BotFace). */
function PulseBorder({ testID, radius }: { testID: string; radius: number }) {
  const th = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (alive) setAnimate(!reduced);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!animate) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, opacity]);

  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderWidth: 2, borderColor: th.colors.brand, borderRadius: radius, opacity }]}
    />
  );
}

export function KanbanCard({
  task,
  bot,
  onPress,
  onLongPress,
  onWatch,
}: {
  task: KanbanTask;
  bot: KanbanBot | undefined;
  onPress: () => void;
  onLongPress: () => void;
  onWatch: () => void;
}) {
  const t = useT();
  const th = useTheme();
  const scheduled = typeof task.scheduled_at_ms === "number" && task.scheduled_at_ms > Date.now();
  const running = task.status === "running";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t("kanban.cardHint")}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.card, th.surface]}
    >
      <Text numberOfLines={2} style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 15 }}>
        {task.title}
      </Text>
      <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, marginTop: 4 }}>
        {t(`kanban.priority.${task.priority}`)}
      </Text>
      {bot || scheduled || task.recurrence_expr || task.status === "blocked" ? (
        <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, marginTop: 2 }}>
          {bot?.icon ? <Text>{bot.icon} </Text> : null}
          {bot?.name ? <Text>{bot.name}</Text> : null}
          {scheduled && task.scheduled_at_ms != null ? <Text>{` 🕒 ${shortWhen(task.scheduled_at_ms)}`}</Text> : null}
          {task.recurrence_expr ? <Text> 🔁</Text> : null}
          {task.status === "blocked" ? <Text> ⛔</Text> : null}
        </Text>
      ) : null}
      {running && task.assignee_bot_id ? (
        <View style={styles.watch}>
          <Button title={t("kanban.watchBot")} variant="secondary" onPress={onWatch} />
        </View>
      ) : null}
      {running ? <PulseBorder testID={`kanban-pulse-${task.id}`} radius={th.radius.md} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 48, padding: 12, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center" },
  watch: { marginTop: 8, alignItems: "flex-start" },
});
