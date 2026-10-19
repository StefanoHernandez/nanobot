import { sessionPost } from "../sessionPost";
import React from "react";
import { AccessibilityInfo, Animated, Dimensions, ScrollView } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../../src/i18n";
import { i18n } from "../../src/i18n";
import type { NanobotSession } from "../../src/core/session";
import { KanbanScreen } from "../../src/screens/ecosystem/kanban/KanbanScreen";
import { toast } from "../../src/ui/components";
import { ThemeProvider } from "../../src/ui/ThemeProvider";

const fetchMock = jest.fn();
const mockGet = jest.fn();
const mockPush = jest.fn();

const session = {
  baseUrl: "https://srv.test",
  apiToken: () => "api-token-secret",
  post: sessionPost,
  get: mockGet,
} as unknown as NanobotSession;

jest.mock("../../src/settings/store", () => ({
  useSettings: () => ({ data: { requires_restart: false }, loading: false, error: null, refresh: jest.fn() }),
  useRestart: () => ({ pending: false, state: "idle", run: jest.fn() }),
}));

jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), replace: jest.fn() },
  useNavigation: () => ({ addListener: jest.fn(() => () => {}) }),
  useLocalSearchParams: () => ({}),
}));

const setWidth = (width: number) =>
  Dimensions.set({ window: { width, height: 844, scale: 2, fontScale: 1 }, screen: { width, height: 844, scale: 2, fontScale: 1 } });

beforeEach(async () => {
  jest.clearAllMocks();
  global.fetch = fetchMock as typeof fetch;
  setWidth(390);
  // Running cards pulse; keep the animation frames out of tests that are not about it.
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  await i18n.changeLanguage("en");
});

afterEach(() => {
  toast.show("");
});

const task = (id: string, title: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  status,
  priority: "medium",
  assignee_bot_id: "bot1",
  description: "",
  ...extra,
});

const snapshot = {
  boards: [{ id: "main", title: "Main" }],
  active_board: { id: "main", title: "Main" },
  bots: [{ id: "bot1", name: "Helper", icon: "🤖", role_prompt: "Helps out", model_preset: "", max_concurrent: 1 }],
  tasks: [
    task("t-todo", "Ship feature", "todo"),
    task("t-ready", "Queued job", "ready"),
    task("t-run", "In progress", "running"),
    task("t-review", "Needs review", "review"),
    task("t-blocked", "Stuck job", "blocked"),
  ],
  links: [],
  messages: [],
};

const show = () =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <KanbanScreen session={session} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

const ready = async () => {
  mockGet.mockResolvedValue(snapshot);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ task: {} }) });
  await show();
  await waitFor(() => expect(screen.getByText("Ship feature")).toBeTruthy());
};

const longPress = async (title: string) => {
  await act(async () => {
    fireEvent(screen.getByText(title), "longPress");
  });
};

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>;
const callsTo = (suffix: string) => fetchMock.mock.calls.filter((call) => String(call[0]).endsWith(suffix));

describe("narrow screens: one column at a time", () => {
  test("a status chip selects its column and pages the board to it", async () => {
    await ready();
    const scrollTo = ScrollView.prototype.scrollTo as unknown as jest.Mock;
    scrollTo.mockClear();

    expect(screen.getByRole("tab", { name: "To do (1)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Triage (0)" }).props.accessibilityState.selected).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByRole("tab", { name: "Review (1)" }));
    });

    expect(screen.getByRole("tab", { name: "Review (1)" }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole("tab", { name: "Triage (0)" }).props.accessibilityState.selected).toBe(false);
    expect(scrollTo).toHaveBeenCalledWith({ x: 390 * 4, y: 0, animated: true });
    expect(screen.getByTestId("kanban-page-review").props.style).toEqual(expect.objectContaining({ width: 390 }));
  });

  test("swiping to another page moves the selected chip", async () => {
    await ready();

    await act(async () => {
      fireEvent(screen.getByTestId("kanban-pager"), "momentumScrollEnd", {
        nativeEvent: { contentOffset: { x: 390, y: 0 }, contentSize: { width: 2730, height: 400 }, layoutMeasurement: { width: 390, height: 400 } },
      });
    });

    expect(screen.getByRole("tab", { name: "To do (1)" }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole("tab", { name: "Triage (0)" }).props.accessibilityState.selected).toBe(false);
  });

  test("a wide screen keeps the sideways board with column headers", async () => {
    setWidth(1024);
    await ready();

    expect(screen.queryByTestId("kanban-pager")).toBeNull();
    expect(screen.queryByRole("tab", { name: "To do (1)" })).toBeNull();
    expect(screen.getByText("To do (1)")).toBeTruthy();
  });
});

describe("quick actions on a long-pressed card", () => {
  const labels = ["Start now", "Approve", "Send back", "Move to Done", "Block"];
  const shown = () => labels.filter((label) => screen.queryByRole("button", { name: label }));

  test.each([
    ["Ship feature", ["Start now", "Move to Done", "Block"]],
    ["Queued job", ["Move to Done", "Block"]],
    ["In progress", ["Move to Done", "Block"]],
    ["Needs review", ["Approve", "Send back", "Move to Done", "Block"]],
    ["Stuck job", ["Start now", "Move to Done"]],
  ])("%s offers %j", async (title, expected) => {
    await ready();
    await longPress(title);
    expect(shown()).toEqual(expected);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a card without a bot cannot be started", async () => {
    mockGet.mockResolvedValue({ ...snapshot, tasks: [task("t-orphan", "No bot", "todo", { assignee_bot_id: null })] });
    await show();
    await waitFor(() => expect(screen.getByText("No bot")).toBeTruthy());
    await longPress("No bot");
    expect(shown()).toEqual(["Move to Done", "Block"]);
  });

  test("a ready card scheduled for later can start now", async () => {
    mockGet.mockResolvedValue({ ...snapshot, tasks: [task("t-later", "Later job", "ready", { scheduled_at_ms: Date.now() + 3_600_000 })] });
    await show();
    await waitFor(() => expect(screen.getByText("Later job")).toBeTruthy());
    await longPress("Later job");
    expect(shown()).toEqual(["Start now", "Move to Done", "Block"]);
  });

  test("Start now saves the task as ready with no schedule", async () => {
    await ready();
    await longPress("Ship feature");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Start now" }));
    });

    await waitFor(() => expect(callsTo("/tasks/save")).toHaveLength(1));
    expect(bodyOf(callsTo("/tasks/save")[0])).toEqual({
      board_id: "main",
      id: "t-todo",
      title: "Ship feature",
      status: "ready",
      assignee_bot_id: "bot1",
      scheduled_at_ms: null,
    });
    expect(screen.queryByRole("button", { name: "Start now" })).toBeNull();
  });

  test("Move to Done and Block use the move endpoint", async () => {
    await ready();
    await longPress("In progress");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Move to Done" }));
    });
    await waitFor(() => expect(callsTo("/tasks/move")).toHaveLength(1));
    expect(bodyOf(callsTo("/tasks/move")[0])).toEqual({ id: "t-run", status: "done" });

    await longPress("Ship feature");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Block" }));
    });
    await waitFor(() => expect(callsTo("/tasks/move")).toHaveLength(2));
    expect(bodyOf(callsTo("/tasks/move")[1])).toEqual({ id: "t-todo", status: "blocked" });
  });

  test("Approve and Send back review the card; sending back needs feedback", async () => {
    await ready();
    await longPress("Needs review");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Approve" }));
    });
    await waitFor(() => expect(callsTo("/tasks/review")).toHaveLength(1));
    expect(bodyOf(callsTo("/tasks/review")[0])).toEqual({ id: "t-review", approved: true });

    await longPress("Needs review");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Send back" }));
    });
    expect(callsTo("/tasks/review")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Send back" }).props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Changes"), "Add tests");
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Send back" }));
    });
    await waitFor(() => expect(callsTo("/tasks/review")).toHaveLength(2));
    expect(bodyOf(callsTo("/tasks/review")[1])).toEqual({ id: "t-review", approved: false, feedback: "Add tests" });
  });
});

describe("the editor status chips keep unsaved edits", () => {
  const open = async () => {
    await ready();
    await act(async () => {
      fireEvent.press(screen.getByText("Ship feature"));
    });
  };

  test("an edited form is saved before the task is moved", async () => {
    await open();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Title"), "Ship feature v2");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Review"));
    });

    await waitFor(() => expect(callsTo("/tasks/move")).toHaveLength(1));
    const urls = fetchMock.mock.calls.map((call) => String(call[0]).replace("https://srv.test/api/ext/kanban", ""));
    expect(urls).toEqual(["/tasks/save", "/tasks/move"]);
    expect(bodyOf(callsTo("/tasks/save")[0])).toMatchObject({ id: "t-todo", title: "Ship feature v2", status: "todo" });
    expect(bodyOf(callsTo("/tasks/move")[0])).toEqual({ id: "t-todo", status: "review" });
  });

  test("when saving fails the task is not moved and the edits stay in the form", async () => {
    await open();
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "task_limit" }) });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Title"), "Ship feature v2");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Review"));
    });

    await waitFor(() => expect(screen.getByText("Too many tasks.")).toBeTruthy());
    expect(callsTo("/tasks/move")).toHaveLength(0);
    expect(screen.getByDisplayValue("Ship feature v2")).toBeTruthy();
  });

  test("an invalid edit is not sent and says why", async () => {
    await open();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Title"), "   ");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Review"));
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Fix the title, retries or repeat before moving this task.")).toBeTruthy();
  });
});

describe("running cards", () => {
  test("show a Watch the bot button that opens the task session", async () => {
    await ready();

    expect(screen.getAllByRole("button", { name: "Watch the bot" })).toHaveLength(1);
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Watch the bot" }));
    });

    expect(mockPush).toHaveBeenCalledWith(`/chat/${encodeURIComponent("kanban:t-run:bot1")}`);
  });

  test("pulse with the brand border unless reduced motion is on", async () => {
    const reduce = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    const loop = jest.spyOn(Animated, "loop");
    await ready();
    expect(screen.getByTestId("kanban-pulse-t-run")).toBeTruthy();
    await waitFor(() => expect(loop).toHaveBeenCalled());
    expect(screen.queryByTestId("kanban-pulse-t-todo")).toBeNull();

    loop.mockClear();
    reduce.mockResolvedValue(true);
    screen.unmount();
    await ready();
    await act(async () => {});
    expect(screen.getByTestId("kanban-pulse-t-run")).toBeTruthy();
    expect(loop).not.toHaveBeenCalled();

    loop.mockRestore();
  });
});
