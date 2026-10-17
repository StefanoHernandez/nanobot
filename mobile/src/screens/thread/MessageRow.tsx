import React, { memo, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useStore } from "zustand";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { UIMessage } from "@/lib/types";
import type { TurnUnit } from "@/lib/activity-timeline";
import { speechStore } from "../../extras/speech";
import { useT } from "../../i18n";
import { IconButton } from "../../ui/components";
import { Markdown } from "../../ui/markdown/Markdown";
import { useTheme } from "../../ui/ThemeProvider";
import { ActivityRow } from "./ActivityRow";
import { MediaList } from "./media/MediaViews";
import { ReasoningBlock } from "./ReasoningBlock";
import { artifactStore } from "../viewer/artifactStore";
import { threadStore } from "../../state/threadStore";

type Props = {
  unit: TurnUnit;
  live: boolean;
  chatKey?: string;
  onLongPress?: (m: UIMessage) => void;
  onReply?: (m: UIMessage) => void;
};

function MessageRowImpl({ unit, live, chatKey, onLongPress, onReply }: Props) {
  const t = useT();
  const th = useTheme();
  const swipeableRef = useRef<Swipeable>(null);
  const m = unit.type === "message" ? unit.message : null;
  const isSpeaking = useStore(speechStore, (s) => (m ? s.speakingId === m.id : false));
  const audioOn = useStore(speechStore, (s) => s.enabled);

  const isFinishedAnswer =
    !!m && m.role === "assistant" && !live && !m.isStreaming && m.kind !== "trace" && !!m.content;
  const showOpenDocument = isFinishedAnswer && (m?.content.trim().length ?? 0) >= 800;


  if (unit.type === "activity") return <ActivityRow messages={unit.messages} live={live} startedAtMs={unit.startedAtMs} />;
  if (!m) return null;

  if (m.kind === "compaction") {
    const comp = m.compaction as { phase?: string; tokensBefore?: number; tokensAfter?: number } | undefined;
    const phase = comp?.phase;
    let label = t("thread.compaction.succeeded", { defaultValue: "Contesto compattato" });
    if (phase === "failed") {
      label = t("thread.compaction.failed", { defaultValue: "Compattazione non riuscita" });
    } else if (phase === "cancelled") {
      label = t("thread.compaction.cancelled", { defaultValue: "Compattazione annullata" });
    } else if (phase === "succeeded") {
      const before = comp?.tokensBefore;
      const after = comp?.tokensAfter;
      if (typeof before === "number" && typeof after === "number") {
        const freed = Math.max(0, before - after);
        label = t("thread.compaction.freed", {
          defaultValue: `Contesto compattato · liberati ~${freed} token (da ${before} a ${after})`,
          freed,
          before,
          after,
        });
      } else if (typeof after === "number") {
        label = t("thread.compaction.afterOnly", {
          defaultValue: `Contesto compattato · dopo: ${after} token`,
          after,
        });
      } else {
        label = t("thread.compaction.succeeded", { defaultValue: "Contesto compattato" });
      }
    }
    return (
      <View testID="compaction-divider" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 12, paddingHorizontal: 16 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: th.colors.border }} />
        <Text style={{ color: phase === "failed" ? th.colors.destructive : th.colors.mutedForeground, fontSize: 12 }}>{label}</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: th.colors.border }} />
      </View>
    );
  }

  const handleReply = () => {
    if (!m) return;
    if (onReply) {
      onReply(m);
    } else if (chatKey) {
      threadStore.getState().setReplyingTo(chatKey, m);
    }
  };

  const renderLeftActions = () => (
    <View style={{ justifyContent: "center", alignItems: "center", width: 44, paddingLeft: 8 }}>
      <MaterialCommunityIcons name="reply" size={20} color={th.colors.brand} />
    </View>
  );

  if (m.role === "user") {
    const canEdit = !!onLongPress && m.deliveryStatus !== "sending";
    const UserWrap = canEdit ? Pressable : View;
    return (
      <Swipeable
        ref={swipeableRef}
        testID={`message-swipe-${m.id}`}
        friction={2}
        leftThreshold={40}
        overshootLeft={false}
        renderLeftActions={renderLeftActions}
        onSwipeableOpen={(direction) => {
          if (direction === "left") {
            handleReply();
            swipeableRef.current?.close();
          }
        }}
      >
        <UserWrap
          {...(canEdit ? { onLongPress: () => onLongPress!(m) } : {})}
          style={{ alignSelf: "flex-end", maxWidth: "85%", marginTop: 22, marginBottom: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: th.radius.md, borderBottomRightRadius: 6, backgroundColor: th.colors.userBubble, opacity: m.deliveryStatus === "sending" ? 0.6 : 1 }}
        >
          <Text selectable style={{ color: th.colors.userBubbleForeground, fontFamily: th.font.regular, fontSize: 16, lineHeight: 23 }}>{m.content}</Text>
          {m.media?.length ? <MediaList media={m.media} /> : null}
        </UserWrap>
      </Swipeable>
    );
  }

  // finished, non-empty assistant answer: long-press opens the copy/fork menu
  const finished = !!onLongPress && isFinishedAnswer;
  const Wrap = finished ? Pressable : View;
  return (
    <Swipeable
      ref={swipeableRef}
      testID={`message-swipe-${m.id}`}
      friction={2}
      leftThreshold={40}
      overshootLeft={false}
      renderLeftActions={renderLeftActions}
      onSwipeableOpen={(direction) => {
        if (direction === "left") {
          handleReply();
          swipeableRef.current?.close();
        }
      }}
    >
      <Wrap
        // Answers sit on the page, full width: the bubble is reserved for the user's messages.
        style={{ marginVertical: 6, paddingHorizontal: 16 }}
        {...(finished ? { onLongPress: () => onLongPress!(m) } : {})}
      >
        {m.reasoning ? <ReasoningBlock text={m.reasoning} streaming={!!m.reasoningStreaming} /> : null}
        {m.content ? <Markdown text={m.content} chatKey={chatKey} messageId={m.id} /> : null}
        {m.media?.length ? <MediaList media={m.media} /> : null}
        {showOpenDocument || (isFinishedAnswer && audioOn) ? (
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4 }}>
            {showOpenDocument ? (
              <IconButton
                icon="book-open-variant"
                accessibilityLabel={t("artifact.openDocument")}
                onPress={() => {
                  artifactStore.set(m.content, "answer.md");
                  router.push({ pathname: "/viewer", params: { name: "answer.md" } });
                }}
              />
            ) : null}
            {isFinishedAnswer && audioOn ? (
              <IconButton
                icon={isSpeaking ? "stop-circle-outline" : "volume-high"}
                accessibilityLabel={t(isSpeaking ? "speech.stop" : "speech.listen")}
                onPress={() => speechStore.getState().toggle(m.id, m.content)}
              />
            ) : null}
          </View>
        ) : null}
      </Wrap>
    </Swipeable>
  );
}

const shallowEq = (a: object, b: object) => {
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const k = Object.keys(x);
  return k.length === Object.keys(y).length && k.every((key) => x[key] === y[key]);
};

/** The vendor projection re-creates derived rows (split reasoning, merged answers) on every call, so identity
 * is useless; compare the messages field by field (their nested arrays keep identity while unchanged). */
const same = (a: Props, b: Props) => {
  if (a.chatKey !== b.chatKey || a.live !== b.live || a.onLongPress !== b.onLongPress || a.onReply !== b.onReply || a.unit.type !== b.unit.type) return false;
  if (a.unit.type === "message") return shallowEq(a.unit.message, (b.unit as typeof a.unit).message);
  const x = a.unit.messages;
  const y = (b.unit as typeof a.unit).messages;
  return a.unit.startedAtMs === (b.unit as typeof a.unit).startedAtMs && x.length === y.length && x.every((m, i) => shallowEq(m, y[i]));
};

export const MessageRow = memo(MessageRowImpl, same);
