import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { toast } from "../../src/ui/components/Toast";
import { router } from "expo-router";
import { AutomationsScreen } from "../../src/screens/ecosystem/automations/AutomationsScreen";
import { NewAutomationSheet } from "../../src/screens/ecosystem/automations/NewAutomationSheet";
import { chatsStore } from "../../src/state/chatsStore";

jest.mock("../../src/ui/components/Toast", () => ({
  toast: { show: jest.fn() },
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
}));

const mockSession = {
  get: jest.fn().mockResolvedValue({ jobs: [] }),
  post: jest.fn().mockResolvedValue({ id: "job-1", name: "Test" }),
  client: {
    sendMessage: jest.fn(),
    newChat: jest.fn().mockResolvedValue("new-chat-uuid"),
  },
};

jest.mock("../../src/state/sessionStore", () => ({
  useSession: () => ({ session: mockSession }),
}));

const mockRefresh = jest.fn().mockResolvedValue(undefined);

jest.mock("../../src/ecosystem/automations", () => {
  const actual = jest.requireActual("../../src/ecosystem/automations");
  return {
    ...actual,
    useAutomations: () => ({
      jobs: [],
      loading: false,
      error: null,
      refresh: mockRefresh,
      enable: jest.fn(),
      disable: jest.fn(),
      run: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      changeChat: jest.fn(),
      result: jest.fn(),
      create: jest.fn(),
    }),
  };
});

import { i18n } from "../../src/i18n";

const renderWithProviders = async (ui: React.ReactElement) => {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
};

describe("AU-A: NewAutomationSheet & AutomationsScreen", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage("it");
    chatsStore.setState({
      chats: [
        { key: "websocket:c1", title: "General Chat" },
        { key: "websocket:c2", title: "Project Work" },
      ] as any,
    });
    jest.spyOn(chatsStore.getState(), "isTemporary").mockImplementation(() => false);
    jest.spyOn(chatsStore.getState(), "newChat").mockResolvedValue("websocket:new-chat-uuid");
    jest.spyOn(chatsStore.getState(), "rename").mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await i18n.changeLanguage("en");
  });

  test("the header '+' opens the sheet", async () => {
    await renderWithProviders(<AutomationsScreen />);

    // Plus button in header
    const plusBtn = screen.getByLabelText("Nuova automazione");
    expect(plusBtn).toBeTruthy();

    await act(async () => {
      fireEvent.press(plusBtn);
    });

    // Sheet title and "Cosa deve fare" label should appear
    expect(screen.getByText("Cosa deve fare")).toBeTruthy();
    expect(screen.getByText("Quando")).toBeTruthy();
    expect(screen.getByText("Dove risponde")).toBeTruthy();
  });

  test("the empty state 'Nuova automazione' button opens the sheet", async () => {
    await renderWithProviders(<AutomationsScreen />);

    // Empty state has button titled "Nuova automazione"
    const emptyBtn = screen.getByRole("button", { name: "Nuova automazione" });
    expect(emptyBtn).toBeTruthy();

    await act(async () => {
      fireEvent.press(emptyBtn);
    });

    expect(screen.getByText("Cosa deve fare")).toBeTruthy();
  });

  test("an empty 'Cosa deve fare' disables Crea", async () => {
    await renderWithProviders(<NewAutomationSheet open={true} onClose={jest.fn()} />);

    const creaBtn = screen.getByRole("button", { name: "Crea" });
    expect(creaBtn.props.accessibilityState?.disabled).toBe(true);

    // Type something in "Cosa deve fare"
    const input = screen.getByPlaceholderText("Riassumi le notizie su…");
    await act(async () => {
      fireEvent.changeText(input, "Riassumi le notizie tech");
    });

    expect(creaBtn.props.accessibilityState?.disabled).toBe(false);
  });

  test("each 'Quando' option sends the right schedule (mock the session post)", async () => {
    const onClose = jest.fn();
    await renderWithProviders(<NewAutomationSheet open={true} onClose={onClose} onRefresh={mockRefresh} />);

    const input = screen.getByPlaceholderText("Riassumi le notizie su…");
    await act(async () => {
      fireEvent.changeText(input, "Rassegna stampa");
    });

    // 1. "Ogni giorno" (default)
    const creaBtn = screen.getByRole("button", { name: "Crea" });
    await act(async () => {
      fireEvent.press(creaBtn);
    });

    expect(mockSession.post).toHaveBeenCalledWith(
      "/api/ext/automations/create",
      expect.objectContaining({
        message: "Rassegna stampa",
        schedule: expect.objectContaining({
          kind: "cron",
          expr: "0 8 * * *",
        }),
        session_key: "websocket:new-chat-uuid",
      }),
    );
    expect(toast.show).toHaveBeenCalledWith("Automazione creata");
    expect(onClose).toHaveBeenCalled();

    // Reset post mock for next test
    mockSession.post.mockClear();

    // 2. "Ogni N"
    const ogniNChip = screen.getByRole("button", { name: "Ogni N" });
    await act(async () => {
      fireEvent.press(ogniNChip);
    });

    // Default is 5 minutes = 300,000 ms
    await act(async () => {
      fireEvent.press(creaBtn);
    });

    expect(mockSession.post).toHaveBeenCalledWith(
      "/api/ext/automations/create",
      expect.objectContaining({
        message: "Rassegna stampa",
        schedule: {
          kind: "every",
          every_ms: 300_000,
        },
      }),
    );

    mockSession.post.mockClear();

    // 3. "Una volta"
    const unaVoltaChip = screen.getByRole("button", { name: "Una volta" });
    await act(async () => {
      fireEvent.press(unaVoltaChip);
    });

    await act(async () => {
      fireEvent.press(creaBtn);
    });

    expect(mockSession.post).toHaveBeenCalledWith(
      "/api/ext/automations/create",
      expect.objectContaining({
        message: "Rassegna stampa",
        schedule: expect.objectContaining({
          kind: "at",
          at_ms: expect.any(Number),
        }),
      }),
    );

    mockSession.post.mockClear();

    // 4. "Avanzato"
    const avanzatoChip = screen.getByRole("button", { name: "Avanzato" });
    await act(async () => {
      fireEvent.press(avanzatoChip);
    });

    const cronInput = screen.getByPlaceholderText("0 8 * * 1-5");
    await act(async () => {
      fireEvent.changeText(cronInput, "30 7 * * 1-5");
    });

    await act(async () => {
      fireEvent.press(creaBtn);
    });

    expect(mockSession.post).toHaveBeenCalledWith(
      "/api/ext/automations/create",
      expect.objectContaining({
        message: "Rassegna stampa",
        schedule: expect.objectContaining({
          kind: "cron",
          expr: "30 7 * * 1-5",
        }),
      }),
    );
  });

  test("'Nuova chat' creates a chat first and sends its key; picking a chat sends that key", async () => {
    const onClose = jest.fn();
    await renderWithProviders(<NewAutomationSheet open={true} onClose={onClose} onRefresh={mockRefresh} />);

    const input = screen.getByPlaceholderText("Riassumi le notizie su…");
    await act(async () => {
      fireEvent.changeText(input, "Notizie mattina");
    });

    const creaBtn = screen.getByRole("button", { name: "Crea" });

    // Mode 1: "Nuova chat" (default)
    await act(async () => {
      fireEvent.press(creaBtn);
    });

    expect(chatsStore.getState().newChat).toHaveBeenCalled();
    expect(chatsStore.getState().rename).toHaveBeenCalledWith("websocket:new-chat-uuid", "Notizie mattina");
    expect(mockSession.post).toHaveBeenCalledWith(
      "/api/ext/automations/create",
      expect.objectContaining({
        session_key: "websocket:new-chat-uuid",
      }),
    );

    mockSession.post.mockClear();
    (chatsStore.getState().newChat as jest.Mock).mockClear();

    // Mode 2: "Chat esistente"
    const existingChip = screen.getByRole("button", { name: "Chat esistente" });
    await act(async () => {
      fireEvent.press(existingChip);
    });

    // Click on "Project Work"
    const projectChat = screen.getByText("Project Work");
    await act(async () => {
      fireEvent.press(projectChat);
    });

    await act(async () => {
      fireEvent.press(creaBtn);
    });

    // Should NOT create new chat, should use selected chat key directly
    expect(chatsStore.getState().newChat).not.toHaveBeenCalled();
    expect(mockSession.post).toHaveBeenCalledWith(
      "/api/ext/automations/create",
      expect.objectContaining({
        session_key: "websocket:c2",
      }),
    );
  });

  test("a server error is shown and the form is kept", async () => {
    mockSession.post.mockRejectedValueOnce({
      response: { data: { error: "invalid_schedule" } },
    });

    const onClose = jest.fn();
    await renderWithProviders(<NewAutomationSheet open={true} onClose={onClose} />);

    const input = screen.getByPlaceholderText("Riassumi le notizie su…");
    await act(async () => {
      fireEvent.changeText(input, "Proviamo errore");
    });

    const creaBtn = screen.getByRole("button", { name: "Crea" });
    await act(async () => {
      fireEvent.press(creaBtn);
    });

    // Error is shown under the button
    await waitFor(() => {
      expect(screen.getByText("invalid_schedule")).toBeTruthy();
    });

    // Form was NOT closed
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Proviamo errore")).toBeTruthy();
  });

  test("'Descrivila al bot' sends with intent: 'create_automation'", async () => {
    const onClose = jest.fn();
    await renderWithProviders(<NewAutomationSheet open={true} onClose={onClose} />);

    const input = screen.getByPlaceholderText("Riassumi le notizie su…");
    await act(async () => {
      fireEvent.changeText(input, "Vorrei un riassunto dei prezzi ogni lunedì");
    });

    const descrivilaBtn = screen.getByRole("button", { name: "Oppure descrivila al bot" });
    await act(async () => {
      fireEvent.press(descrivilaBtn);
    });

    expect(chatsStore.getState().newChat).toHaveBeenCalled();
    expect(mockSession.client.sendMessage).toHaveBeenCalledWith(
      "new-chat-uuid",
      "Vorrei un riassunto dei prezzi ogni lunedì",
      undefined,
      { intent: "create_automation" },
    );
    expect(onClose).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith("/chat/websocket%3Anew-chat-uuid");
  });
});
