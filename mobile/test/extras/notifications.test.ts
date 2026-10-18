import * as Notifications from "expo-notifications";
import { toast } from "../../src/ui/components/Toast";
import { router } from "expo-router";
import { chatsStore } from "../../src/state/chatsStore";
import { threadStore } from "../../src/state/threadStore";
import { sessionStore } from "../../src/state/sessionStore";
import { i18n } from "../../src/i18n";
import { CHANNEL, startTurnNotifications } from "../../src/extras/notifications";
import { getCurrentChatKey, setCurrentChatKey } from "../../src/extras/currentChat";
import { fakeSession } from "../state/fake";

jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => {}),
  requestPermissionsAsync: jest.fn(async () => ({})),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 77 },
}));

jest.mock("../../src/ui/components/Toast", () => {
  const actual = jest.requireActual("../../src/ui/components/Toast");
  return {
    ...actual,
    toast: {
      show: jest.fn(),
      setLift: jest.fn(),
    },
  };
});

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
  },
}));

const sched = Notifications.scheduleNotificationAsync as jest.Mock;

const flushAsync = () => new Promise<void>((r) => setTimeout(r, 0));

beforeAll(async () => {
  await i18n.changeLanguage("it");
});

describe("NT-C: notifications on session_updated and foreground handling", () => {
  let fake: ReturnType<typeof fakeSession>;
  let cleanupNotifications: (() => void) | null = null;
  let sessionUpdateHandlers: ((chatId: string, scope?: string, ws?: unknown) => void)[] = [];

  const emitSessionUpdate = async (chatId: string, scope?: string, ws?: unknown) => {
    for (const h of sessionUpdateHandlers) {
      await h(chatId, scope, ws);
    }
    await flushAsync();
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sessionUpdateHandlers = [];
    setCurrentChatKey(null);
    chatsStore.setState({ chats: [], overrides: {}, loading: false });
    threadStore.setState({ threads: {} });

    fake = fakeSession();
    jest.spyOn(fake.client, "onSessionUpdate").mockImplementation((h: any) => {
      sessionUpdateHandlers.push(h);
      return () => {
        sessionUpdateHandlers = sessionUpdateHandlers.filter((x) => x !== h);
      };
    });

    sessionStore.setState({
      session: fake.session,
      state: "open" as never,
      profile: { id: "p1", baseUrl: "http://h", name: "nanobot" } as never,
    });
  });

  afterEach(() => {
    cleanupNotifications?.();
    cleanupNotifications = null;
    jest.restoreAllMocks();
  });

  test("session_updated scope thread for an untracked chat, app in background -> one system notification with the chat title, the preview and data.key", async () => {
    cleanupNotifications = startTurnNotifications(() => false);

    jest.spyOn(chatsStore.getState(), "refresh").mockImplementation(async () => {
      chatsStore.setState({
        chats: [
          {
            key: "websocket:c1",
            channel: "websocket",
            chatId: "c1",
            createdAt: "",
            updatedAt: "",
            title: "Mio Cron",
            preview: "Risposta dell'automazione",
          },
        ],
      });
    });

    await emitSessionUpdate("c1", "thread");

    expect(sched).toHaveBeenCalledTimes(1);
    expect(sched).toHaveBeenCalledWith({
      content: {
        title: "Mio Cron",
        body: "Risposta dell'automazione",
        data: { key: "websocket:c1" },
      },
      trigger: { channelId: CHANNEL },
    });
    expect(toast.show).not.toHaveBeenCalled();
  });

  test("scope metadata -> nothing", async () => {
    cleanupNotifications = startTurnNotifications(() => false);

    chatsStore.setState({
      chats: [
        {
          key: "websocket:c1",
          channel: "websocket",
          chatId: "c1",
          createdAt: "",
          updatedAt: "",
          title: "Mio Cron",
          preview: "Risposta dell'automazione",
        },
      ],
    });

    await emitSessionUpdate("c1", "metadata");

    expect(sched).not.toHaveBeenCalled();
    expect(toast.show).not.toHaveBeenCalled();
  });

  test("a tracked turn (run status running -> null) followed by its session_updated -> exactly one notification", async () => {
    cleanupNotifications = startTurnNotifications(() => false);

    chatsStore.setState({
      chats: [
        {
          key: "websocket:c1",
          channel: "websocket",
          chatId: "c1",
          createdAt: "",
          updatedAt: "",
          title: "Chat Tracciata",
          preview: "Risposta tracciata",
        },
      ],
    });

    threadStore.setState({
      threads: {
        "websocket:c1": {
          messages: [{ role: "assistant", content: "Risposta tracciata" }] as never,
        } as never,
      },
    });

    // Run status: running -> null
    fake.runStatus("c1", 1000);
    fake.runStatus("c1", null);

    expect(sched).toHaveBeenCalledTimes(1);

    // Followed by session_updated for the same turn
    await emitSessionUpdate("c1", "thread");

    // Still exactly one notification
    expect(sched).toHaveBeenCalledTimes(1);
  });

  test("two session_updated for the same chat within 5 s -> one notification", async () => {
    cleanupNotifications = startTurnNotifications(() => false);

    chatsStore.setState({
      chats: [
        {
          key: "websocket:c1",
          channel: "websocket",
          chatId: "c1",
          createdAt: "",
          updatedAt: "",
          title: "Mio Cron",
          preview: "Risposta rapida",
        },
      ],
    });
    jest.spyOn(chatsStore.getState(), "refresh").mockResolvedValue();

    await emitSessionUpdate("c1", "thread");
    await emitSessionUpdate("c1", "thread");

    expect(sched).toHaveBeenCalledTimes(1);
  });

  test("foreground on the same chat -> nothing; foreground on another chat -> toast, no system notification", async () => {
    // App in foreground
    cleanupNotifications = startTurnNotifications(() => true);

    chatsStore.setState({
      chats: [
        {
          key: "websocket:c1",
          channel: "websocket",
          chatId: "c1",
          createdAt: "",
          updatedAt: "",
          title: "Chat 1",
          preview: "Messaggio 1",
        },
      ],
    });
    jest.spyOn(chatsStore.getState(), "refresh").mockResolvedValue();

    // 1. On the same chat: nothing
    setCurrentChatKey("websocket:c1");
    expect(getCurrentChatKey()).toBe("websocket:c1");

    await emitSessionUpdate("c1", "thread");
    expect(sched).not.toHaveBeenCalled();
    expect(toast.show).not.toHaveBeenCalled();

    // 2. On another chat: toast with title and action, no system notification
    setCurrentChatKey("websocket:c2");
    expect(getCurrentChatKey()).toBe("websocket:c2");

    // Run status on tracked chat c1 while on c2
    threadStore.setState({
      threads: {
        "websocket:c1": {
          messages: [{ role: "assistant", content: "Messaggio 1" }] as never,
        } as never,
      },
    });

    fake.runStatus("c1", 2000);
    fake.runStatus("c1", null);

    expect(sched).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledWith(
      expect.stringContaining("Chat 1"),
      expect.objectContaining({
        action: expect.objectContaining({
          onPress: expect.any(Function),
        }),
      }),
    );

    // Tapping the toast action opens the chat
    const toastCall = (toast.show as jest.Mock).mock.calls[0];
    toastCall[1].action.onPress();
    expect(router.push).toHaveBeenCalledWith("/chat/websocket%3Ac1");
  });

  test("dream:… / temporary chat -> nothing", async () => {
    cleanupNotifications = startTurnNotifications(() => false);

    // Non-websocket key (dream:...)
    await emitSessionUpdate("dream:123", "thread");
    expect(sched).not.toHaveBeenCalled();

    // Temporary chat
    jest.spyOn(chatsStore.getState(), "isTemporary").mockImplementation((k) => k === "websocket:temp1");
    await emitSessionUpdate("temp1", "thread");
    expect(sched).not.toHaveBeenCalled();

    // Stopped chat
    threadStore.setState({
      threads: {
        "websocket:stopped1": { stopped: true } as never,
      },
    });
    await emitSessionUpdate("stopped1", "thread");
    expect(sched).not.toHaveBeenCalled();
  });
});
