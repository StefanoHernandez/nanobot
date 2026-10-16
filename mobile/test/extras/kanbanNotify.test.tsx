import React from "react";
import { act, renderHook } from "@testing-library/react-native";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { i18n } from "../../src/i18n";
import { sessionStore } from "../../src/state/sessionStore";
import { kv } from "../../src/platform/storage";
import { prefs } from "../../src/settings/prefs";
import { toast } from "../../src/ui/components";
import { fakeSession } from "../state/fake";
import { notificationTapPath } from "../../src/extras/notifications";
import { fetchKanbanEvents } from "../../src/ecosystem/kanban";
import {
  pollKanbanNotifications,
  resetKanbanNotifyState,
  setOnKanbanScreen,
  useKanbanNotifications,
} from "../../src/extras/kanbanNotify";

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
    },
  };
});

const sched = Notifications.scheduleNotificationAsync as jest.Mock;

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("NT-A: kanban notifications", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    resetKanbanNotifyState();
    sessionStore.setState({
      session: null,
      state: "open" as never,
      profile: { id: "p1", baseUrl: "http://h", name: "nanobot" } as never,
    });
    for (const key of kv.keys()) {
      if (key.startsWith("kanban.since.")) kv.del(key);
    }
    prefs.setKanbanNotifications(true);
    setOnKanbanScreen(false);
    Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
    Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("first poll stores the cursor and notifies nothing", async () => {
    const f = fakeSession();
    f.get.mockResolvedValue({
      now: 5000,
      events: [{ key: "run:1", kind: "done", task_id: "t1", board_id: "main", title: "Ship" }],
    });
    sessionStore.setState({ session: f.session });

    await pollKanbanNotifications();

    expect(kv.get("kanban.since.p1")).toBe("5000");
    expect(sched).not.toHaveBeenCalled();
    expect(toast.show).not.toHaveBeenCalled();
  });

  test("next poll notifies only new keys", async () => {
    kv.set("kanban.since.p1", "1000");
    const f = fakeSession();
    f.get.mockResolvedValue({
      now: 6000,
      events: [
        { key: "run:1", kind: "done", task_id: "t1", board_id: "main", title: "First" },
        { key: "run:2", kind: "failed", task_id: "t2", board_id: "main", title: "Second" },
      ],
    });
    sessionStore.setState({ session: f.session });

    await pollKanbanNotifications();

    expect(kv.get("kanban.since.p1")).toBe("6000");
    expect(sched).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledTimes(2);
  });

  test("the same key twice notifies once", async () => {
    kv.set("kanban.since.p1", "1000");
    const f = fakeSession();
    f.get.mockResolvedValue({
      now: 7000,
      events: [{ key: "run:dup", kind: "done", task_id: "t1", board_id: "main", title: "Once" }],
    });
    sessionStore.setState({ session: f.session });

    await pollKanbanNotifications();
    await pollKanbanNotifications();

    expect(toast.show).toHaveBeenCalledTimes(1);
  });

  test("pref off: nothing polls (fetch not called)", async () => {
    prefs.setKanbanNotifications(false);
    const getMock = jest.fn();
    const f = fakeSession();
    f.session.get = getMock as never;
    sessionStore.setState({ session: f.session });

    await renderHook(() => useKanbanNotifications());
    await act(async () => {
      await pollKanbanNotifications();
    });

    expect(getMock).not.toHaveBeenCalled();
  });

  test("background schedules a notification and does not toast", async () => {
    kv.set("kanban.since.p1", "1");
    Object.defineProperty(AppState, "currentState", { configurable: true, value: "background" });
    const f = fakeSession();
    f.get.mockResolvedValue({
      now: 8000,
      events: [{ key: "run:bg", kind: "blocked", task_id: "t1", board_id: "main", title: "Stuck" }],
    });
    sessionStore.setState({ session: f.session });

    await pollKanbanNotifications();

    expect(sched).toHaveBeenCalledTimes(1);
    expect(sched.mock.calls[0][0].content.data).toEqual({ kanbanTask: "t1", board: "main" });
    expect(toast.show).not.toHaveBeenCalled();
  });

  test("kanban screen in front does not toast", async () => {
    kv.set("kanban.since.p1", "1");
    setOnKanbanScreen(true);
    const f = fakeSession();
    f.get.mockResolvedValue({
      now: 8000,
      events: [{ key: "run:front", kind: "done", task_id: "t1", board_id: "main", title: "Here" }],
    });
    sessionStore.setState({ session: f.session });

    await pollKanbanNotifications();

    expect(toast.show).not.toHaveBeenCalled();
    expect(sched).not.toHaveBeenCalled();
  });

  test("turning the pref back on polls again", async () => {
    prefs.setKanbanNotifications(false);
    const f = fakeSession();
    f.get.mockResolvedValue({ now: 1, events: [] });
    sessionStore.setState({ session: f.session });
    await renderHook(() => useKanbanNotifications());
    expect(f.get).not.toHaveBeenCalled();

    await act(async () => {
      prefs.setKanbanNotifications(true);
    });

    expect(f.get).toHaveBeenCalled();
  });

  test("foreground: toast, not scheduleNotificationAsync", async () => {
    kv.set("kanban.since.p1", "1");
    Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
    const f = fakeSession();
    f.get.mockResolvedValue({
      now: 8000,
      events: [{ key: "run:fg", kind: "review", task_id: "t1", board_id: "main", title: "Review me" }],
    });
    sessionStore.setState({ session: f.session });

    await pollKanbanNotifications();

    expect(toast.show).toHaveBeenCalled();
    expect(sched).not.toHaveBeenCalled();
  });

  test("cursor is per profile", async () => {
    const f = fakeSession();
    f.get.mockResolvedValue({ now: 9000, events: [] });
    sessionStore.setState({ session: f.session, profile: { id: "alpha", baseUrl: "http://h", name: "a" } as never });
    await pollKanbanNotifications();
    sessionStore.setState({ profile: { id: "beta", baseUrl: "http://h", name: "b" } as never });
    resetKanbanNotifyState();
    await pollKanbanNotifications();

    expect(kv.get("kanban.since.alpha")).toBe("9000");
    expect(kv.get("kanban.since.beta")).toBe("9000");
  });

  test("tap helper: chat path and kanban path", () => {
    expect(notificationTapPath({ key: "websocket:c1" })).toBe("/chat/websocket%3Ac1");
    expect(notificationTapPath({ kanbanTask: "t9", board: "main" })).toBe(
      "/ecosystem/kanban?task=t9&board=main",
    );
  });

  test("fetchKanbanEvents drops bad rows", async () => {
    const f = fakeSession();
    f.session.get = jest.fn(async () => ({
      now: 1,
      events: [
        { key: "run:1", kind: "done", task_id: "t1", board_id: "main", title: "Ok" },
        { key: "bad", kind: "weird", task_id: "t2", board_id: "main", title: "Nope" },
        null,
      ],
    })) as never;

    const data = await fetchKanbanEvents(f.session, 0);
    expect(data.events).toHaveLength(1);
    expect(data.events[0]?.kind).toBe("done");
  });
});
