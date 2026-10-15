import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { useStore } from "zustand";
import type { ChatSummary } from "@/lib/types";
import { useChats } from "../../state/chatsStore";
import { useSession } from "../../state/sessionStore";
import { StatusDot } from "../../extras/StatusDot";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import { Button, Dialog, IconButton, ListItem, Sheet, TextField, toast } from "../../ui/components";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ChatRow, chatTitle } from "./ChatRow";
import { BotFace } from "../../ui/BotFace";
import { outboxStore, pendingByChat } from "../../extras/outbox";
import { projectsStore, useProjects } from "../../projects/store";
import { groupChats, recentProjects } from "./groupChats";
import type { Project } from "../../projects/api";

const chatPath = (key: string) => `/chat/${encodeURIComponent(key)}` as const;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

type DrawerRow =
  | { kind: "header"; key: string; title: string }
  | { kind: "project"; key: string; project: Project }
  | { kind: "allProjects"; key: string }
  | { kind: "chat"; key: string; chat: ChatSummary };

/** Creates a chat (normal or temporary), opens it, then calls `onDone`. Shared with the home empty state. */
export function useStartChat(onDone?: () => void) {
  const newChat = useChats((s) => s.newChat);
  const newTemporaryChat = useChats((s) => s.newTemporaryChat);
  return async (temporary = false) => {
    try {
      const key = await (temporary ? newTemporaryChat() : newChat());
      router.navigate(chatPath(key));
      onDone?.();
    } catch (e) {
      toast.show(errMsg(e));
    }
  };
}

export function ChatDrawer({ onClose }: { onClose: () => void }) {
  const t = useT();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const { profile, state: conn } = useSession();
  const chats = useChats((s) => s.chats); // subscribes the list; search() reads the same store
  const loading = useChats((s) => s.loading);
  const refresh = useChats((s) => s.refresh);
  const search = useChats((s) => s.search);
  const rename = useChats((s) => s.rename);
  const remove = useChats((s) => s.remove);
  const start = useStartChat(onClose);
  const pathname = usePathname();
  const openKey = pathname.startsWith("/chat/") ? decodeURIComponent(pathname.slice("/chat/".length)) : null;

  // Do not send to chats that are not open: their thread isn't loaded, so ordering and hydrate can't be guaranteed.
  const pendingMap = useStore(outboxStore, pendingByChat);
  const otherChatKeys = Object.keys(pendingMap).filter((k) => k !== openKey && pendingMap[k] > 0);
  const otherChatsCount = otherChatKeys.length;

  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<ChatSummary | null>(null);
  const [renaming, setRenaming] = useState<ChatSummary | null>(null);
  const [deleting, setDeleting] = useState<ChatSummary | null>(null);
  const [title, setTitle] = useState("");

  React.useEffect(() => {
    void projectsStore.getState().refresh({ ifStaleMs: 60_000 });
  }, []);

  const projects = useProjects((s) => s.projects);
  const rows = q.trim() ? search(q) : chats;
  const label = (c: ChatSummary) => chatTitle(c, t("chats.untitled"));
  const searching = q.trim().length > 0;
  const listRows = React.useMemo(() => {
    if (searching) return rows.map((chat) => ({ kind: "chat" as const, key: chat.key, chat }));
    const out: DrawerRow[] = [
      { kind: "header", key: "h-projects", title: t("projects.title") },
      ...recentProjects(projects).map((project) => ({ kind: "project" as const, key: `project:${project.id}`, project })),
      { kind: "allProjects" as const, key: "all-projects" },
    ];
    for (const group of groupChats(rows, new Date())) {
      out.push({ kind: "header", key: `h-${group.id}`, title: t(`chats.section.${group.id}`) });
      for (const chat of group.chats) out.push({ kind: "chat", key: chat.key, chat });
    }
    return out;
  }, [searching, rows, projects, t]);

  const open = (c: ChatSummary) => {
    router.navigate(chatPath(c.key));
    onClose();
  };

  const handleOpenFirstOther = () => {
    const first = otherChatKeys[0];
    if (first) {
      router.navigate(chatPath(first));
      onClose();
    }
  };

  const doRename = async () => {
    const c = renaming;
    setRenaming(null);
    if (!c) return;
    try {
      await rename(c.key, title.trim());
    } catch (e) {
      toast.show(errMsg(e));
    }
  };

  const doDelete = async () => {
    const c = deleting;
    setDeleting(null);
    if (!c) return;
    try {
      await remove(c.key);
      if (c.key === openKey) router.replace("/");
    } catch (e) {
      toast.show(errMsg(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: th.colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={styles.header}>
        <BotFace state={conn === "open" ? "idle" : "offline"} size={30} />
        <Text numberOfLines={1} accessibilityRole="header" style={{ flex: 1, color: th.colors.foreground, fontFamily: th.font.display, fontSize: 20 }}>
          {profile?.name ?? "nanobot"}
        </Text>
        <StatusDot />
        <IconButton icon="puzzle-outline" accessibilityLabel={t("ecosystem.title")} onPress={() => router.push("/ecosystem")} />
        <IconButton icon="cog-outline" accessibilityLabel={t("chats.settings")} onPress={() => router.push("/settings")} />
      </View>
      <View style={styles.buttons}>
        <Button title={t("chats.newChat")} onPress={() => void start(false)} />
        <Button title={t("chats.temporaryChat")} variant="ghost" onPress={() => void start(true)} />
      </View>
      <View style={styles.search}>
        <TextField label={t("chats.search")} value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} />
      </View>
      {otherChatsCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={handleOpenFirstOther}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 10,
            marginHorizontal: 16,
            marginBottom: 8,
            backgroundColor: th.colors.brandSoft,
            borderRadius: th.radius.md,
            gap: 8,
          }}
        >
          <Text
            style={{
              flex: 1,
              color: th.colors.brandSoftForeground,
              fontFamily: th.font.medium,
              fontSize: 13,
            }}
          >
            {t("outbox.otherChats", { count: otherChatsCount })}
          </Text>
        </Pressable>
      ) : null}
      <FlatList
        data={listRows}
        keyExtractor={(item) => item.key}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
        renderItem={({ item }) => {
          if (item.kind === "header") {
            return (
              <Text accessibilityRole="header" style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, color: th.colors.mutedForeground, fontFamily: th.font.medium, fontSize: 13 }}>
                {item.title}
              </Text>
            );
          }
          if (item.kind === "project") {
            return (
              <ListItem
                title={item.project.name}
                left={<MaterialCommunityIcons name="folder-outline" size={22} color={th.colors.foreground} />}
                onPress={() => {
                  onClose();
                  router.push(`/projects/${encodeURIComponent(item.project.id)}`);
                }}
              />
            );
          }
          if (item.kind === "allProjects") {
            return (
              <ListItem
                title={t("chats.allProjects")}
                onPress={() => {
                  onClose();
                  router.push("/projects");
                }}
              />
            );
          }
          return (
            <ChatRow
              chat={item.chat}
              active={item.chat.key === openKey}
              onPress={() => open(item.chat)}
              onLongPress={() => setMenu(item.chat)}
            />
          );
        }}
      />
      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu ? label(menu) : undefined}>
        <ListItem
          title={t("common.rename")}
          onPress={() => {
            setTitle(menu ? menu.title || menu.preview : "");
            setRenaming(menu);
            setMenu(null);
          }}
        />
        <ListItem
          title={t("common.delete")}
          onPress={() => {
            setDeleting(menu);
            setMenu(null);
          }}
        />
      </Sheet>
      <Dialog
        open={!!renaming}
        title={t("chats.renameTitle")}
        confirmLabel={t("common.rename")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void doRename()}
        onCancel={() => setRenaming(null)}
      >
        <TextField label={t("chats.titleLabel")} value={title} onChangeText={setTitle} />
      </Dialog>
      <Dialog
        open={!!deleting}
        title={t("chats.deleteTitle")}
        message={t("chats.deleteConfirm", { title: deleting ? label(deleting) : "" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => void doDelete()}
        onCancel={() => setDeleting(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 4, paddingTop: 8, gap: 10 },
  buttons: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, gap: 4 },
  search: { paddingHorizontal: 16 },
});
