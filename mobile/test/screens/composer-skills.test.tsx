import "../../src/platform/install";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { Composer } from "../../src/screens/thread/Composer";
import { i18n } from "../../src/i18n";
import { useThreadSlice } from "../../src/state/threadStore";
import { useSession } from "../../src/state/sessionStore";
import { loadCommands } from "../../src/extras/logic";
import { loadSkills } from "../../src/ecosystem/skills";

jest.mock("../../src/extras/logic", () => {
  const actual = jest.requireActual("../../src/extras/logic");
  return {
    ...actual,
    loadCommands: jest.fn(),
  };
});

jest.mock("../../src/ecosystem/skills", () => {
  const actual = jest.requireActual("../../src/ecosystem/skills");
  return {
    ...actual,
    loadSkills: jest.fn(),
  };
});

jest.mock("../../src/state/threadStore", () => ({
  useThreadSlice: jest.fn(),
  threadStore: jest.requireActual("../../src/state/threadStore").threadStore,
}));

jest.mock("../../src/state/sessionStore");

const mockUseThreadSlice = useThreadSlice as unknown as jest.Mock;
const mockUseSession = useSession as unknown as jest.Mock;
const mockLoadCommands = loadCommands as unknown as jest.Mock;
const mockLoadSkills = loadSkills as unknown as jest.Mock;

const mockSend = jest.fn();
const mockSetDraft = jest.fn();
const mockStop = jest.fn();

function setupThread(overrides = {}) {
  mockUseThreadSlice.mockReturnValue({
    draft: "",
    setDraft: mockSetDraft,
    send: mockSend,
    running: false,
    stop: mockStop,
    messages: [],
    notices: [],
    model: null,
    preset: null,
    pendingFiles: [],
    ...overrides,
  });
}

const mockCommands = [
  { command: "/compact", title: "Compact context", description: "Summarize chat history", acceptsArgs: false },
  { command: "/status", title: "Status", description: "Show system status", acceptsArgs: false },
];

const mockSkills = [
  { name: "weather", description: "Weather forecast", available: true, source: "builtin" },
  { name: "calendar", description: "Manage calendar", available: true, source: "workspace" },
];

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({
    session: {
      id: "s1",
      client: {
        sendMessage: jest.fn(),
        finishRunLocally: jest.fn(),
        onRuntimeModelUpdate: () => () => {},
        onChat: () => () => {},
      },
      limits: { max_file_bytes: 1000000 },
      get: jest.fn().mockResolvedValue({}),
    },
    state: "open",
    profile: { id: "p1", name: "test" },
  });
  mockLoadCommands.mockResolvedValue(mockCommands);
  mockLoadSkills.mockResolvedValue(mockSkills);
});

describe("Part 6: Call a skill by name from the composer", () => {
  test("'/' shows commands plus skills under Skill heading", async () => {
    setupThread({ draft: "/" });

    await render(
      <ThemeProvider>
        <Composer chatKey="websocket:test" />
      </ThemeProvider>
    );

    // Commands are present
    expect(await screen.findByText("/compact")).toBeTruthy();
    expect(screen.getByText("/status")).toBeTruthy();

    // Skill heading is present
    expect(screen.getByText("Skill")).toBeTruthy();

    // Skills are listed
    expect(screen.getByText("$weather")).toBeTruthy();
    expect(screen.getByText("$calendar")).toBeTruthy();
  });

  test("picking a skill inserts $name into draft", async () => {
    setupThread({ draft: "/" });

    await render(
      <ThemeProvider>
        <Composer chatKey="websocket:test" />
      </ThemeProvider>
    );

    const weatherItem = await screen.findByTestId("slash-item-$weather");
    await act(async () => {
      fireEvent.press(weatherItem);
    });

    expect(mockSetDraft).toHaveBeenCalledWith("$weather ");
  });

  test("'$sk' filters to skills only without commands", async () => {
    setupThread({ draft: "$we" });

    await render(
      <ThemeProvider>
        <Composer chatKey="websocket:test" />
      </ThemeProvider>
    );

    // Commands are NOT present
    expect(screen.queryByText("/compact")).toBeNull();
    expect(screen.queryByText("/status")).toBeNull();

    // Filtered skill is present
    expect(await screen.findByText("$weather")).toBeTruthy();

    // Other skill not matching "we" is not present
    expect(screen.queryByText("$calendar")).toBeNull();
  });

  test("picking a skill when menu opened via $ inserts $name ", async () => {
    setupThread({ draft: "$" });

    await render(
      <ThemeProvider>
        <Composer chatKey="websocket:test" />
      </ThemeProvider>
    );

    const calendarItem = await screen.findByTestId("slash-item-$calendar");
    await act(async () => {
      fireEvent.press(calendarItem);
    });

    expect(mockSetDraft).toHaveBeenCalledWith("$calendar ");
  });
});
