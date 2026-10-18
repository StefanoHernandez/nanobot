import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { i18n } from "../i18n";
import { kv } from "../platform/storage";
import { prefs } from "../settings/prefs";
import { chatsStore } from "../state/chatsStore";
import { threadStore } from "../state/threadStore";
import { sessionStore } from "../state/sessionStore";
import { toast } from "../ui/components";
import type { NanobotSession } from "../core/session";
import { getCurrentChatKey, setCurrentChatKey } from "./currentChat";

export { getCurrentChatKey, setCurrentChatKey };

export const CHANNEL = "turns";
const ASKED = "notif.asked";

function normalizeKey(chatId: string): string | null {
  if (chatId.startsWith("websocket:")) return chatId;
  if (chatId.includes(":")) return null;
  return `websocket:${chatId}`;
}

function normalizeChatId(idOrKey: string): string {
  return idOrKey.startsWith("websocket:") ? idOrKey.slice("websocket:".length) : idOrKey;
}

function deliverTurnNotification(
  key: string,
  title: string,
  body: string,
  isForeground: () => boolean,
): void {
  if (isForeground()) {
    if (getCurrentChatKey() === key) return;
    toast.show(i18n.t("extras.newReplyIn", { title }), {
      action: {
        label: i18n.t("extras.openChat"),
        onPress: () => {
          router.push(chatPath(key) as never);
        },
      },
    });
    return;
  }
  void Notifications.scheduleNotificationAsync({
    content: { title, body, data: { key } },
    trigger: { channelId: CHANNEL },
  });
}

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

/** Maps notification payload data to an in-app route. */
export function notificationTapPath(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  const key = data.key;
  if (typeof key === "string" && key) return chatPath(key);
  const kanbanTask = data.kanbanTask;
  const board = data.board;
  if (typeof kanbanTask === "string" && kanbanTask && typeof board === "string" && board) {
    return `/ecosystem/kanban?task=${encodeURIComponent(kanbanTask)}&board=${encodeURIComponent(board)}`;
  }
  return null;
}

/** Key carried by a tapped notification, if it is ours. */
export function keyOfResponse(r: Notifications.NotificationResponse | null | undefined): string | null {
  const k = r?.notification.request.content.data?.key;
  return typeof k === "string" ? k : null;
}

/** Route for a tapped notification (chat or kanban). */
export function pathOfResponse(r: Notifications.NotificationResponse | null | undefined): string | null {
  const data = r?.notification.request.content.data;
  if (data && typeof data === "object") {
    const fromData = notificationTapPath(data as Record<string, unknown>);
    if (fromData) return fromData;
  }
  const key = keyOfResponse(r);
  return key ? chatPath(key) : null;
}

/**
 * Global turn notification hooks:
 * - onRunStatus: handles tracked chats (running -> null transition).
 * - onSessionUpdate: handles untracked chats (e.g. automations/cron jobs) when scope === "thread".
 * In the foreground, shows an in-app toast unless the user is already on that chat's screen.
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
    const lastHandled = new Map<string, number>();
    const unsubs: (() => void)[] = [];

    unsubs.push(
      session.client.onRunStatus((rawChatId, startedAt) => {
        const chatId = normalizeChatId(rawChatId);
        if (startedAt !== null) {
          running.set(chatId, startedAt);
          return;
        }
        const at = running.get(chatId);
        running.delete(chatId);
        if (at === undefined || done.has(`${chatId}:${at}`)) return;
        done.add(`${chatId}:${at}`);
        const key = normalizeKey(rawChatId);
        if (!key) return;
        if (chatsStore.getState().isTemporary(key)) return;
        const th = threadStore.getState().threads[key];
        if (th?.stopped) return;
        lastHandled.set(chatId, Date.now());
        const last = [...(th?.messages ?? [])].reverse().find((m) => m.role === "assistant" && m.content?.trim());
        const body = last?.content.trim().slice(0, 120) || i18n.t("extras.replyReady");
        const title = chatsStore.getState().chats.find((c) => c.key === key)?.title || "nanobot";
        deliverTurnNotification(key, title, body, isForeground);
      }),
    );

    unsubs.push(
      session.client.onSessionUpdate(async (rawChatId, scope) => {
        if (scope !== "thread") return;
        const key = normalizeKey(rawChatId);
        if (!key) return;
        if (chatsStore.getState().isTemporary(key)) return;
        const th = threadStore.getState().threads[key];
        if (th?.stopped) return;
        const chatId = normalizeChatId(rawChatId);
        if (running.has(chatId)) return;
        const now = Date.now();
        const last = lastHandled.get(chatId);
        if (last !== undefined && now - last < 5000) return;
        lastHandled.set(chatId, now);

        await chatsStore.getState().refresh().catch(() => {});
        const chat = chatsStore.getState().chats.find((c) => c.key === key);
        const title = chat?.title || "nanobot";
        const body = chat?.preview?.trim().slice(0, 120) || i18n.t("extras.replyReady");
        deliverTurnNotification(key, title, body, isForeground);
      }),
    );

    off = () => unsubs.forEach((u) => u());
  };
  bind(sessionStore.getState().session);
  const offSession = sessionStore.subscribe((s, p) => s.session !== p.session && bind(s.session));
  return () => {
    offSession();
    off?.();
  };
}
