import { NativeModules } from "react-native";
import { kv } from "../platform/storage";
import { sessionStore } from "../state/sessionStore";
import { chatsStore } from "../state/chatsStore";
import { profiles } from "../core/profiles";
import { router } from "expo-router";

export type WidgetStatus = {
  profileName: string | null;
  state: "open" | "connecting" | "offline" | "none";
  updatedAt: number;
};

export function toWidgetState(state: string): WidgetStatus["state"] {
  if (state === "open") return "open";
  if (state === "connecting" || state === "reconnecting") return "connecting";
  if (state === "offline" || state === "auth_error") return "offline";
  return "none";
}

export function syncWidgetStatus(profileName: string | null, rawState: string): WidgetStatus {
  const status: WidgetStatus = {
    profileName: profileName ?? null,
    state: toWidgetState(rawState),
    updatedAt: Date.now(),
  };
  kv.set("widget.status", JSON.stringify(status));
  try {
    NativeModules.NanobotWidget?.updateStatus?.(status.profileName ?? "", status.state);
  } catch {}
  return status;
}

export function startWidgetStatusSync(): () => void {
  const initial = sessionStore.getState();
  syncWidgetStatus(initial.profile?.name ?? null, initial.state);

  return sessionStore.subscribe((curr, prev) => {
    if (curr.profile?.name !== prev.profile?.name || curr.state !== prev.state) {
      syncWidgetStatus(curr.profile?.name ?? null, curr.state);
    }
  });
}

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
