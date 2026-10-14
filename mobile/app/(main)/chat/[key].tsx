import React, { useCallback } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ThreadScreen } from "../../../src/screens/thread/ThreadScreen";
import { useSession } from "../../../src/state/sessionStore";
import { threadStore } from "../../../src/state/threadStore";
import { chatsStore } from "../../../src/state/chatsStore";

export default function ChatRoute() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { session } = useSession();

  useFocusEffect(
    useCallback(() => {
      threadStore.getState().cancelLeave(key);
      return () => {
        if (session && chatsStore.getState().isTemporary(key)) {
          threadStore.getState().scheduleLeave(session, key);
        }
      };
    }, [key, session]),
  );

  return (
    <ThreadScreen
      chatKey={key}
      onBack={() => {
        if (session && chatsStore.getState().isTemporary(key)) {
          threadStore.getState().scheduleLeave(session, key);
        }
        if (router.canGoBack()) router.back();
        else router.replace("/");
      }}
    />
  );
}
