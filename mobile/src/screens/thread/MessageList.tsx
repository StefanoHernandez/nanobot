import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { normalizeActivityTimeline, type TurnUnit } from "@/lib/activity-timeline";
import type { UIMessage } from "@/lib/types";
import { useStore } from "zustand";
import { useT } from "../../i18n";
import { chatsStore } from "../../state/chatsStore";
import { threadStore, type Notice } from "../../state/threadStore";
import { ListItem, Sheet, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { MessageRow } from "./MessageRow";
import { NoticeRow } from "./NoticeRow";
import { markComposerForFocus } from "./Composer";

type Item = TurnUnit | { type: "fork" };

const keyOf = (u: Item) => (u.type === "fork" ? "fork-boundary" : u.type === "message" ? u.message.id : `a:${u.messages[0].id}`);

// ponytail: inverted FlatList, not FlashList: rows have wildly variable height (markdown) and streaming
// growth; FlatList is dependency-free and fine for chat-sized threads. Swap if very long histories lag.
export function MessageList({ chatKey, messages, running, notices, forkBoundary }: { chatKey?: string; messages: UIMessage[]; running: boolean; notices: Notice[]; forkBoundary?: number | null }) {
  const t = useT();
  const th = useTheme();
  const loadingOlder = useStore(threadStore, (s) => !!(chatKey && s.threads[chatKey]?.loadingOlder));
  const hasMoreBefore = useStore(threadStore, (s) => !!(chatKey && s.threads[chatKey]?.hasMoreBefore));
  const [menu, setMenu] = useState<UIMessage | null>(null);
  const msgsRef = useRef(messages);
  msgsRef.current = messages;
  // newest first: with `inverted` the list is pinned to the bottom and streaming grows upwards without scroll juggling
  const data = useMemo(() => {
    const units = normalizeActivityTimeline(messages);
    const items: Item[] = [...units];
    if (forkBoundary != null && forkBoundary > 0) {
      // derived rows (split reasoning, merged answers) map back to a source message by id
      const at = new Map(messages.map((m, i) => [m.id, i]));
      const src = (id: string) => at.get(id) ?? at.get(id.replace(/-reasoning$/, "")) ?? -1;
      let last = -1;
      units.forEach((u, i) => {
        const idx = u.type === "message" ? src(u.message.id) : Math.max(...u.messages.map((m) => src(m.id)));
        if (idx >= 0 && idx < forkBoundary) last = i;
      });
      items.splice(last + 1, 0, { type: "fork" });
    }
    return items.reverse();
  }, [messages, forkBoundary]);

  const onLongPress = useCallback((m: UIMessage) => setMenu(m), []);

  const isTemp = !!chatKey && chatsStore.getState().isTemporary(chatKey);

  /** Number of user messages before `id` (inclusive of `id` when `through`), counted over the full history:
   * the server's before_user_index is absolute, so older pages are loaded first. */
  const userIndexOf = async (id: string, through: boolean) => {
    const st = () => threadStore.getState().threads[chatKey!];
    while (st()?.hasMoreBefore) {
      const prev = st()?.beforeCursor;
      await threadStore.getState().loadOlder(chatKey!);
      if (st()?.beforeCursor === prev) break;
    }
    const stored = st()?.messages ?? [];
    const all = stored.some((x) => x.id === id) ? stored : msgsRef.current;
    const at = all.findIndex((x) => x.id === id);
    return all.slice(0, at + (through ? 1 : 0)).filter((x) => x.role === "user").length;
  };

  const editMessage = async (m: UIMessage) => {
    setMenu(null);
    if (!chatKey) return;
    const beforeUserIndex = await userIndexOf(m.id, false);
    const origTitle = chatsStore.getState().chats.find((c) => c.key === chatKey)?.title;
    const title = t("fork.editedTitle", { title: origTitle || t("chats.untitled") });
    const hasAttachments = !!(m.media?.length || m.images?.length);

    try {
      const nk = await chatsStore.getState().fork(chatKey, beforeUserIndex, title);
      threadStore.getState().setDraft(nk, m.content);
      markComposerForFocus(nk);
      if (hasAttachments) {
        toast.show(t("fork.attachmentsNotCarried", { defaultValue: "Gli allegati vanno riaggiunti" }));
      }
      router.push(("/chat/" + encodeURIComponent(nk)) as never);
    } catch {
      toast.show(t("common.error"));
    }
  };

  const fork = async () => {
    const m = menu;
    setMenu(null);
    if (!m || !chatKey) return;
    // ordinal (among user messages) of the first user message after this answer; none -> count of user messages
    const before = await userIndexOf(m.id, true);
    try {
      const nk = await chatsStore.getState().fork(chatKey, before);
      router.push(("/chat/" + encodeURIComponent(nk)) as never);
    } catch {
      toast.show(t("fork.error"));
    }
  };

  const onEndReached = useCallback(() => {
    if (chatKey && hasMoreBefore && !loadingOlder) {
      void threadStore.getState().loadOlder(chatKey);
    }
  }, [chatKey, hasMoreBefore, loadingOlder]);

  return (
    <>
      <FlatList
        testID="message-flatlist"
        inverted
        data={data}
        keyExtractor={keyOf}
        renderItem={({ item, index }) =>
          item.type === "fork" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 8 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: th.colors.border }} />
              <Text style={{ color: th.colors.mutedForeground, fontSize: 12 }}>{t("fork.here")}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: th.colors.border }} />
            </View>
          ) : (
            <MessageRow unit={item} live={running && index === 0} chatKey={chatKey} onLongPress={chatKey ? onLongPress : undefined} />
          )
        }
        ListHeaderComponent={<>{notices.map((n, i) => <NoticeRow key={`${n.kind}:${i}`} notice={n} />)}</>}
        ListFooterComponent={loadingOlder ? (
          <View testID="loading-older" style={{ paddingVertical: 12, alignItems: "center" }}>
            <ActivityIndicator size="small" color={th.colors.mutedForeground} />
          </View>
        ) : null}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.2}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={9}
      />
      {menu ? (
        <Sheet open onClose={() => setMenu(null)}>
          <ListItem title={t("fork.copy")} onPress={() => { void Clipboard.setStringAsync(menu.content); setMenu(null); toast.show(t("fork.copied")); }} />
          {menu.role === "user" ? (
            !isTemp ? (
              <ListItem
                title={t("fork.edit", { defaultValue: "Modifica" })}
                subtitle={running ? t("fork.editDisabledRunning", { defaultValue: "Non disponibile durante la risposta" }) : undefined}
                disabled={running}
                onPress={() => void editMessage(menu)}
              />
            ) : null
          ) : (
            <ListItem title={t("fork.fork")} onPress={() => void fork()} />
          )}
        </Sheet>
      ) : null}
    </>
  );
}
