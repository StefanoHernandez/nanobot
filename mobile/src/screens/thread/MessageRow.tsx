import React, { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { useStore } from "zustand";
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

type Props = { unit: TurnUnit; live: boolean; onLongPress?: (m: UIMessage) => void };

function MessageRowImpl({ unit, live, onLongPress }: Props) {
  const t = useT();
  const th = useTheme();
  const m = unit.type === "message" ? unit.message : null;
  const isSpeaking = useStore(speechStore, (s) => (m ? s.speakingId === m.id : false));
  const audioOn = useStore(speechStore, (s) => s.enabled);

  const isFinishedAnswer =
    !!m && m.role === "assistant" && !live && !m.isStreaming && m.kind !== "trace" && !!m.content;


  if (unit.type === "activity") return <ActivityRow messages={unit.messages} live={live} startedAtMs={unit.startedAtMs} />;
  if (!m) return null;

  if (m.role === "user")
    return (
      <View style={{ alignSelf: "flex-end", maxWidth: "85%", marginTop: 22, marginBottom: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: th.radius.md, borderBottomRightRadius: 6, backgroundColor: th.colors.userBubble, opacity: m.deliveryStatus === "sending" ? 0.6 : 1 }}>
        <Text selectable style={{ color: th.colors.userBubbleForeground, fontFamily: th.font.regular, fontSize: 16, lineHeight: 23 }}>{m.content}</Text>
        {m.media?.length ? <MediaList media={m.media} /> : null}
      </View>
    );

  // finished, non-empty assistant answer: long-press opens the copy/fork menu
  const finished = !!onLongPress && isFinishedAnswer;
  const Wrap = finished ? Pressable : View;
  return (
    <Wrap
      // Answers sit on the page, full width: the bubble is reserved for the user's messages.
      style={{ marginVertical: 6, paddingHorizontal: 16 }}
      {...(finished ? { onLongPress: () => onLongPress!(m) } : {})}
    >
      {m.reasoning ? <ReasoningBlock text={m.reasoning} streaming={!!m.reasoningStreaming} /> : null}
      {m.content ? <Markdown text={m.content} /> : null}
      {m.media?.length ? <MediaList media={m.media} /> : null}
      {isFinishedAnswer && audioOn ? (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4 }}>
          <IconButton
            icon={isSpeaking ? "stop-circle-outline" : "volume-high"}
            accessibilityLabel={t(isSpeaking ? "speech.stop" : "speech.listen")}
            onPress={() => speechStore.getState().toggle(m.id, m.content)}
          />
        </View>
      ) : null}
    </Wrap>
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
  if (a.live !== b.live || a.onLongPress !== b.onLongPress || a.unit.type !== b.unit.type) return false;
  if (a.unit.type === "message") return shallowEq(a.unit.message, (b.unit as typeof a.unit).message);
  const x = a.unit.messages;
  const y = (b.unit as typeof a.unit).messages;
  return a.unit.startedAtMs === (b.unit as typeof a.unit).startedAtMs && x.length === y.length && x.every((m, i) => shallowEq(m, y[i]));
};

export const MessageRow = memo(MessageRowImpl, same);
