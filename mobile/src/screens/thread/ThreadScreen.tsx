import React from "react";
import { KeyboardAvoidingView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useT } from "../../i18n";
import { IconButton } from "../../ui/components/IconButton";
import { useTheme } from "../../ui/ThemeProvider";
import { router } from "expo-router";
import { isWritable } from "../../state/chatsStore";
import { threadStore, useThread } from "../../state/threadStore";
import { useStore } from "zustand";
import { sessionStore, useSession } from "../../state/sessionStore";
import { Button } from "../../ui/components/Button";
import { BotFace, faceStateOf } from "../../ui/BotFace";
import { CommandDrawerButton } from "../../extras/CommandDrawer";
import { OutboxBar } from "../../extras/OutboxBar";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { SubagentsButton } from "./SubagentsSheet";
import { ModelBadge } from "./ModelBadge";
import { WorkspaceButton } from "./WorkspaceSheet";
import { collectThreadFiles } from "../gallery/GalleryScreen";

export function ThreadScreen({ chatKey, onBack }: { chatKey: string; onBack: () => void }) {
  const th = useTheme();
  const t = useT();
  const { messages, running, notices, model, preset, temporary, forkBoundary } = useThread(chatKey);
  const loadError = useStore(threadStore, (s) => !!s.threads[chatKey]?.loadError);
  const { session } = useSession();
  const conn = useStore(sessionStore, (s) => s.state);
  const botName = useStore(sessionStore, (s) => s.profile?.name) || "nanobot";
  const last = messages[messages.length - 1];
  const face = faceStateOf(conn, running, !!last && last.kind === "trace", !!notices.some((n) => n.kind === "stream_error"));

  const hasFiles = React.useMemo(() => collectThreadFiles(messages, "").length > 0, [messages]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 4, paddingVertical: 4 }}>
        <IconButton icon="arrow-left" accessibilityLabel={t("thread.back")} onPress={onBack} />
        <BotFace state={face} />
        <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
          <Text numberOfLines={1} accessibilityRole="header" style={{ color: th.colors.foreground, fontFamily: th.font.display, fontSize: 18, lineHeight: 22 }}>{botName}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ModelBadge chatKey={chatKey} preset={preset} model={model} />
            {face !== "idle" ? (
              <Text numberOfLines={1} accessibilityLiveRegion="polite" style={{ flexShrink: 1, color: face === "error" ? th.colors.destructive : th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 12 }}>{t(`thread.face.${face}`)}</Text>
            ) : null}
          </View>
        </View>
        {temporary ? <Text style={{ color: th.colors.mutedForeground, fontSize: 12 }}>{t("temporary.label")}</Text> : null}
        {hasFiles ? (
          <IconButton
            icon="folder-multiple-image"
            accessibilityLabel={t("gallery.open")}
            onPress={() => router.push(`/gallery/${encodeURIComponent(chatKey)}`)}
          />
        ) : null}
        <WorkspaceButton chatKey={chatKey} />
        <SubagentsButton chatKey={chatKey} />
        {isWritable(chatKey) ? <CommandDrawerButton chatKey={chatKey} /> : null}
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {loadError ? (
          <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: th.colors.muted }}>
            <Text style={{ flex: 1, color: th.colors.foreground }}>{t("thread.historyError")}</Text>
            <Button title={t("common.retry")} variant="secondary" onPress={() => session && void threadStore.getState().load(session, chatKey)} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}><MessageList chatKey={chatKey} forkBoundary={forkBoundary} messages={messages} running={running} notices={notices} /></View>
        {isWritable(chatKey) ? (
          <>
            <OutboxBar chatKey={chatKey} />
            <Composer chatKey={chatKey} key={chatKey} />
          </>
        ) : (
          <Text style={{ textAlign: "center", color: th.colors.mutedForeground, padding: 16 }}>{t("thread.readOnly")}</Text>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
