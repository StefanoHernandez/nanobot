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
import { projectsStore } from "../../projects/store";

const chatPath = (key: string) => `/chat/${encodeURIComponent(key)}` as const;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

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

  const rows = q.trim() ? search(q) : chats;
  const label = (c: ChatSummary) => chatTitle(c, t("chats.untitled"));

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
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          onClose();
          router.push("/projects");
        }}
        style={({ pressed }) => [
          styles.projectRow,
          { backgroundColor: pressed ? th.colors.accent : "transparent" },
        ]}
      >
        <MaterialCommunityIcons name="folder-outline" size={22} color={th.colors.foreground} />
        <Text style={{ flex: 1, color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 15 }}>
          {t("projects.title")}
        </Text>
      </Pressable>
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
        data={rows}
        keyExtractor={(c) => c.key}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
        renderItem={({ item }) => (
          <ChatRow
            chat={item}
            active={item.key === openKey}
            onPress={() => open(item)}
            onLongPress={() => setMenu(item)}
          />
        )}
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
  projectRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 8,
    gap: 12,
  },
  search: { paddingHorizontal: 16 },
});
