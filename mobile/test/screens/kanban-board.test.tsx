import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../../src/i18n";
import { i18n } from "../../src/i18n";
import type { NanobotSession } from "../../src/core/session";
import { KanbanScreen } from "../../src/screens/ecosystem/kanban/KanbanScreen";
import { fetchKanban } from "../../src/ecosystem/kanban";
import { ThemeProvider } from "../../src/ui/ThemeProvider";

const fetchMock = jest.fn();
const mockGet = jest.fn();

const session = {
  baseUrl: "https://srv.test",
  apiToken: () => "api-token-secret",
  get: mockGet,
} as unknown as NanobotSession;

jest.mock("../../src/settings/store", () => ({
  useSettings: () => ({ data: { requires_restart: false }, loading: false, error: null, refresh: jest.fn() }),
  useRestart: () => ({ pending: false, state: "idle", run: jest.fn() }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useNavigation: () => ({ addListener: jest.fn(() => () => {}) }),
}));

beforeEach(async () => {
  jest.clearAllMocks();
  global.fetch = fetchMock as typeof fetch;
  await i18n.changeLanguage("en");
});

const snapshot = {
  boards: [{ id: "main", title: "Main" }],
  active_board: { id: "main", title: "Main" },
  bots: [{ id: "bot1", name: "Helper", icon: "🤖", role_prompt: "Helps out", model_preset: "", max_concurrent: 1 }],
  tasks: [
    {
      id: "t1",
      title: "Ship feature",
      status: "todo",
      priority: "high",
      assignee_bot_id: "bot1",
      description: "",
    },
    {
      id: "t2",
      title: "Old work",
      status: "archived",
      priority: "low",
      assignee_bot_id: null,
      description: "",
    },
  ],
  links: [],
  messages: [],
};

const show = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <ThemeProvider>
        <KanbanScreen session={session} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

test("renders a task under its column and hides an archived task", async () => {
  mockGet.mockResolvedValue(snapshot);

  show();

  await waitFor(() => expect(screen.getByText("Ship feature")).toBeTruthy());
  expect(screen.getByText("To do (1)")).toBeTruthy();
  expect(screen.getByText("High")).toBeTruthy();
  expect(screen.getByText("Helper")).toBeTruthy();
  expect(screen.queryByText("Old work")).toBeNull();
});

test("choosing a new status POSTs move with Bearer and body id and status", async () => {
  mockGet.mockResolvedValue(snapshot);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ task: {} }) });

  show();
  await waitFor(() => expect(screen.getByText("Ship feature")).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByText("Ship feature"));
  });
  await act(async () => {
    fireEvent.press(screen.getByText("Running"));
  });

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledWith(
    "https://srv.test/api/ext/kanban/tasks/move",
    expect.objectContaining({
      method: "POST",
      credentials: "omit",
      headers: expect.objectContaining({ Authorization: "Bearer api-token-secret" }),
      body: JSON.stringify({ id: "t1", status: "running" }),
    }),
  );
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>;
  expect(body.token).toBeUndefined();
});

test("a payload without tasks is an error, not a crash", async () => {
  mockGet.mockResolvedValue({ active_board: { id: "main", title: "Main" } });
  await expect(fetchKanban(session, "main")).rejects.toThrow("kanban failed");
});

test("GET 404 shows the unavailable text and no add button", async () => {
  const err = new Error("not found");
  (err as Error & { status?: number }).status = 404;
  mockGet.mockRejectedValue(err);

  show();

  await waitFor(() => expect(screen.getByText("This server has no board yet.")).toBeTruthy());
  expect(screen.queryByRole("button", { name: "New task" })).toBeNull();
});

test("chat shows a message and Send POSTs mention after tapping bot chip", async () => {
  mockGet.mockResolvedValue({
    ...snapshot,
    messages: [{ id: "m1", author_name: "You", content: "Hello board" }],
  });
  fetchMock.mockResolvedValue({ ok: true });

  show();
  await waitFor(() => expect(screen.getByText("Ship feature")).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByRole("tab", { name: "Chat" }));
  });
  await waitFor(() => expect(screen.getByText("Hello board")).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByText("@Helper"));
  });
  await act(async () => {
    fireEvent.press(screen.getByText("Send"));
  });

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledWith(
    "https://srv.test/api/ext/kanban/messages/post",
    expect.objectContaining({
      method: "POST",
      credentials: "omit",
      headers: expect.objectContaining({ Authorization: "Bearer api-token-secret" }),
    }),
  );
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
    board_id: string;
    content: string;
    token?: string;
  };
  expect(body.board_id).toBe("main");
  expect(body.content).toContain("@bot1");
  expect(body.token).toBeUndefined();
});

test("review task approve and request changes POST with boolean approved", async () => {
  const reviewSnapshot = {
    ...snapshot,
    tasks: [
      ...snapshot.tasks,
      {
        id: "t-review",
        title: "Needs review",
        status: "review",
        priority: "medium",
        assignee_bot_id: null,
        description: "",
      },
    ],
  };
  mockGet.mockResolvedValue(reviewSnapshot);
  fetchMock.mockResolvedValue({ ok: true });

  show();
  await waitFor(() => expect(screen.getByText("Needs review")).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByText("Needs review"));
  });

  await act(async () => {
    fireEvent.changeText(screen.getByLabelText("Changes"), "Please fix tests");
  });
  await act(async () => {
    fireEvent.press(screen.getByText("Request changes"));
  });

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  let body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
    id: string;
    approved: boolean;
    feedback?: string;
  };
  expect(fetchMock.mock.calls[0][0]).toBe("https://srv.test/api/ext/kanban/tasks/review");
  expect(body.id).toBe("t-review");
  expect(body.approved).toBe(false);
  expect(typeof body.approved).toBe("boolean");
  expect(body.feedback).toBe("Please fix tests");

  fetchMock.mockClear();
  mockGet.mockResolvedValue(reviewSnapshot);

  await act(async () => {
    fireEvent.press(screen.getByText("Needs review"));
  });
  await act(async () => {
    fireEvent.press(screen.getByText("Approve"));
  });

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
    id: string;
    approved: boolean;
    feedback?: string;
  };
  expect(body.approved).toBe(true);
  expect(typeof body.approved).toBe("boolean");
  expect(body.feedback).toBeUndefined();
});

test("bot delete opens confirm and POSTs id only after confirm", async () => {
  mockGet.mockResolvedValue(snapshot);
  fetchMock.mockResolvedValue({ ok: true });

  show();
  await waitFor(() => expect(screen.getByText("Helper")).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByRole("tab", { name: "Bots" }));
  });
  await act(async () => {
    fireEvent.press(screen.getByText("Helper"));
  });
  await act(async () => {
    fireEvent.press(screen.getByText("Delete bot"));
  });

  expect(fetchMock).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.press(screen.getAllByText("Delete bot")[1]);
  });

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledWith(
    "https://srv.test/api/ext/kanban/bots/delete",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer api-token-secret" }),
      body: JSON.stringify({ id: "bot1" }),
    }),
  );
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>;
  expect(Object.keys(body)).toEqual(["id"]);
});
