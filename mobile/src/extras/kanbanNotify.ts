import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useStore } from "zustand";
import { fetchKanbanEvents, type KanbanEvent } from "../ecosystem/kanban";
import { usePolling } from "../ecosystem/common";
import { i18n } from "../i18n";
import { kv } from "../platform/storage";
import { prefs } from "../settings/prefs";
import { sessionStore } from "../state/sessionStore";
import { toast } from "../ui/components";
import { CHANNEL } from "./notifications";

const SEEN_CAP = 200;
const seenKeys: string[] = [];
let onKanbanScreen = false;

function rememberKey(key: string): boolean {
  if (seenKeys.includes(key)) return false;
  seenKeys.push(key);
  while (seenKeys.length > SEEN_CAP) seenKeys.shift();
  return true;
}

function cursorKey(profileId: string): string {
  return `kanban.since.${profileId}`;
}

export function setOnKanbanScreen(on: boolean): void {
  onKanbanScreen = on;
}

export function resetKanbanNotifyState(): void {
  seenKeys.length = 0;
}

function notifyEvent(event: KanbanEvent): void {
  const title = i18n.t(`kanban.notify.${event.kind}`);
  const body = event.title;
  const isBackground = AppState.currentState !== "active";
  if (isBackground) {
    void Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { kanbanTask: event.task_id, board: event.board_id },
      },
      trigger: { channelId: CHANNEL },
    });
    return;
  }
  if (!onKanbanScreen) {
    toast.show(body ? `${title}: ${body}` : title);
  }
}

export async function pollKanbanNotifications(): Promise<void> {
  const { session, profile } = sessionStore.getState();
  if (!session || !profile?.id || !prefs.kanbanNotifications()) return;

  const storeKey = cursorKey(profile.id);
  const rawCursor = kv.get(storeKey);
  const hasCursor = rawCursor !== undefined && rawCursor !== null && rawCursor !== "";
  const since = hasCursor ? Number(rawCursor) : null;

  try {
    const data = await fetchKanbanEvents(session, since ?? 0);
    if (sessionStore.getState().profile?.id !== profile.id) return;

    kv.set(storeKey, String(data.now));

    if (!hasCursor) return;

    for (const event of data.events) {
      if (!rememberKey(event.key)) continue;
      notifyEvent(event);
    }
  } catch {
    // quiet: the next tick retries
  }
}

export function useKanbanNotifications(): void {
  const isOpen = useStore(sessionStore, (s) => s.state === "open");
  const profileId = useStore(sessionStore, (s) => s.profile?.id);
  const [notifyOn, setNotifyOn] = useState(() => prefs.kanbanNotifications());
  useEffect(() => prefs.subscribeKanbanNotifications(() => setNotifyOn(prefs.kanbanNotifications())), []);
  const enabled = Platform.OS !== "web" && isOpen && notifyOn;

  useEffect(() => {
    if (enabled) void pollKanbanNotifications();
  }, [enabled, profileId]);

  usePolling({
    enabled,
    intervalMs: 60_000,
    tick: pollKanbanNotifications,
    background: true,
  });
}

if (sessionStore && typeof sessionStore.subscribe === "function") {
  sessionStore.subscribe((state, prev) => {
    if (state.profile?.id !== prev.profile?.id) {
      resetKanbanNotifyState();
    }
  });
}
