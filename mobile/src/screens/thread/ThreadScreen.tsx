import React, { useState } from "react";
import { KeyboardAvoidingView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useT } from "../../i18n";
import { IconButton } from "../../ui/components/IconButton";
import { ListItem, Sheet } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { router } from "expo-router";
import { isWritable, chatsStore } from "../../state/chatsStore";
import { threadStore, useThread } from "../../state/threadStore";
import { useStore } from "zustand";
import { sessionStore, useSession } from "../../state/sessionStore";
import { Button } from "../../ui/components/Button";
import { BotFace, faceStateOf } from "../../ui/BotFace";
import { CommandDrawerButton } from "../../extras/CommandDrawer";
import { OutboxBar } from "../../extras/OutboxBar";
import { exportChat } from "../../extras/exportChat";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { isActive, SubagentsButton } from "./SubagentsSheet";
import { ModelBadge } from "./ModelBadge";
import { WorkspaceButton } from "./WorkspaceSheet";
import { collectThreadFiles } from "../gallery/GalleryScreen";
import { subagentsAvailable, subagentsStore } from "../../state/subagentsStore";
import { useWorkspace } from "../../state/workspace";

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

  const fileCount = React.useMemo(() => collectThreadFiles(messages, "").length, [messages]);
  const { scope, info } = useWorkspace(chatKey);
  const showWorkspace = !!scope && info?.controls?.can_change_project !== false;
  const taskCount = useStore(subagentsStore, (s) => s.tasks[chatKey]?.length ?? 0);
  const activeSubs = useStore(
    subagentsStore,
    (s) => s.tasks[chatKey]?.filter((x) => isActive(x.state)).length ?? 0,
  );
  const showSubagents = subagentsAvailable(session, chatKey) && taskCount > 0;
  const showCommands = isWritable(chatKey);
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState<null | "workspace" | "subagents" | "commands">(null);
  const openPanel = (next: NonNullable<typeof panel>) => {
    setMenu(false);
    setPanel(next);
  };

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
        <View>
          <IconButton icon="dots-vertical" accessibilityLabel={t("thread.more")} onPress={() => setMenu(true)} />
          {running || activeSubs > 0 ? (
            <View
              testID="thread-menu-dot"
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={{ position: "absolute", top: 10, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: th.colors.brand }}
            />
          ) : null}
        </View>
      </View>
      {menu ? <Sheet open onClose={() => setMenu(false)} title={t("thread.more")}>
        {fileCount > 0 ? (
          <ListItem
            title={t("gallery.open")}
            accessibilityLabel={t("gallery.open")}
            left={<MaterialCommunityIcons testID="gallery-menu-icon" name="folder-multiple-image" size={22} color={th.colors.foreground} />}
            right={<Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.medium }}>{fileCount}</Text>}
            onPress={() => {
              setMenu(false);
              router.push(`/gallery/${encodeURIComponent(chatKey)}`);
            }}
          />
        ) : null}
        {showWorkspace ? (
          <ListItem title={t("workspace.open")} left={<MaterialCommunityIcons name="folder-outline" size={22} color={th.colors.foreground} />} onPress={() => openPanel("workspace")} />
        ) : null}
        {showSubagents ? (
          <ListItem
            title={t("subagents.open")}
            left={<MaterialCommunityIcons name="robot-outline" size={22} color={th.colors.foreground} />}
            right={activeSubs > 0 ? <Text style={{ color: th.colors.primary, fontFamily: th.font.medium }}>{activeSubs}</Text> : undefined}
            onPress={() => openPanel("subagents")}
          />
        ) : null}
        {showCommands ? (
          <ListItem title={t("extras.commands")} left={<MaterialCommunityIcons name="console-line" size={22} color={th.colors.foreground} />} onPress={() => openPanel("commands")} />
        ) : null}
        <ListItem
          title={t("export.markdown")}
          left={<MaterialCommunityIcons name="file-document-outline" size={22} color={th.colors.foreground} />}
          onPress={() => {
            setMenu(false);
            if (session) {
              const title = chatsStore.getState().chats.find((c) => c.key === chatKey)?.title || t("chats.untitled");
              void exportChat({ session, chatKey, title, format: "md" });
            }
          }}
        />
        <ListItem
          title={t("export.pdf")}
          left={<MaterialCommunityIcons name="file-pdf-box" size={22} color={th.colors.foreground} />}
          onPress={() => {
            setMenu(false);
            if (session) {
              const title = chatsStore.getState().chats.find((c) => c.key === chatKey)?.title || t("chats.untitled");
              void exportChat({ session, chatKey, title, format: "pdf" });
            }
          }}
        />
      </Sheet> : null}
      {showWorkspace ? (
        <WorkspaceButton chatKey={chatKey} trigger={false} open={panel === "workspace"} onOpenChange={(next) => { if (!next) setPanel(null); }} />
      ) : null}
      <SubagentsButton chatKey={chatKey} trigger={false} open={panel === "subagents"} onOpenChange={(next) => { if (!next) setPanel(null); }} />
      {showCommands ? (
        <CommandDrawerButton chatKey={chatKey} trigger={false} open={panel === "commands"} onOpenChange={(next) => { if (!next) setPanel(null); }} />
      ) : null}
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
