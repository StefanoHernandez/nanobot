import "../../src/platform/install";
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { toast, ToastHost } from "../../src/ui/components";
import { i18n } from "../../src/i18n";
import { MessageList } from "../../src/screens/thread/MessageList";
import { Composer } from "../../src/screens/thread/Composer";
import { chatsStore } from "../../src/state/chatsStore";
import { threadStore } from "../../src/state/threadStore";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => true),
}));

jest.mock("../../src/ui/markdown/Markdown", () => {
  const { Text } = require("react-native");
  return { Markdown: ({ text }: { text: string }) => <Text>{text}</Text> };
});

const KEY = "websocket:chat-1";

const wrap = async (el: React.ReactElement) =>
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        {el}
        <ToastHost />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

const usr = (id: string, content = `U-${id}`, extra: Record<string, unknown> = {}) => ({
  id,
  role: "user" as const,
  content,
  createdAt: 1,
  ...extra,
});

const asst = (id: string, content = `A-${id}`, extra: Record<string, unknown> = {}) => ({
  id,
  role: "assistant" as const,
  content,
  createdAt: 2,
  ...extra,
});

const settle = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const longPress = async (msgs: unknown[], text: string, running = false) => {
  await wrap(<MessageList chatKey={KEY} messages={msgs as never} running={running} notices={[]} forkBoundary={null} />);
  await settle();
  fireEvent(await screen.findByText(text), "longPress");
};

const forkMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  forkMock.mockReset().mockResolvedValue("websocket:forked-chat-1");
  chatsStore.setState({
    fork: forkMock,
    chats: [{ key: KEY, title: "Chat Originale", preview: "hello" }],
    isTemporary: (k: string) => k === "websocket:temp-1",
  } as never);
  threadStore.setState({
    threads: {
      [KEY]: {
        messages: [],
        running: false,
        model: null,
        preset: null,
        notices: [],
        draft: "",
        loaded: true,
        stopped: false,
        sendError: null,
        uploading: false,
        pendingFiles: [],
        forkBoundary: null,
        temporary: false,
        hasMoreBefore: false,
      },
    },
  });
});

describe("ED-A: edit a message you already sent", () => {
  test("long-press menu on a user message shows Modifica and Copy, but not Fork", async () => {
    const msgs = [usr("u1", "Primo messaggio utente"), asst("a1", "Risposta bot")];
    await longPress(msgs, "Primo messaggio utente");

    expect(await screen.findByText("Modifica")).toBeTruthy();
    expect(screen.getByText("Copy")).toBeTruthy();
    expect(screen.queryByText("Fork from here")).toBeNull();
  });

  test("long-press menu on an assistant message shows Copy and Fork, but not Modifica", async () => {
    const msgs = [usr("u1", "Primo messaggio utente"), asst("a1", "Risposta bot")];
    await longPress(msgs, "Risposta bot");

    expect(await screen.findByText("Fork from here")).toBeTruthy();
    expect(screen.getByText("Copy")).toBeTruthy();
    expect(screen.queryByText("Modifica")).toBeNull();
  });

  test("Modifica is disabled when the bot is running", async () => {
    const msgs = [usr("u1", "Messaggio mentre gira"), asst("a1", "In corso...")];
    await longPress(msgs, "Messaggio mentre gira", true);

    const editItem = await screen.findByText("Modifica");
    expect(editItem).toBeTruthy();
    expect(screen.getByText("Unavailable while responding")).toBeTruthy();

    fireEvent.press(editItem);
    expect(forkMock).not.toHaveBeenCalled();
  });

  test("temporary chat hides Modifica", async () => {
    const tempKey = "websocket:temp-1";
    const msgs = [usr("u1", "Messaggio temporaneo")];
    await wrap(<MessageList chatKey={tempKey} messages={msgs as never} running={false} notices={[]} forkBoundary={null} />);
    await settle();
    fireEvent(await screen.findByText("Messaggio temporaneo"), "longPress");

    expect(await screen.findByText("Copy")).toBeTruthy();
    expect(screen.queryByText("Modifica")).toBeNull();
  });

  test("Modifica calls forkChat with the right before_user_index, appends (modificata) to title, navigates, and prefills composer", async () => {
    const msgs = [
      usr("u1", "Primo prompt"),
      asst("a1", "Prima risposta"),
      usr("u2", "Secondo prompt da modificare"),
      asst("a2", "Seconda risposta"),
    ];
    await longPress(msgs, "Secondo prompt da modificare");

    fireEvent.press(await screen.findByText("Modifica"));

    await waitFor(() => {
      expect(forkMock).toHaveBeenCalledWith(KEY, 1, "Chat Originale (modificata)");
    });

    expect(router.push).toHaveBeenCalledWith("/chat/" + encodeURIComponent("websocket:forked-chat-1"));

    expect(threadStore.getState().threads["websocket:forked-chat-1"]?.draft).toBe("Secondo prompt da modificare");

    await wrap(<Composer chatKey="websocket:forked-chat-1" />);
    await settle();
    expect(screen.getByDisplayValue("Secondo prompt da modificare")).toBeTruthy();
  });

  test("Modifica for first user message calls fork with before_user_index 0", async () => {
    const msgs = [
      usr("u1", "Primo prompt da modificare"),
      asst("a1", "Prima risposta"),
      usr("u2", "Secondo prompt"),
    ];
    await longPress(msgs, "Primo prompt da modificare");

    fireEvent.press(await screen.findByText("Modifica"));

    await waitFor(() => {
      expect(forkMock).toHaveBeenCalledWith(KEY, 0, "Chat Originale (modificata)");
    });
  });

  test("a message with attachments shows toast 'Gli allegati vanno riaggiunti'", async () => {
    const toastSpy = jest.spyOn(toast, "show");
    const msgs = [
      usr("u1", "Messaggio con foto", {
        media: [{ kind: "image", url: "https://example.com/img.png", name: "img.png" }],
      }),
    ];
    await longPress(msgs, "Messaggio con foto");

    fireEvent.press(await screen.findByText("Modifica"));

    await waitFor(() => {
      expect(forkMock).toHaveBeenCalled();
    });

    expect(toastSpy).toHaveBeenCalledWith("Gli allegati vanno riaggiunti");
    toastSpy.mockRestore();
  });

  test("fork error shows common.error and leaves composer untouched", async () => {
    const toastSpy = jest.spyOn(toast, "show");
    forkMock.mockRejectedValueOnce(new Error("Network failed"));

    const msgs = [usr("u1", "Messaggio che fallisce")];
    await longPress(msgs, "Messaggio che fallisce");

    fireEvent.press(await screen.findByText("Modifica"));

    await waitFor(() => {
      expect(forkMock).toHaveBeenCalled();
    });

    expect(toastSpy).toHaveBeenCalledWith(i18n.t("common.error"));
    expect(router.push).not.toHaveBeenCalled();
    expect(threadStore.getState().threads["websocket:forked-chat-1"]?.draft).toBeUndefined();

    toastSpy.mockRestore();
  });

  test("loads older pages before computing before_user_index when hasMoreBefore is true", async () => {
    const msgs = [
      usr("u2", "Messaggio pagina 2"),
      asst("a2", "Risposta 2"),
    ];

    const loadOlderMock = jest.fn(async () => {
      threadStore.setState((s) => ({
        threads: {
          ...s.threads,
          [KEY]: {
            ...s.threads[KEY],
            hasMoreBefore: false,
            messages: [
              usr("u0", "Messaggio vecchio 0"),
              asst("a0", "Risposta 0"),
              usr("u1", "Messaggio vecchio 1"),
              asst("a1", "Risposta 1"),
              ...msgs,
            ],
          },
        },
      }));
    });

    threadStore.setState((s) => ({
      ...s,
      loadOlder: loadOlderMock,
      threads: {
        ...s.threads,
        [KEY]: {
          ...s.threads[KEY],
          hasMoreBefore: true,
          beforeCursor: "c-1",
          messages: msgs,
        },
      },
    }));

    await longPress(msgs, "Messaggio pagina 2");
    fireEvent.press(await screen.findByText("Modifica"));

    await waitFor(() => {
      expect(loadOlderMock).toHaveBeenCalled();
      expect(forkMock).toHaveBeenCalledWith(KEY, 2, "Chat Originale (modificata)");
    });
  });
});
