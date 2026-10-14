import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { Composer } from "../../src/screens/thread/Composer";
import { i18n } from "../../src/i18n";
import { useThreadSlice } from "../../src/state/threadStore";
import { useSession } from "../../src/state/sessionStore";
import { loadCommands } from "../../src/extras/logic";

jest.mock("../../src/extras/logic", () => {
  const actual = jest.requireActual("../../src/extras/logic");
  return {
    ...actual,
    loadCommands: jest.fn(),
  };
});
jest.mock("../../src/state/threadStore", () => ({
  useThreadSlice: jest.fn(),
  threadStore: jest.requireActual("../../src/state/threadStore").threadStore, // read by the real useEffort
}));
jest.mock("../../src/state/sessionStore");

const mockUseThreadSlice = useThreadSlice as unknown as jest.Mock;
const mockUseSession = useSession as unknown as jest.Mock;
const mockLoadCommands = loadCommands as unknown as jest.Mock;

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
    ...overrides,
  });
}

const mockCommands = [
  { command: "/compact", title: "Compact context", description: "Summarize chat history", acceptsArgs: false },
  { command: "/status", title: "Status", description: "Show system status", acceptsArgs: false },
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
        onRuntimeModelUpdate: () => () => {},
        onChat: () => () => {},
      },
    } as never,
    state: "open",
    profile: null,
  });
  mockLoadCommands.mockResolvedValue(mockCommands);
  setupThread();
});

const mount = async (chatKey = "websocket:c1") => {
  const rendered = await render(
    <ThemeProvider>
      <Composer chatKey={chatKey} />
    </ThemeProvider>,
  );
  await act(async () => {});
  return rendered;
};

test("typing text with a newline ('a\\nb') does not call send", async () => {
  setupThread({ draft: "a\nb" });
  await mount();
  const input = screen.getByPlaceholderText("Message nanobot…");
  fireEvent.changeText(input, "a\nb");
  expect(mockSetDraft).toHaveBeenCalledWith("a\nb");
  expect(mockSend).not.toHaveBeenCalled();
});

test("pressing send with '  hi  ' calls send('hi') exactly once (the store clears the draft)", async () => {
  mockSend.mockReturnValue(true);
  setupThread({ draft: "  hi  " });
  await mount();
  const sendBtn = screen.getByLabelText("Send");
  fireEvent.press(sendBtn);
  expect(mockSend).toHaveBeenCalledTimes(1);
  expect(mockSend).toHaveBeenCalledWith("hi");
  expect(mockSetDraft).not.toHaveBeenCalled();
});

test("empty or whitespace-only draft: the send button is disabled (pressing it calls nothing)", async () => {
  setupThread({ draft: "   " });
  await mount();
  const sendBtn = screen.getByLabelText("Send");
  fireEvent.press(sendBtn);
  expect(mockSend).not.toHaveBeenCalled();
});

test("draft '/co' with commands /compact, /status: the menu shows /compact only", async () => {
  setupThread({ draft: "/co" });
  await mount();
  expect(screen.getByText("/compact")).toBeTruthy();
  expect(screen.queryByText("/status")).toBeNull();
});

test("selecting /compact calls setDraft('/compact ')", async () => {
  setupThread({ draft: "/co" });
  await mount();
  const item = screen.getByText("/compact");
  fireEvent.press(item);
  expect(mockSetDraft).toHaveBeenCalledWith("/compact ");
});

test("running: true with non-empty draft shows 'Steer' label; with empty draft shows Stop, and pressing it calls stop once", async () => {
  mockSend.mockReturnValue(true);
  setupThread({ running: true, draft: "keep going" });
  const { rerender } = await mount();
  const steerBtn = screen.getByLabelText("Steer");
  expect(steerBtn).toBeTruthy();
  fireEvent.press(steerBtn);
  expect(mockSend).toHaveBeenCalledWith("keep going");

  // Rerender with empty draft while running
  setupThread({ running: true, draft: "" });
  await rerender(
    <ThemeProvider>
      <Composer chatKey="websocket:c1" />
    </ThemeProvider>,
  );
  expect(screen.queryByLabelText("Steer")).toBeNull();
  const stopBtn = screen.getByLabelText("Stop");
  expect(stopBtn).toBeTruthy();
  fireEvent.press(stopBtn);
  expect(mockStop).toHaveBeenCalledTimes(1);
});
