import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useT } from "../../i18n";
import { useSession } from "../../state/sessionStore";
import { loadSubagentThread, useSubagents } from "../../state/subagentsStore";
import { Button, IconButton } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { SubagentChip } from "./SubagentsSheet";
import { MessageList } from "./MessageList";
import type { UIMessage } from "@/lib/types";

export function SubagentThreadScreen({ chatKey, taskId, onBack }: { chatKey: string; taskId: string; onBack: () => void }) {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();
  const { tasks } = useSubagents(chatKey);
  const task = tasks.find((x) => x.task_id === taskId);
  const [messages, setMessages] = useState<UIMessage[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!session) return;
    setFailed(false);
    setMessages(null);
    loadSubagentThread(session, chatKey, taskId).then(
      (m) => {
        if (active) setMessages(m);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [session, chatKey, taskId]);

  const load = useCallback(() => {
    if (!session) return;
    setFailed(false);
    setMessages(null);
    loadSubagentThread(session, chatKey, taskId).then(setMessages, () => setFailed(true));
  }, [session, chatKey, taskId]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 12, borderBottomWidth: 1, borderBottomColor: th.colors.border }}>
        <IconButton icon="arrow-left" accessibilityLabel={t("thread.back")} onPress={onBack} />
        <Text numberOfLines={1} style={{ flex: 1, color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 16 }}>{task?.label || task?.task_description || t("subagents.title")}</Text>
        {task ? <SubagentChip state={task.state} /> : null}
      </View>
      {failed ? (
        <View style={{ padding: 16, alignItems: "center", gap: 8 }}>
          <Text style={{ color: th.colors.destructive }}>{t("subagents.loadError")}</Text>
          <Button title={t("subagents.retry")} onPress={load} />
        </View>
      ) : messages == null ? (
        <ActivityIndicator accessibilityLabel={t("subagents.loading")} style={{ marginTop: 24 }} color={th.colors.foreground} />
      ) : (
        <View style={{ flex: 1 }}><MessageList messages={messages} running={false} notices={[]} /></View>
      )}
    </SafeAreaView>
  );
}
