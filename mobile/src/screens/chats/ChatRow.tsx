import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { ChatSummary } from "@/lib/types";
import { isWritable } from "../../state/chatsStore";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import { ListItem } from "../../ui/components";

export type ChatRowProps = {
  chat: ChatSummary;
  active: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

export const chatTitle = (c: ChatSummary, fallback: string) => c.title || c.preview || fallback;

export function ChatRow({ chat, active, onPress, onLongPress }: ChatRowProps) {
  const t = useT();
  const th = useTheme();
  const running = !!chat.runStartedAt;
  const readOnly = !isWritable(chat.key);
  return (
    <View style={{ backgroundColor: active ? th.colors.accent : "transparent" }}>
      <ListItem
        title={chatTitle(chat, t("chats.untitled"))}
        subtitle={chat.preview}
        onPress={onPress}
        onLongPress={onLongPress}
        right={
          running || readOnly ? (
            <View style={styles.right}>
              {running ? <ActivityIndicator size="small" color={th.colors.primary} accessibilityLabel={t("chats.running")} /> : null}
              {readOnly ? (
                <Text
                  style={{
                    color: th.colors.mutedForeground,
                    backgroundColor: th.colors.muted,
                    borderRadius: th.radius.sm,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    fontSize: 11,
                  }}
                >
                  {t("chats.readOnly")}
                </Text>
              ) : null}
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
});
