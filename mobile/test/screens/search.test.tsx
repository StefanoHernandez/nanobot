import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { ChatDrawer } from "../../src/screens/chats/ChatDrawer";
import { SearchScreen, HighlightedSnippet } from "../../src/screens/search/SearchScreen";
import * as searchApi from "../../src/ecosystem/search";

jest.mock("expo-router", () => ({
  router: { navigate: jest.fn(), replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  usePathname: () => "/",
  useLocalSearchParams: () => ({ q: "test" }),
}));

const chats = [
  { key: "websocket:a", title: "Alpha", preview: "hello", updatedAt: null },
  { key: "websocket:b", title: "Beta", preview: "world", updatedAt: null },
];

const mockChatsState = {
  chats,
  loading: false,
  refresh: jest.fn(async () => {}),
  newChat: jest.fn(async () => "websocket:new1"),
  newTemporaryChat: jest.fn(async () => "websocket:tmp1"),
  rename: jest.fn(async () => {}),
  remove: jest.fn(async () => {}),
  search: jest.fn((q: string) => chats.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase()))),
};

jest.mock("../../src/state/chatsStore", () => ({
  useChats: (sel?: (s: unknown) => unknown) => (sel ? sel(mockChatsState) : mockChatsState),
  isWritable: () => true,
  chatsStore: {
    getState: () => mockChatsState,
  },
}));

const mockSession = {
  baseUrl: "https://nanobot.local",
  apiToken: () => "token",
  get: jest.fn(),
};

jest.mock("../../src/state/sessionStore", () => ({
  useSession: () => ({
    session: mockSession,
    state: "open",
    profile: { id: "p", name: "User", baseUrl: "https://nanobot.local", hasSecret: false },
  }),
}));

const safeRender = async (ui: React.ReactElement) =>
  await render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

beforeEach(async () => {
  jest.clearAllMocks();
  await i18n.changeLanguage("it");
});

describe("Drawer search row", () => {
  test("drawer row appears with a query and opens search screen", async () => {
    const onClose = jest.fn();
    await safeRender(<ChatDrawer onClose={onClose} />);

    // Initially no query, search row not visible
    expect(screen.queryByText(/Cerca «.*» in tutti i messaggi/)).toBeNull();

    // Type query
    await fireEvent.changeText(screen.getByLabelText("Cerca"), "wireguard");

    // Row should appear
    const searchRow = screen.getByText("Cerca «wireguard» in tutti i messaggi");
    expect(searchRow).toBeTruthy();

    // Tap row
    fireEvent.press(searchRow);
    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/search",
      params: { q: "wireguard" },
    });
  });
});

describe("HighlightedSnippet", () => {
  test("renders matches enclosed in «» with bold highlight", async () => {
    await safeRender(
      <HighlightedSnippet text="Prima del match «parola chiave» dopo il match" />,
    );

    const boldText = screen.getByText("parola chiave");
    expect(boldText).toBeTruthy();
    expect(boldText.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontWeight: "bold" })]),
    );
  });
});

describe("SearchScreen navigation per source", () => {
  test("navigates to chat, journal, and kanban per source", async () => {
    const mockResults: searchApi.SearchResult[] = [
      {
        source: "chats",
        ref: "websocket:c1#12",
        session_key: "websocket:c1",
        position: 12,
        title: "Chat Progetto",
        snippet: "Ecco il «messaggio» trovato",
        ts: "2026-10-18T10:00:00Z",
      },
      {
        source: "journal",
        ref: "journal:2026-10-18",
        date: "2026-10-18",
        title: "Diario 2026-10-18",
        snippet: "Oggi «diario» scritto",
        ts: "2026-10-18",
      },
      {
        source: "kanban",
        ref: "kanban:task-42",
        task_id: "task-42",
        title: "Compito Batteria",
        snippet: "Controllo «batteria» completato",
        ts: "2026-10-18T12:00:00Z",
      },
    ];

    jest.spyOn(searchApi, "fetchSearch").mockResolvedValue(mockResults);

    await safeRender(<SearchScreen initialQuery="test" />);

    await waitFor(() => {
      expect(screen.getByText("Chat Progetto")).toBeTruthy();
    });

    // 1. Tap chat result -> opens chat
    fireEvent.press(screen.getByText("Chat Progetto"));
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/chat/websocket%3Ac1",
      }),
    );

    // 2. Tap journal result -> opens Memoria -> Diario on that date
    fireEvent.press(screen.getByText("Diario 2026-10-18"));
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/ecosystem/memory",
        params: expect.objectContaining({ tab: "journal", date: "2026-10-18" }),
      }),
    );

    // 3. Tap kanban result -> opens task in kanban
    fireEvent.press(screen.getByText("Compito Batteria"));
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/ecosystem/kanban",
        params: expect.objectContaining({ task: "task-42" }),
      }),
    );
  });
});
