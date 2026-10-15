import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useStore } from "zustand";
import type { ChatSummary } from "@/lib/types";
import { isWritable } from "../../state/chatsStore";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import { ListItem } from "../../ui/components";
import { outboxStore } from "../../extras/outbox";
import { useProjects } from "../../projects/store";

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
  const pendingCount = useStore(outboxStore, (s) => (s.activeProfileId ? (s.queues[chat.key]?.length ?? 0) : 0));
  const project = useProjects((s) =>
    chat.workspaceScope?.project_path
      ? typeof s.byPath === "function"
        ? s.byPath(chat.workspaceScope.project_path)
        : s.byPath[chat.workspaceScope.project_path]
      : null
  );

  return (
    <View style={{ backgroundColor: active ? th.colors.card : "transparent", borderRadius: th.radius.md, marginHorizontal: 8, overflow: "hidden" }}>
      <ListItem
        title={chatTitle(chat, t("chats.untitled"))}
        subtitle={chat.preview}
        onPress={onPress}
        onLongPress={onLongPress}
        right={
          project || running || readOnly || pendingCount > 0 ? (
            <View style={styles.right}>
              {project ? (
                <Text
                  numberOfLines={1}
                  style={{
                    color: th.colors.brandSoftForeground,
                    backgroundColor: th.colors.brandSoft,
                    borderRadius: th.radius.sm,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    fontSize: 11,
                    fontFamily: th.font.medium,
                    maxWidth: 100,
                  }}
                >
                  {project.name}
                </Text>
              ) : null}
              {pendingCount > 0 ? (
                <Text
                  style={{
                    color: th.colors.brandSoftForeground,
                    backgroundColor: th.colors.brandSoft,
                    borderRadius: th.radius.sm,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    fontSize: 11,
                    fontFamily: th.font.medium,
                  }}
                >
                  {t("outbox.pendingCount", { count: pendingCount })}
                </Text>
              ) : null}
              {running ? <ActivityIndicator size="small" color={th.colors.brand} accessibilityLabel={t("chats.running")} /> : null}
              {readOnly ? (
                <Text
                  style={{
                    color: th.colors.mutedForeground,
                    backgroundColor: th.colors.muted,
                    borderRadius: th.radius.sm,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    fontSize: 11,
                    fontFamily: th.font.regular,
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
