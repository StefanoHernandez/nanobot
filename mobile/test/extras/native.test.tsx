jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => {}),
  requestPermissionsAsync: jest.fn(async () => ({})),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 77 },
}));
jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));
jest.mock("expo-screen-capture", () => ({ preventScreenCaptureAsync: jest.fn(), allowScreenCaptureAsync: jest.fn() }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

import React from "react";
import { Keyboard, Pressable, Text } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import * as LA from "expo-local-authentication";
import { chatPath, keyOfResponse, setupNotifications, startTurnNotifications } from "../../src/extras/notifications";
import { handleShare, type ShareDeps } from "../../src/extras/share";
import { LockGate, isRelockDue, lockSettings, lockStore } from "../../src/extras/lock";
import { chatsStore } from "../../src/state/chatsStore";
import { threadStore } from "../../src/state/threadStore";
import { fakeSession } from "../state/fake";
import { sessionStore } from "../../src/state/sessionStore";
import { kv } from "../../src/platform/storage";

const sched = Notifications.scheduleNotificationAsync as jest.Mock;

describe("notifications wiring", () => {
  beforeEach(() => {
    sched.mockClear();
    threadStore.setState({ threads: {} });
  });
  const wire = (pending: Record<string, Record<string, unknown>[]> = {}) => {
    const f = fakeSession({}, pending);
    sessionStore.setState({ session: f.session });
    chatsStore.setState({ chats: [{ key: "websocket:a", title: "Titolo" }, { key: "websocket:b", title: "" }] as never });
    return { f, stop: startTurnNotifications(() => false) };
  };
  it("notifies once per ended run with key, title and last reply; no attach for listed chats", () => {
    const { f, stop } = wire();
    expect(f.attached).toEqual([]);
    threadStore.setState({ threads: { "websocket:a": { messages: [{ role: "assistant", content: "ciao" }] } as never } });
    f.runStatus("a", 5);
    f.runStatus("a", null);
    f.runStatus("a", null);
    f.runStatus("b", 7);
    f.runStatus("b", null);
    expect(sched).toHaveBeenCalledTimes(2);
    expect(sched.mock.calls[0][0].content).toEqual({ title: "Titolo", body: "ciao", data: { key: "websocket:a" } });
    expect(sched.mock.calls[1][0].content.title).toBe("nanobot");
    expect(sched.mock.calls[1][0].content.body).toBeTruthy();
    stop();
  });
  it("silent in foreground and after local stop", () => {
    const { f, stop } = wire();
    stop();
    const off = startTurnNotifications(() => true);
    f.runStatus("a", 1);
    f.runStatus("a", null);
    off();
    startTurnNotifications(() => false);
    threadStore.setState({ threads: { "websocket:b": { messages: [], stopped: true } as never } });
    f.runStatus("b", 1);
    f.runStatus("b", null);
    expect(sched).not.toHaveBeenCalled();
  });
  it("does not steal buffered events from threadStore.load", async () => {
    const { f, stop } = wire({ a: [{ event: "message", text: "pending hello" }] });
    expect(f.attached).toEqual([]);
    await threadStore.getState().load(f.session, "websocket:a");
    expect(threadStore.getState().threads["websocket:a"].messages.map((m) => m.content)).toContain("pending hello");
    stop();
  });
  it("creates channel and asks permission once", async () => {
    await setupNotifications();
    await setupNotifications();
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith("turns", expect.objectContaining({ name: expect.any(String), lockscreenVisibility: 77 }));
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });
  it("tap path", () => {
    expect(chatPath("websocket:a b")).toBe("/chat/websocket%3Aa%20b");
    expect(keyOfResponse({ notification: { request: { content: { data: { key: "k" } } } } } as never)).toBe("k");
  });
});

describe("share", () => {
  const mk = (over: Partial<ShareDeps> = {}) => {
    const calls: string[] = [];
    const d: ShareDeps = {
      hasProfile: () => true,
      newChat: async () => (calls.push("new"), "websocket:n"),
      navigate: (p) => void calls.push(`nav:${p}`),
      setDraft: (k, t) => void calls.push(`draft:${k}:${t}`),
      setPendingFiles: (k, f) => void calls.push(`files:${k}:${f.map((x) => `${x.name}|${x.mime}|${x.uri}`).join(",")}`),
      toast: (m) => void calls.push(`toast:${m}`),
      ...over,
    };
    return { d, calls };
  };
  it("text -> newChat, navigate, setDraft in order", async () => {
    const { d, calls } = mk();
    await handleShare({ type: "text", text: "hello" }, d);
    expect(calls).toEqual(["new", "nav:/chat/websocket%3An", "draft:websocket:n:hello"]);
  });
  it("weburl is shared as text", async () => {
    const { d, calls } = mk();
    await handleShare({ type: "weburl", text: "see https://x.dev" }, d);
    expect(calls[2]).toBe("draft:websocket:n:see https://x.dev");
  });
  it("shared image -> new chat, pendingFiles set, nothing sent", async () => {
    const { d, calls } = mk();
    await handleShare({ type: "file", files: [{ path: "/cache/a.png", mimeType: "image/png", fileName: "a.png", size: 5 }] }, d);
    expect(calls).toEqual(["new", "nav:/chat/websocket%3An", "files:websocket:n:a.png|image/png|file:///cache/a.png"]);
  });
  it("empty file intent toasts, no chat", async () => {
    const { d, calls } = mk();
    await handleShare({ type: "file" }, d);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^toast:/);
  });
  it("no profile -> toast and /connect", async () => {
    const { d, calls } = mk({ hasProfile: () => false });
    await handleShare({ type: "text", text: "x" }, d);
    expect(calls[1]).toBe("nav:/connect");
  });
});

describe("lock", () => {
  it("isRelockDue", () => {
    expect(isRelockDue(0, 300001)).toBe(true);
    expect(isRelockDue(0, 299999)).toBe(false);
    expect(isRelockDue(0, 300000)).toBe(false);
    expect(isRelockDue(null, 1)).toBe(true);
  });
  it("setEnabled checks hardware and enrollment", async () => {
    (LA.hasHardwareAsync as jest.Mock).mockResolvedValueOnce(false);
    expect(await lockSettings.setEnabled(true)).toEqual({ ok: false, reason: "no_hardware" });
    (LA.isEnrolledAsync as jest.Mock).mockResolvedValueOnce(false);
    expect(await lockSettings.setEnabled(true)).toEqual({ ok: false, reason: "not_enrolled" });
    expect(lockSettings.enabled()).toBe(false);
    expect(await lockSettings.setEnabled(true)).toEqual({ ok: true });
    expect(kv.get("lock.enabled")).toBe("1");
    await lockSettings.setEnabled(false);
    expect(kv.get("lock.enabled")).toBeNull();
  });
});

describe("LockGate", () => {
  it("keeps children mounted, inert while locked, interactive after unlock", async () => {
    let mounts = 0;
    const onPress = jest.fn();
    function Child() {
      React.useEffect(() => void mounts++, []);
      return <Pressable onPress={onPress}><Text>child-text</Text></Pressable>;
    }
    // authenticate never resolves, so the overlay stays up until we flip the store.
    (LA.authenticateAsync as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    lockStore.setState({ enabled: true, locked: true });
    await render(<LockGate><Child /></LockGate>);
    expect(screen.getByText(/Unlock|Sblocca/)).toBeTruthy();
    expect(screen.queryByText("child-text")).toBeNull(); // hidden from accessibility
    fireEvent.press(screen.getByText("child-text", { includeHiddenElements: true }));
    expect(onPress).not.toHaveBeenCalled();
    await act(async () => lockStore.setState({ locked: false }));
    expect(screen.queryByText(/Unlock|Sblocca/)).toBeNull();
    fireEvent.press(screen.getByText("child-text"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mounts).toBe(1);
  });

  it("dismisses the keyboard when the lock engages", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    (LA.authenticateAsync as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    lockStore.setState({ enabled: true, locked: false });
    await render(<LockGate><Text>x</Text></LockGate>);
    expect(dismiss).not.toHaveBeenCalled();
    await act(async () => lockStore.setState({ locked: true }));
    expect(dismiss).toHaveBeenCalled();
  });
});
