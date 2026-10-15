import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { ChatDrawer } from "../../src/screens/chats/ChatDrawer";

const chats = [
  { key: "websocket:a", title: "Alpha", preview: "hello", updatedAt: null },
  { key: "websocket:b", title: "Beta", preview: "world", updatedAt: null },
  { key: "telegram:1", title: "Tele", preview: "hi", updatedAt: null },
];
const mockState = {
  chats,
  loading: false,
  refresh: jest.fn(async () => {}),
  newChat: jest.fn(async () => "websocket:new1"),
  newTemporaryChat: jest.fn(async () => "websocket:tmp1"),
  rename: jest.fn(async () => {}),
  remove: jest.fn(async () => {}),
  search: jest.fn((q: string) => chats.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase()))),
};

jest.mock("expo-router", () => ({
  router: { navigate: jest.fn(), replace: jest.fn(), push: jest.fn() },
  usePathname: () => "/",
}));
jest.mock("../../src/state/chatsStore", () => ({
  useChats: (sel?: (s: unknown) => unknown) => (sel ? sel(mockState) : mockState),
  isWritable: (k: string) => k.startsWith("websocket:"),
}));
jest.mock("../../src/state/sessionStore", () => ({
  useSession: () => ({ session: null, state: "none", profile: { id: "p", name: "Luffy", baseUrl: "https://x", hasSecret: false } }),
}));

const onClose = jest.fn();
const show = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <ThemeProvider>
        <ChatDrawer onClose={onClose} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

beforeEach(async () => {
  jest.clearAllMocks();
  await i18n.changeLanguage("en");
});

test("search filters the list", async () => {
  await show();
  await fireEvent.changeText(screen.getByLabelText("Search"), "alp");
  expect(mockState.search).toHaveBeenCalledWith("alp");
  expect(screen.getByText("Alpha")).toBeTruthy();
  expect(screen.queryByText("Beta")).toBeNull();
});

test("non-writable chat shows read-only badge", async () => {
  await show();
  expect(screen.getAllByText("read-only")).toHaveLength(1);
});

test("long-press, Delete, confirm removes once; cancel does nothing", async () => {
  await show();
  await fireEvent(screen.getByText("Alpha"), "longPress");
  await fireEvent.press(screen.getByText("Delete"));
  await fireEvent.press(screen.getByText("Cancel"));
  expect(mockState.remove).not.toHaveBeenCalled();

  await fireEvent(screen.getByText("Alpha"), "longPress");
  await fireEvent.press(screen.getByText("Delete"));
  expect(screen.getByText("Delete Alpha?")).toBeTruthy();
  await fireEvent.press(screen.getByText("Delete"));
  expect(mockState.remove).toHaveBeenCalledTimes(1);
  expect(mockState.remove).toHaveBeenCalledWith("websocket:a");
});

test("rename passes the trimmed value", async () => {
  await show();
  await fireEvent(screen.getByText("Alpha"), "longPress");
  await fireEvent.press(screen.getByText("Rename"));
  await fireEvent.changeText(screen.getByLabelText("Title"), "  New title  ");
  await fireEvent.press(screen.getByText("Rename"));
  expect(mockState.rename).toHaveBeenCalledWith("websocket:a", "New title");
});

test("New chat awaits newChat then navigates", async () => {
  await show();
  await fireEvent.press(screen.getByText("New chat"));
  expect(mockState.newChat).toHaveBeenCalledTimes(1);
  expect(router.navigate).toHaveBeenCalledWith("/chat/websocket%3Anew1");
  expect(onClose).toHaveBeenCalled();
});

test("All projects navigates to /projects", async () => {
  await show();
  expect(screen.getByText("Older")).toBeTruthy();
  await fireEvent.press(screen.getByText("All projects"));
  expect(router.push).toHaveBeenCalledWith("/projects");
  expect(onClose).toHaveBeenCalled();
});

test("search flattens the list and hides the date sections", async () => {
  await show();
  await fireEvent.changeText(screen.getByLabelText("Search"), "alp");
  expect(screen.getByText("Alpha")).toBeTruthy();
  expect(screen.queryByText("Older")).toBeNull();
  expect(screen.queryByText("Projects")).toBeNull();
});

