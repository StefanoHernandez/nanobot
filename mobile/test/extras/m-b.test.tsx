import "../../src/platform/install";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { kv } from "../../src/platform/storage";
import { profiles } from "../../src/core/profiles";
import { sessionStore } from "../../src/state/sessionStore";
import { chatsStore } from "../../src/state/chatsStore";
import { toast } from "../../src/ui/components";
import { outboxStore, pendingByChat } from "../../src/extras/outbox";
import { ChatRow } from "../../src/screens/chats/ChatRow";
import { ChatDrawer } from "../../src/screens/chats/ChatDrawer";
import NewChatScreen from "../../app/new-chat";
import { handleShare, shareStore, type ShareDeps } from "../../src/extras/share";

jest.mock("expo-router", () => ({
  router: {
    replace: jest.fn(),
    navigate: jest.fn(),
    push: jest.fn(),
  },
  usePathname: jest.fn(() => "/"),
}));

jest.mock("../../src/ui/components/Toast", () => ({
  toast: { show: jest.fn() },
  ToastContainer: () => null,
}));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of kv.keys()) {
    kv.del(k);
  }
  outboxStore.setState({ activeProfileId: null, queues: {} });
  shareStore.getState().clear();
  sessionStore.setState({ session: null, state: "none", profile: null });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("M-B: Outbox pending in other chats", () => {
  test("pendingByChat counts per chat for active profile", () => {
    outboxStore.setState({
      activeProfileId: "p1",
      queues: {
        c1: [
          { id: "1", text: "msg 1", createdAt: 1 },
          { id: "2", text: "msg 2", createdAt: 2 },
        ],
        c2: [{ id: "3", text: "msg 3", createdAt: 3 }],
        c3: [],
      },
    });

    const counts = pendingByChat(outboxStore.getState());
    expect(counts).toEqual({ c1: 2, c2: 1 });

    // When no active profile, returns empty record
    outboxStore.setState({ activeProfileId: null });
    expect(pendingByChat(outboxStore.getState())).toEqual({});
  });

  test("a ChatRow with 2 queued messages shows the pendingCount pill", async () => {
    outboxStore.setState({
      activeProfileId: "p1",
      queues: {
        "websocket:c1": [
          { id: "1", text: "msg 1", createdAt: 1 },
          { id: "2", text: "msg 2", createdAt: 2 },
        ],
      },
    });

    await render(
      <ThemeProvider>
        <ChatRow
          chat={{ key: "websocket:c1", title: "Test Chat", preview: "prev" } as any}
          active={false}
          onPress={jest.fn()}
          onLongPress={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("2 queued")).toBeTruthy();
  });

  test("the drawer line appears only for chats other than the open one and tapping opens first such chat", async () => {
    (usePathname as jest.Mock).mockReturnValue("/chat/websocket%3Ac1");

    chatsStore.setState({
      chats: [
        { key: "websocket:c1", title: "Chat 1", preview: "p1", updatedAt: null } as any,
        { key: "websocket:c2", title: "Chat 2", preview: "p2", updatedAt: null } as any,
        { key: "websocket:c3", title: "Chat 3", preview: "p3", updatedAt: null } as any,
      ],
    });

    // Only c1 has queued messages (c1 is open) -> no drawer line
    outboxStore.setState({
      activeProfileId: "p1",
      queues: {
        "websocket:c1": [{ id: "1", text: "msg 1", createdAt: 1 }],
      },
    });

    const onClose = jest.fn();
    const { rerender } = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <ChatDrawer onClose={onClose} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    expect(screen.queryByText(/Queued messages/i)).toBeNull();

    // Now c2 also has a queued message -> drawer line appears
    await act(async () => {
      outboxStore.setState({
        activeProfileId: "p1",
        queues: {
          "websocket:c1": [{ id: "1", text: "msg 1", createdAt: 1 }],
          "websocket:c2": [{ id: "2", text: "msg 2", createdAt: 2 }],
        },
      });
    });

    expect(screen.getByText("Queued messages in 1 chat")).toBeTruthy();

    // Tapping it navigates to the first such chat (c2) and closes the drawer
    fireEvent.press(screen.getByText("Queued messages in 1 chat"));
    expect(router.navigate).toHaveBeenCalledWith("/chat/websocket%3Ac2");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("M-B: Widget/tile new chat while offline", () => {
  test("mounted with state reconnecting, then switched to open -> newChat is called once", async () => {
    kv.set("profiles.active", "p1");
    sessionStore.setState({
      profile: { id: "p1", name: "Home", baseUrl: "https://example.com", hasSecret: true },
      state: "reconnecting",
    });

    const mockNewChat = jest.fn(async () => "websocket:chat-456");
    jest.spyOn(chatsStore.getState(), "newChat").mockImplementation(mockNewChat);

    await render(
      <ThemeProvider>
        <NewChatScreen />
      </ThemeProvider>,
    );

    // Not called while reconnecting
    expect(mockNewChat).not.toHaveBeenCalled();

    // Now session transitions to open
    await act(async () => {
      sessionStore.setState({ state: "open" });
    });

    expect(mockNewChat).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/chat/websocket%3Achat-456");
  });

  test("stays reconnecting for 15 s (fake timers) -> router.replace('/') and toast; newChat is not called", async () => {
    jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
    kv.set("profiles.active", "p1");
    sessionStore.setState({
      profile: { id: "p1", name: "Home", baseUrl: "https://example.com", hasSecret: true },
      state: "reconnecting",
    });

    const mockNewChat = jest.fn(async () => "websocket:chat-456");
    jest.spyOn(chatsStore.getState(), "newChat").mockImplementation(mockNewChat);

    await render(
      <ThemeProvider>
        <NewChatScreen />
      </ThemeProvider>,
    );

    expect(mockNewChat).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();

    // Advance timers by 15s
    await act(async () => {
      jest.advanceTimersByTime(15000);
    });

    expect(mockNewChat).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/");
    expect(toast.show).toHaveBeenCalledWith(expect.stringMatching(/offline|nanobot/i));
  });
});

describe("M-B: Share merging and file size checks", () => {
  test("two shares (text plus file, then text plus another file) -> pending has both texts and both files without uri duplicates", async () => {
    profiles.setActive("p1");
    shareStore.getState().clear();

    await handleShare({
      type: "file",
      text: "first note",
      files: [{ path: "/mock/cache/doc1.pdf", mimeType: "application/pdf", fileName: "doc1.pdf", size: 50 }],
    });

    let pending = shareStore.getState().pending;
    expect(pending?.text).toBe("first note");
    expect(pending?.files).toHaveLength(1);
    expect(pending?.files[0].name).toBe("doc1.pdf");

    // Second share
    await handleShare({
      type: "file",
      text: "second note",
      files: [{ path: "/mock/cache/doc2.pdf", mimeType: "application/pdf", fileName: "doc2.pdf", size: 80 }],
    });

    pending = shareStore.getState().pending;
    expect(pending?.text).toBe("first note\n\nsecond note");
    expect(pending?.files).toHaveLength(2);
    expect(pending?.files.map((f) => f.name)).toEqual(["doc1.pdf", "doc2.pdf"]);

    // Third share with duplicate URI of doc2
    await handleShare({
      type: "file",
      text: "",
      files: [{ path: "/mock/cache/doc2.pdf", mimeType: "application/pdf", fileName: "doc2.pdf", size: 80 }],
    });

    pending = shareStore.getState().pending;
    expect(pending?.text).toBe("first note\n\nsecond note");
    expect(pending?.files).toHaveLength(2);
  });

  test("an oversized file is dropped with the toast", async () => {
    profiles.setActive("p1");
    shareStore.getState().clear();

    const toastCalls: string[] = [];
    const customDeps: ShareDeps = {
      hasProfile: () => true,
      newChat: async () => "websocket:n",
      navigate: jest.fn(),
      setDraft: jest.fn(),
      setPendingFiles: jest.fn(),
      toast: (msg: string) => void toastCalls.push(msg),
      openPicker: (p) => shareStore.setState({ pending: p }),
    };

    // File exceeds 6 MB (e.g. 10 MB = 10 * 1024 * 1024)
    await handleShare(
      {
        type: "file",
        text: "big attachment",
        files: [
          { path: "/mock/cache/giant.zip", mimeType: "application/zip", fileName: "giant.zip", size: 10 * 1024 * 1024 },
          { path: "/mock/cache/valid.txt", mimeType: "text/plain", fileName: "valid.txt", size: 100 },
        ],
      },
      customDeps,
    );

    // Toast was called naming giant.zip, but NOT the URI
    expect(toastCalls.length).toBeGreaterThan(0);
    const sizeToast = toastCalls.find((m) => m.includes("giant.zip"));
    expect(sizeToast).toBeDefined();
    expect(sizeToast).not.toContain("file:///");
    expect(sizeToast).not.toContain("/mock/cache");

    // Only valid.txt is in pending files
    const pending = shareStore.getState().pending;
    expect(pending?.text).toBe("big attachment");
    expect(pending?.files).toHaveLength(1);
    expect(pending?.files[0].name).toBe("valid.txt");
  });
});
