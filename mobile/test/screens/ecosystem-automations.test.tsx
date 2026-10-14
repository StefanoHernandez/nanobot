import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { toast } from "../../src/ui/components/Toast";
import { AutomationsScreen } from "../../src/screens/ecosystem/automations/AutomationsScreen";
import type { AutomationChatsPayload, SessionAutomationJob } from "@/lib/types";

jest.mock("../../src/ui/components/Toast", () => ({
  toast: { show: jest.fn() },
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

const mockSession = {
  get: jest.fn(),
  post: jest.fn(),
};

jest.mock("../../src/state/sessionStore", () => ({
  useSession: () => ({ session: mockSession }),
}));

const mockRun = jest.fn();
const mockEnable = jest.fn();
const mockDisable = jest.fn();
const mockDelete = jest.fn();
const mockUpdate = jest.fn();
const mockChangeChat = jest.fn();
const mockRefresh = jest.fn();
const mockResult = jest.fn();

const mockFetchAutomationChats = jest.fn();
const mockFetchAutomationRunResult = jest.fn();

let mockJobs: SessionAutomationJob[] = [];

jest.mock("../../src/ecosystem/automations", () => {
  const actual = jest.requireActual("../../src/ecosystem/automations");
  return {
    ...actual,
    fetchAutomationChats: (...args: any[]) => mockFetchAutomationChats(...args),
    fetchAutomationRunResult: (...args: any[]) => mockFetchAutomationRunResult(...args),
    useAutomations: () => ({
      jobs: mockJobs,
      loading: false,
      error: null,
      refresh: mockRefresh,
      run: mockRun,
      enable: mockEnable,
      disable: mockDisable,
      delete: mockDelete,
      update: mockUpdate,
      changeChat: mockChangeChat,
      result: mockResult,
    }),
  };
});

const now = new Date("2026-10-14T12:00:00Z").getTime();

const jobToday: SessionAutomationJob = {
  id: "j1",
  name: "Daily Digest",
  enabled: true,
  schedule: { kind: "cron", expr: "0 9 * * *" },
  payload: { message: "Summarize today's news" },
  state: {
    next_run_at_ms: now + 2 * 3600 * 1000,
    run_history: [
      { run_at_ms: now - 3600 * 1000, status: "ok" },
    ],
  },
  origin: {
    channel: "telegram",
    chat_id: "c1",
    title: "General Chat",
  },
};

const jobLater: SessionAutomationJob = {
  id: "j2",
  name: "Weekly Report",
  enabled: false,
  schedule: { kind: "cron", expr: "0 0 * * 1" },
  payload: { message: "Generate weekly metrics" },
  state: {
    next_run_at_ms: now + 3 * 24 * 3600 * 1000,
    run_history: [],
  },
  origin: {
    channel: "slack",
    chat_id: "c2",
    title: "Metrics Room",
  },
};

const renderWithTheme = async (ui: React.ReactElement) => {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        {ui}
      </ThemeProvider>
    </SafeAreaProvider>,
  );
};

describe("P4-U4 Automations UI", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage("it");
    mockJobs = [jobToday, jobLater];
    mockRun.mockResolvedValue({ payload: { jobs: mockJobs }, result: "Execution finished successfully" });
    mockEnable.mockResolvedValue({ jobs: mockJobs });
    mockDisable.mockResolvedValue({ jobs: mockJobs });
    mockDelete.mockResolvedValue({ jobs: [] });
    mockUpdate.mockResolvedValue({ jobs: mockJobs });
    mockChangeChat.mockResolvedValue({ jobs: mockJobs });
    mockFetchAutomationChats.mockResolvedValue({
      revision: "rev-1",
      current: { id: "c1", title: "General Chat", channel: "telegram" },
      chats: [
        { id: "c1", title: "General Chat", channel: "telegram" },
        { id: "c2", title: "Metrics Room", channel: "slack" },
      ],
    } as AutomationChatsPayload);
    mockFetchAutomationRunResult.mockResolvedValue({ response: "Past run result details" });
  });

  afterAll(async () => {
    await i18n.changeLanguage("en");
  });

  test("Run now opens a confirm. Confirm calls run('j1') exactly once (a double tap still makes only 1 call), then the result text is shown", async () => {
    await renderWithTheme(<AutomationsScreen now={now} />);

    // Tap the job to open the sheet
    const row = screen.getByText("Daily Digest");
    await fireEvent.press(row);

    // Tap 'Esegui ora'
    const runBtn = screen.getByText("Esegui ora");
    await fireEvent.press(runBtn);

    // Confirm dialog is shown
    expect(screen.getByText("Esegue subito l'automazione sul computer host")).toBeTruthy();

    // Confirm action button (modal Dialog has confirm button)
    const confirmButtons = screen.getAllByText("Esegui ora");
    const confirmDialogAction = confirmButtons[confirmButtons.length - 1];

    // Double tap confirm
    await fireEvent.press(confirmDialogAction);
    await fireEvent.press(confirmDialogAction);

    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockRun).toHaveBeenCalledWith("j1");

    // The result text should be rendered
    expect(await screen.findByText("Execution finished successfully")).toBeTruthy();
  });

  test("The enable switch off calls disable('j1'), and on calls enable", async () => {
    await renderWithTheme(<AutomationsScreen now={now} />);

    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThanOrEqual(2);

    // First switch is enabled (j1) -> turn off
    await act(async () => {
      fireEvent(switches[0], "valueChange", false);
    });
    expect(mockDisable).toHaveBeenCalledTimes(1);
    expect(mockDisable).toHaveBeenCalledWith("j1");

    // Second switch is disabled (j2) -> turn on
    await act(async () => {
      fireEvent(switches[1], "valueChange", true);
    });
    expect(mockEnable).toHaveBeenCalledTimes(1);
    expect(mockEnable).toHaveBeenCalledWith("j2");
  });

  test("Delete opens a confirm, and confirm calls delete('j1') once", async () => {
    await renderWithTheme(<AutomationsScreen now={now} />);

    // Open sheet
    await fireEvent.press(screen.getByText("Daily Digest"));

    // Press Elimina
    const deleteBtn = screen.getByText("Elimina");
    await fireEvent.press(deleteBtn);

    // Confirm dialog appears
    expect(screen.getByText("Sei sicuro di voler eliminare questa automazione?")).toBeTruthy();

    const confirmButtons = screen.getAllByText("Elimina");
    const confirmDialogAction = confirmButtons[confirmButtons.length - 1];

    await act(async () => {
      fireEvent.press(confirmDialogAction);
    });

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith("j1");
  });

  test("Calendar: a job due today and one due in 3 days render under 'Oggi' and 'Più avanti' respectively", async () => {
    await renderWithTheme(<AutomationsScreen now={now} />);

    expect(screen.getByText("Oggi")).toBeTruthy();
    expect(screen.getByText("Più avanti")).toBeTruthy();
    expect(screen.getByText("Daily Digest")).toBeTruthy();
    expect(screen.getByText("Weekly Report")).toBeTruthy();
  });

  test("Change chat: picking a chat calls changeChat with its key", async () => {
    await renderWithTheme(<AutomationsScreen now={now} />);

    // Open sheet for Daily Digest
    await fireEvent.press(screen.getByText("Daily Digest"));

    // Press Cambia chat
    const changeChatBtn = screen.getByText("Cambia chat");
    await act(async () => {
      fireEvent.press(changeChatBtn);
    });

    expect(mockFetchAutomationChats).toHaveBeenCalledTimes(1);

    // Select the target chat: "Metrics Room"
    const targetChatOption = await screen.findByText("Metrics Room");
    await act(async () => {
      fireEvent.press(targetChatOption);
    });

    expect(mockChangeChat).toHaveBeenCalledTimes(1);
    expect(mockChangeChat).toHaveBeenCalledWith(
      "j1",
      expect.objectContaining({
        target_id: "c2",
        revision: "rev-1",
      }),
    );
  });
});
