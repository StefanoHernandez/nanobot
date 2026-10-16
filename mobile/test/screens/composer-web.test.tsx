import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { Composer } from "../../src/screens/thread/Composer";
import { i18n } from "../../src/i18n";
import { useThreadSlice } from "../../src/state/threadStore";
import { useSession } from "../../src/state/sessionStore";

jest.mock("../../src/state/threadStore", () => ({
  useThreadSlice: jest.fn(),
  threadStore: jest.requireActual("../../src/state/threadStore").threadStore,
}));
jest.mock("../../src/state/sessionStore");
jest.mock("../../src/extras/logic", () => ({
  loadCommands: jest.fn(async () => []),
}));

const mockUseThreadSlice = useThreadSlice as unknown as jest.Mock;
const mockUseSession = useSession as unknown as jest.Mock;
const mockSend = jest.fn();
const mockSetDraft = jest.fn();

function setupThread(overrides = {}) {
  mockUseThreadSlice.mockReturnValue({
    draft: "hello world",
    setDraft: mockSetDraft,
    send: mockSend,
    running: false,
    stop: jest.fn(),
    messages: [],
    notices: [],
    model: null,
    preset: null,
    pendingFiles: [],
    ...overrides,
  });
}

describe("Composer Enter key on web and mobile", () => {
  const originalOS = Platform.OS;

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
    setupThread();
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  const mount = async () => {
    const rendered = await render(
      <ThemeProvider>
        <Composer chatKey="websocket:c1" />
      </ThemeProvider>,
    );
    await act(async () => {});
    return rendered;
  };

  test("on web, Enter calls send", async () => {
    Platform.OS = "web";
    mockSend.mockReturnValue(true);
    await mount();

    const input = screen.getByPlaceholderText(i18n.t("composer.placeholder"));
    const preventDefault = jest.fn();
    await act(async () => {
      fireEvent(input, "keyPress", {
        nativeEvent: { key: "Enter", shiftKey: false, isComposing: false },
        preventDefault,
      });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith("hello world");
  });

  test("on web, Shift+Enter does not call send", async () => {
    Platform.OS = "web";
    await mount();

    const input = screen.getByPlaceholderText(i18n.t("composer.placeholder"));
    const preventDefault = jest.fn();
    await act(async () => {
      fireEvent(input, "keyPress", {
        nativeEvent: { key: "Enter", shiftKey: true, isComposing: false },
        preventDefault,
      });
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("on web, IME composition (isComposing: true) does not call send", async () => {
    Platform.OS = "web";
    await mount();

    const input = screen.getByPlaceholderText(i18n.t("composer.placeholder"));
    const preventDefault = jest.fn();
    await act(async () => {
      fireEvent(input, "keyPress", {
        nativeEvent: { key: "Enter", shiftKey: false, isComposing: true },
        preventDefault,
      });
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("on android, Enter does not call send", async () => {
    Platform.OS = "android";
    await mount();

    const input = screen.getByPlaceholderText(i18n.t("composer.placeholder"));
    const preventDefault = jest.fn();
    await act(async () => {
      fireEvent(input, "keyPress", {
        nativeEvent: { key: "Enter", shiftKey: false, isComposing: false },
        preventDefault,
      });
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
