import { sessionStore } from "../state/sessionStore";
import { chatsStore } from "../state/chatsStore";
import { profiles } from "../core/profiles";
import { router } from "expo-router";

export async function handleNewChatIntent(): Promise<void> {
  if (!profiles.activeId()) {
    router.replace("/connect");
    return;
  }
  if (sessionStore.getState().state === "open") {
    try {
      const key = await chatsStore.getState().newChat();
      router.replace(`/chat/${encodeURIComponent(key)}` as never);
    } catch {
      router.replace("/");
    }
  }
}
