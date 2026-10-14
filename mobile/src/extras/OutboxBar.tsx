import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useStore } from "zustand";
import { useT } from "../i18n";
import { useTheme } from "../ui/ThemeProvider";
import { IconButton } from "../ui/components/IconButton";
import { sessionStore } from "../state/sessionStore";
import { threadStore } from "../state/threadStore";
import { outboxStore, type OutboxItem } from "./outbox";

const EMPTY_QUEUE: OutboxItem[] = [];

export function OutboxBar({ chatKey }: { chatKey: string }) {
  const t = useT();
  const th = useTheme();

  const profile = useStore(sessionStore, (s) => s.profile);
  const state = useStore(sessionStore, (s) => s.state);

  const loaded = useStore(threadStore, (s) => !!s.threads[chatKey]?.loaded);
  const running = useStore(threadStore, (s) => !!s.threads[chatKey]?.running);
  const uploading = useStore(threadStore, (s) => !!s.threads[chatKey]?.uploading);
  const hydrating = useStore(threadStore, (s) => !!s.threads[chatKey]?.hydrating);

  const queue = useStore(outboxStore, (s) => s.queues[chatKey] ?? EMPTY_QUEUE);
  const head = queue[0];

  useEffect(() => {
    outboxStore.getState().syncProfile(profile?.id ?? null);
  }, [profile?.id]);

  useEffect(() => {
    if (state === "open" && loaded && !hydrating && !running && !uploading && head && !head.paused) {
      outboxStore.getState().flushNext(chatKey);
    }
  }, [chatKey, state, loaded, hydrating, running, uploading, head?.id, head?.paused]);

  if (queue.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: th.colors.card, borderTopColor: th.colors.border }]}>
      {queue.map((item) => (
        <View key={item.id} style={[styles.row, { borderBottomColor: th.colors.border }]}>
          <View style={styles.contentCol}>
            <View style={styles.badgeRow}>
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: item.paused ? th.colors.muted : th.colors.secondary,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    {
                      color: item.paused ? th.colors.mutedForeground : th.colors.secondaryForeground,
                      fontFamily: th.font.medium,
                    },
                  ]}
                >
                  {item.paused ? t("outbox.paused") : t("outbox.pending")}
                </Text>
              </View>
              {item.opts?.files && item.opts.files.length > 0 ? (
                <Text style={[styles.chipText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                  📎 {item.opts.files.length}
                </Text>
              ) : null}
            </View>
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.itemText, { color: th.colors.foreground, fontFamily: th.font.regular }]}
            >
              {item.text}
            </Text>
          </View>
          <View style={styles.actionsRow}>
            {item.paused && state === "open" ? (
              <IconButton
                icon="send"
                accessibilityLabel={t("outbox.sendNow")}
                onPress={() => outboxStore.getState().resumeItem(chatKey, item.id)}
              />
            ) : null}
            <IconButton
              icon="close"
              accessibilityLabel={t("outbox.cancel")}
              onPress={() => outboxStore.getState().cancel(chatKey, item.id)}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    maxHeight: 160,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contentCol: {
    flex: 1,
    justifyContent: "center",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
    gap: 6,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
  },
  chipText: {
    fontSize: 11,
  },
  itemText: {
    fontSize: 14,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});
