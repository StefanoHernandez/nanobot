import React, { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useStore } from "zustand";
import { useTheme } from "../ui/ThemeProvider";
import { useT } from "../i18n";
import { Button, Sheet, toast } from "../ui/components";
import { approvalsStore, decideApproval, chatLabelFor } from "./approvals";
import { chatsStore } from "../state/chatsStore";
import { sessionStore } from "../state/sessionStore";

export function ApprovalCard() {
  const t = useT();
  const th = useTheme();
  const pending = useStore(approvalsStore, (s) => s.pending);
  const chats = useStore(chatsStore, (s) => s.chats);
  const session = useStore(sessionStore, (s) => s.session);

  const item = pending[0] ?? null;
  const [secondsLeft, setSecondsLeft] = useState(item?.expires_in ?? 0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!item) return;
    setSecondsLeft(item.expires_in);
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [item?.id, item?.expires_in]);

  if (!item) return null;

  const originLabel = chatLabelFor(item.session_key, chats, t);

  const handleDecide = async (allow: boolean, always: boolean) => {
    if (busyRef.current || !item || !session) return;
    busyRef.current = true;
    setBusy(true);
    const currentId = item.id;
    const sessionKey = item.session_key;
    try {
      await decideApproval(session, currentId, allow, always);
      approvalsStore.getState().removePending(currentId, always ? sessionKey : undefined);
    } catch (err: any) {
      if (err?.status === 404) {
        toast.show(t("approvals.expired"));
        approvalsStore.getState().removePending(currentId);
      } else {
        toast.show(t("common.operationFailed"));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet open={true} onClose={() => {}} title={t("approvals.title")}>
      <View style={{ marginBottom: 12 }}>
        <Text
          style={{
            color: th.colors.foreground,
            fontFamily: th.font.medium,
            fontSize: 15,
            marginBottom: 4,
          }}
        >
          {originLabel}
        </Text>
        <Text
          style={{
            color: th.colors.mutedForeground,
            fontFamily: th.font.regular,
            fontSize: 13,
          }}
        >
          {t("approvals.expiresIn", { sec: secondsLeft })}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{
          backgroundColor: th.colors.card,
          borderRadius: th.radius.md,
          padding: 12,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: th.colors.border,
        }}
      >
        <Text
          selectable
          style={{
            color: th.colors.cardForeground,
            fontFamily: th.font.mono,
            fontSize: 14,
            lineHeight: 20,
          }}
        >
          {item.summary}
        </Text>
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 12, marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            title={t("approvals.deny")}
            variant="destructive"
            disabled={busy}
            onPress={() => void handleDecide(false, false)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title={t("approvals.allow")}
            variant="primary"
            disabled={busy}
            onPress={() => void handleDecide(true, false)}
          />
        </View>
      </View>

      <Button
        title={t("approvals.always")}
        variant="ghost"
        disabled={busy}
        onPress={() => void handleDecide(true, true)}
      />
    </Sheet>
  );
}
