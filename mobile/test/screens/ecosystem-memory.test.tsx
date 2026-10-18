import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { MemoryScreen } from "../../src/screens/ecosystem/memory/MemoryScreen";
import type { MemoryPages } from "../../src/ecosystem/memory";

const mockGet = jest.fn();
const mockSession = {
  get: mockGet,
  // journal POSTs go through session.post; route them to global.fetch so tests can inspect the call
  post: async (path: string, body?: unknown) => {
    const res = await global.fetch(`http://h${path}`, { method: "POST", body: JSON.stringify(body) });
    return res.json();
  },
  baseUrl: "http://h",
  apiToken: () => "t",
};

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

  test("the journal switch sends the settings", async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (String(path).includes("/api/ext/journal")) return { enabled: false, hour: 3, days: [] };
      return memoryFixture;
    });
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ enabled: true, hour: 3 }) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const view = await renderScreen();
    await act(async () => {
      fireEvent.press(await view.findByText("Journal"));
    });
    await fireEvent(view.getByLabelText("Automatic journal"), "valueChange", true);
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, { body?: string }];
    expect(JSON.parse(String(firstCall[1].body))).toEqual({ enabled: true, hour: 3 });
  });

  test("Write another day opens picker and calls runJournal with chosen date", async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (String(path).includes("/api/ext/journal")) {
        return { enabled: false, hour: 3, days: [] };
      }
      return memoryFixture;
    });
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ date: "2026-10-10", written: true }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const view = await renderScreen();
    await act(async () => {
      fireEvent.press(await view.findByText("Journal"));
    });
    const otherBtn = await view.findByLabelText("Write another day");
    expect(otherBtn).toBeTruthy();
    await act(async () => {
      fireEvent.press(otherBtn);
    });
    const picker = view.getByTestId("journal-date-picker");
    expect(picker).toBeTruthy();
    await act(async () => {
      fireEvent(picker, "onChange", { nativeEvent: { timestamp: new Date(2026, 9, 10).getTime() } });
    });
    const runCall = fetchMock.mock.calls[0] as unknown as [string, { body?: string }];
    expect(String(runCall[0])).toContain("/api/ext/journal/run");
    expect(JSON.parse(String(runCall[1].body))).toEqual({ date: "2026-10-10" });
  });

  test("Write today calls run and refreshes the list", async () => {
    let journalGets = 0;
    mockGet.mockImplementation(async (path: string) => {
      if (String(path).includes("/api/ext/journal")) {
        journalGets += 1;
        return journalGets < 2
          ? { enabled: false, hour: 22, days: [] }
          : { enabled: false, hour: 22, days: ["2026-10-16"] };
      }
      return memoryFixture;
    });
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ date: "2026-10-16", written: true }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const view = await renderScreen();
    await act(async () => {
      fireEvent.press(await view.findByText("Journal"));
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText("Write today's journal"));
    });
    const runCall = fetchMock.mock.calls[0] as unknown as [string, { body?: string }];
    expect(String(runCall[0])).toContain("/api/ext/journal/run");
    expect(await view.findByText("2026-10-16")).toBeTruthy();
  });

  test("tapping a day shows its text", async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (String(path).includes("/api/ext/journal/day")) {
        return { date: "2026-10-16", text: "Decided two disks." };
      }
      if (String(path).includes("/api/ext/journal")) {
        return { enabled: true, hour: 21, days: ["2026-10-16"] };
      }
      return memoryFixture;
    });
    const view = await renderScreen();
    await act(async () => {
      fireEvent.press(await view.findByText("Journal"));
    });
    await act(async () => {
      fireEvent.press(await view.findByText("2026-10-16"));
    });
    expect(await view.findByText("Decided two disks.")).toBeTruthy();
  });
});
