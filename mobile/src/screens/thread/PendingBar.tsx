import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useStore } from "zustand";
import { OutboxBar } from "../../extras/OutboxBar";
import { outboxStore } from "../../extras/outbox";
import { useT } from "../../i18n";
import { useThreadSlice, type QueuedMessage } from "../../state/threadStore";
import { useTheme } from "../../ui/ThemeProvider";
import { QueuedMessages } from "./QueuedMessages";

/**
 * One line above the composer for everything that is waiting to be sent: messages held back until the
 * connection returns (outbox) and messages held back until the bot finishes (queued). Tap to manage them.
 */
export function PendingBar({ chatKey, onModifyQueued }: { chatKey: string; onModifyQueued: (item: QueuedMessage) => void }) {
  const t = useT();
  const th = useTheme();
  const outboxCount = useStore(outboxStore, (s) => s.queues[chatKey]?.length ?? 0);
  const { queuedMessages = [] } = useThreadSlice(chatKey);
  const queuedCount = queuedMessages.length;
  const count = outboxCount + queuedCount;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (count === 0) setExpanded(false);
  }, [count]);

  if (count === 0) return null;

  const label = t("outbox.waiting", { count });
  const sectionTitle = (key: string) => (
    <Text style={[styles.sectionTitle, { color: th.colors.mutedForeground, fontFamily: th.font.medium }]}>{t(key)}</Text>
  );

  return (
    <View style={[styles.wrap, { backgroundColor: th.colors.card, borderColor: th.colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((open) => !open)}
        style={styles.line}
      >
        <Text numberOfLines={1} style={[styles.lineText, { color: th.colors.foreground, fontFamily: th.font.medium }]}>
          {label}
        </Text>
        <MaterialCommunityIcons name={expanded ? "chevron-down" : "chevron-up"} size={20} color={th.colors.mutedForeground} />
      </Pressable>
      {expanded ? (
        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.lists}>
          {outboxCount > 0 ? (
            <>
              {sectionTitle("outbox.notSentTitle")}
              <OutboxBar chatKey={chatKey} />
            </>
          ) : null}
          {queuedCount > 0 ? (
            <>
              {sectionTitle("outbox.queuedTitle")}
              <QueuedMessages chatKey={chatKey} onModify={onModifyQueued} />
            </>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 8, marginTop: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: "hidden" },
  line: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14 },
  lineText: { flex: 1, fontSize: 14 },
  lists: { maxHeight: 260, paddingBottom: 6 },
  sectionTitle: { fontSize: 12, paddingHorizontal: 14, paddingTop: 4 },
});
