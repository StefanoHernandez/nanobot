import React, { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import type { ChatSummary } from "@/lib/types";
import { useChats } from "../../state/chatsStore";
import { useSession } from "../../state/sessionStore";
import { StatusDot } from "../../extras/StatusDot";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import { Button, Dialog, IconButton, ListItem, Sheet, TextField, toast } from "../../ui/components";
import { ChatRow, chatTitle } from "./ChatRow";

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
  const { profile } = useSession();
  const chats = useChats((s) => s.chats); // subscribes the list; search() reads the same store
  const loading = useChats((s) => s.loading);
  const refresh = useChats((s) => s.refresh);
  const search = useChats((s) => s.search);
  const rename = useChats((s) => s.rename);
  const remove = useChats((s) => s.remove);
  const start = useStartChat(onClose);
  const pathname = usePathname();
  const openKey = pathname.startsWith("/chat/") ? decodeURIComponent(pathname.slice("/chat/".length)) : null;

  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<ChatSummary | null>(null);
  const [renaming, setRenaming] = useState<ChatSummary | null>(null);
  const [deleting, setDeleting] = useState<ChatSummary | null>(null);
  const [title, setTitle] = useState("");

  const rows = q.trim() ? search(q) : chats;
  const label = (c: ChatSummary) => chatTitle(c, t("chats.untitled"));

  const open = (c: ChatSummary) => {
    router.navigate(chatPath(c.key));
    onClose();
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
        <Text numberOfLines={1} style={{ flex: 1, color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 18 }}>
          {profile?.name ?? ""}
        </Text>
        <StatusDot />
        <IconButton icon="puzzle-outline" accessibilityLabel={t("ecosystem.title")} onPress={() => router.push("/ecosystem")} />
        <IconButton icon="cog-outline" accessibilityLabel={t("chats.settings")} onPress={() => router.push("/settings")} />
      </View>
      <View style={styles.buttons}>
        <Button title={t("chats.newChat")} onPress={() => void start(false)} />
        <Button title={t("chats.temporaryChat")} variant="secondary" onPress={() => void start(true)} />
      </View>
      <View style={styles.search}>
        <TextField label={t("chats.search")} value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} />
      </View>
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
  header: { flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 4, gap: 8 },
  buttons: { padding: 16, gap: 8 },
  search: { paddingHorizontal: 16 },
});
