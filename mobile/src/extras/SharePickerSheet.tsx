import React, { useEffect, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { useT } from "../i18n";
import { chatTitle } from "../screens/chats/ChatRow";
import { chatsStore, isWritable, useChats } from "../state/chatsStore";
import { useTheme } from "../ui/ThemeProvider";
import { Button, ListItem, Sheet, TextField } from "../ui/components";
import { applyShareToChat, shareStore, useShare } from "./share";

export function SharePickerSheet() {
  const t = useT();
  const th = useTheme();
  const pending = useShare((s) => s.pending);
  const chats = useChats((s) => s.chats);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = React.useRef(false);

  useEffect(() => {
    if (!pending) setQuery("");
  }, [pending]);

  const filteredChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chats.filter((c) => {
      if (!isWritable(c.key) || chatsStore.getState().isTemporary(c.key)) return false;
      if (!q) return true;
      const title = c.title?.toLowerCase() ?? "";
      const preview = c.preview?.toLowerCase() ?? "";
      return title.includes(q) || preview.includes(q);
    });
  }, [chats, query]);

  const handleSelect = async (targetKey: string | "new") => {
    if (busyRef.current || !pending) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await applyShareToChat(targetKey, pending);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!pending} onClose={() => shareStore.getState().clear()} title={t("share.pickChatTitle")}>
      {pending ? (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.content}>
            <View style={[styles.summary, { backgroundColor: th.colors.muted, borderRadius: th.radius.md }]}>
              {pending.text ? (
                <Text numberOfLines={2} style={{ color: th.colors.mutedForeground, fontSize: 13 }}>
                  {pending.text}
                </Text>
              ) : null}
              {pending.files.length ? (
                <Text
                  style={{
                    color: th.colors.foreground,
                    fontFamily: th.font.medium,
                    fontSize: 12,
                    marginTop: pending.text ? 4 : 0,
                  }}
                >
                  {t("share.filesCount", { count: pending.files.length })}
                </Text>
              ) : null}
            </View>

            <View style={styles.actionWrap}>
              <Button
                title={t("share.newChat")}
                variant="primary"
                disabled={busy}
                loading={busy}
                onPress={() => void handleSelect("new")}
              />
            </View>

            <TextField
              label={t("chats.search")}
              value={query}
              onChangeText={setQuery}
              placeholder={t("chats.search")}
            />

            <FlatList
              data={filteredChats}
              keyExtractor={(item) => item.key}
              style={{ maxHeight: 320 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <ListItem
                  title={chatTitle(item, t("chats.untitled"))}
                  subtitle={item.preview}
                  onPress={() => void handleSelect(item.key)}
                />
              )}
            />
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  summary: { padding: 12 },
  actionWrap: { minHeight: 48 },
});
