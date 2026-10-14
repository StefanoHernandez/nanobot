import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { i18n } from "../i18n";
import { kv } from "../platform/storage";
import { prefs } from "../settings/prefs";
import { chatsStore } from "../state/chatsStore";
import { threadStore } from "../state/threadStore";
import { sessionStore } from "../state/sessionStore";
import type { NanobotSession } from "../core/session";

export const CHANNEL = "turns";
const ASKED = "notif.asked";

export const notificationHandler = async () => ({
  shouldShowBanner: true,
  shouldShowList: true,
  shouldPlaySound: prefs.notificationSound(),
  shouldSetBadge: false,
});

export async function setupNotifications(): Promise<void> {
  Notifications.setNotificationHandler({ handleNotification: notificationHandler });
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: i18n.t("extras.channel"),
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE, // reply text never on the lock screen
  });
  if (kv.get(ASKED)) return;
  kv.set(ASKED, "1"); // ask once, whatever the answer
  await Notifications.requestPermissionsAsync();
}

export const chatPath = (key: string) => `/chat/${encodeURIComponent(key)}`;

/** Key carried by a tapped notification, if it is ours. */
export function keyOfResponse(r: Notifications.NotificationResponse | null | undefined): string | null {
  const k = r?.notification.request.content.data?.key;
  return typeof k === "string" ? k : null;
}

/**
 * Global run-status hook (no per-chat onChat, which would drain the vendor's pending-inbound replay buffer and
 * attach every listed chat): a running -> null transition means the turn ended. One notification per chatId+startedAt.
 * ponytail: only chats attached in this app session (opened or messaged) report run status, so only those notify.
 */
export function startTurnNotifications(
  isForeground: () => boolean = () => AppState.currentState === "active",
): () => void {
  let off: (() => void) | null = null;
  const bind = (session: NanobotSession | null) => {
    off?.();
    off = null;
    if (!session) return;
    const running = new Map<string, number>();
    const done = new Set<string>();
    off = session.client.onRunStatus((chatId, startedAt) => {
      if (startedAt !== null) {
        running.set(chatId, startedAt);
        return;
      }
      const at = running.get(chatId);
      running.delete(chatId);
      if (at === undefined || done.has(`${chatId}:${at}`)) return;
      done.add(`${chatId}:${at}`);
      const key = `websocket:${chatId}`;
      const th = threadStore.getState().threads[key];
      if (isForeground() || th?.stopped) return;
      const last = [...(th?.messages ?? [])].reverse().find((m) => m.role === "assistant" && m.content?.trim());
      const body = last?.content.trim().slice(0, 120) || i18n.t("extras.replyReady");
      const title = chatsStore.getState().chats.find((c) => c.key === key)?.title || "nanobot";
      void Notifications.scheduleNotificationAsync({ content: { title, body, data: { key } }, trigger: { channelId: CHANNEL } });
    });
  };
  bind(sessionStore.getState().session);
  const offSession = sessionStore.subscribe((s, p) => s.session !== p.session && bind(s.session));
  return () => {
    offSession();
    off?.();
  };
}
