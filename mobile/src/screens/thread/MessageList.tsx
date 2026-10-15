import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { normalizeActivityTimeline, type TurnUnit } from "@/lib/activity-timeline";
import type { UIMessage } from "@/lib/types";
import { useT } from "../../i18n";
import { chatsStore } from "../../state/chatsStore";
import type { Notice } from "../../state/threadStore";
import { ListItem, Sheet, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { MessageRow } from "./MessageRow";
import { NoticeRow } from "./NoticeRow";

type Item = TurnUnit | { type: "fork" };

const keyOf = (u: Item) => (u.type === "fork" ? "fork-boundary" : u.type === "message" ? u.message.id : `a:${u.messages[0].id}`);

// ponytail: inverted FlatList, not FlashList: rows have wildly variable height (markdown) and streaming
// growth; FlatList is dependency-free and fine for chat-sized threads. Swap if very long histories lag.
export function MessageList({ chatKey, messages, running, notices, forkBoundary }: { chatKey?: string; messages: UIMessage[]; running: boolean; notices: Notice[]; forkBoundary?: number | null }) {
  const t = useT();
  const th = useTheme();
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
  const fork = async () => {
    const m = menu;
    setMenu(null);
    if (!m || !chatKey) return;
    const all = msgsRef.current;
    const at = all.findIndex((x) => x.id === m.id);
    // ordinal (among user messages) of the first user message after this answer; none -> count of user messages
    const before = all.slice(0, at + 1).filter((x) => x.role === "user").length;
    try {
      const nk = await chatsStore.getState().fork(chatKey, before);
      router.push(("/chat/" + encodeURIComponent(nk)) as never);
    } catch {
      toast.show(t("fork.error"));
    }
  };

  return (
    <>
      <FlatList
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
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={9}
      />
      {menu ? (
        <Sheet open onClose={() => setMenu(null)}>
          <ListItem title={t("fork.copy")} onPress={() => { void Clipboard.setStringAsync(menu.content); setMenu(null); toast.show(t("fork.copied")); }} />
          <ListItem title={t("fork.fork")} onPress={() => void fork()} />
        </Sheet>
      ) : null}
    </>
  );
}
