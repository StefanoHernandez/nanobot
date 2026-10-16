import React, { useCallback } from "react";
import { BackHandler } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { ThreadScreen } from "../../../src/screens/thread/ThreadScreen";
import { useSession } from "../../../src/state/sessionStore";
import { threadStore } from "../../../src/state/threadStore";
import { chatsStore } from "../../../src/state/chatsStore";
import { speechStore } from "../../../src/extras/speech";

type NavNode = {
  getState?: () => { type?: string; history?: unknown[] } | undefined;
  getParent?: () => NavNode | undefined;
};

function drawerEntry(entry: unknown): boolean {
  return !!entry && typeof entry === "object" && (entry as { type?: string }).type === "drawer";
}

function drawerIsOpen(navigation: NavNode): boolean {
  let current: NavNode | undefined = navigation;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    const state = current.getState?.();
    if (state?.type === "drawer") return !!state.history?.some(drawerEntry);
    current = current.getParent?.();
  }
  return false;
}

export default function ChatRoute() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { session } = useSession();
  const navigation = useNavigation();

  const openChatList = useCallback(() => {
    if (session && chatsStore.getState().isTemporary(key)) {
      threadStore.getState().scheduleLeave(session, key);
    }
    router.replace("/");
    // expo-router (SDK 56+) refuses @react-navigation imports; this is the action DrawerActions.openDrawer() builds.
    navigation.dispatch({ type: "OPEN_DRAWER" });
  }, [key, navigation, session]);

  useFocusEffect(
    useCallback(() => {
      threadStore.getState().cancelLeave(key);
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (drawerIsOpen(navigation)) return false;
        openChatList();
        return true;
      });
      return () => {
        sub.remove();
        // The Drawer keeps this screen mounted when you leave it, so stop read-aloud on blur, not unmount.
        speechStore.getState().stop();
        if (session && chatsStore.getState().isTemporary(key)) {
          threadStore.getState().scheduleLeave(session, key);
        }
      };
    }, [key, navigation, openChatList, session]),
  );

  return <ThreadScreen chatKey={key} onBack={openChatList} />;
}
