import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { MemoryScreen } from "../../src/screens/ecosystem/memory/MemoryScreen";
import type { MemoryPages } from "../../src/ecosystem/memory";

const mockGet = jest.fn();
const mockSession = { get: mockGet };

jest.mock("../../src/state/sessionStore", () => ({
  useSession: () => ({ session: mockSession }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useNavigation: () => ({ addListener: jest.fn(() => () => {}) }),
}));

const memoryFixture: MemoryPages = {
  dream: { enabled: true, schedule: "every 2h" },
  pages: {
    user: { text: "Alice prefers concise replies.", truncated: false },
    memory: { text: "Project deadline is Friday.", truncated: false },
    soul: { text: "Speak warmly and directly.", truncated: false },
  },
  latest: {
    time: "2025-06-01T10:30:00Z",
    subject: "Updated USER.md",
    diff: "+ name: Alice",
    truncated: false,
  },
};

const renderScreen = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <MemoryScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

describe("Ecosystem memory screen", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage("en");
    mockGet.mockResolvedValue(memoryFixture);
  });

  test("Profile tab shows the user text", async () => {
    const view = await renderScreen();
    expect(await view.findByText("Alice prefers concise replies.")).toBeTruthy();
  });

  test("Notes and Voice tabs show their page text", async () => {
    const view = await renderScreen();
    await view.findByText("Alice prefers concise replies.");

    await act(async () => {
      await fireEvent.press(view.getByText("Notes"));
    });
    expect(await view.findByText("Project deadline is Friday.")).toBeTruthy();

    await act(async () => {
      await fireEvent.press(view.getByText("Voice"));
    });
    expect(await view.findByText("Speak warmly and directly.")).toBeTruthy();
  });

  test("Dream on and every-2-hours schedule are shown", async () => {
    const view = await renderScreen();
    expect(await view.findByText(/Dream on/)).toBeTruthy();
    expect(await view.findByText(/Every 2 hours/)).toBeTruthy();
  });

  test("Latest subject and diff are visible", async () => {
    const view = await renderScreen();
    expect(await view.findByText("Updated USER.md")).toBeTruthy();
    expect(await view.findByText("+ name: Alice")).toBeTruthy();
  });

  test("A rejected fetch shows Operation failed, not the raw error", async () => {
    mockGet.mockRejectedValue(new Error("Super secret server traceback"));
    const view = await renderScreen();
    expect(await view.findByText("Operation failed")).toBeTruthy();
    expect(view.queryByText(/Super secret server traceback/)).toBeNull();
  });
});
