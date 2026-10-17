import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import { useThreadSlice, type QueuedMessage } from "../../state/threadStore";

export function QueuedMessages({
  chatKey,
  onModify,
}: {
  chatKey: string;
  onModify?: (item: QueuedMessage) => void;
}) {
  const t = useT();
  const th = useTheme();
  const { queuedMessages = [], sendQueuedNow, modifyQueued, removeQueued } = useThreadSlice(chatKey);

  if (!queuedMessages.length) return null;

  return (
    <View testID="queued-messages-container" style={styles.container}>
      {queuedMessages.map((item) => (
        <View
          key={item.id}
          testID={`queued-card-${item.id}`}
          style={[
            styles.card,
            {
              backgroundColor: th.colors.card,
              borderColor: th.colors.border,
            },
          ]}
        >
          <Text
            numberOfLines={2}
            style={[
              styles.text,
              {
                color: th.colors.foreground,
                fontFamily: th.font.regular,
              },
            ]}
          >
            {item.text}
          </Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              testID={`queued-send-now-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={t("thread.queue.sendNow", { defaultValue: "Invia ora" })}
              onPress={() => sendQueuedNow(item.id)}
              style={styles.actionBtn}
            >
              <Text style={[styles.actionText, { color: th.colors.primary, fontFamily: th.font.medium }]}>
                {t("thread.queue.sendNow", { defaultValue: "Invia ora" })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID={`queued-modify-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={t("thread.queue.modify", { defaultValue: "Modifica" })}
              onPress={() => (onModify ? onModify(item) : modifyQueued(item.id))}
              style={styles.actionBtn}
            >
              <Text style={[styles.actionText, { color: th.colors.foreground, fontFamily: th.font.medium }]}>
                {t("thread.queue.modify", { defaultValue: "Modifica" })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID={`queued-delete-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={t("thread.queue.remove", { defaultValue: "Elimina" })}
              onPress={() => removeQueued(item.id)}
              style={styles.actionBtn}
            >
              <Text style={[styles.actionText, { color: th.colors.destructive, fontFamily: th.font.medium }]}>
                {t("thread.queue.remove", { defaultValue: "Elimina" })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 2,
    gap: 6,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  text: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
  },
  actionBtn: {
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  actionText: {
    fontSize: 12,
  },
});
