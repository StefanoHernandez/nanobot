import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { sessionStore } from "../../src/state/sessionStore";
import { chatsStore } from "../../src/state/chatsStore";
import { toast } from "../../src/ui/components";
import { fakeSession } from "../state/fake";
import {
  approvalsStore,
  useApprovalsPolling,
  fetchApprovals,
  decideApproval,
  setApprovalsEnabled,
  forgetApproval,
  type ApprovalItem,
} from "../../src/extras/approvals";
import { ApprovalCard } from "../../src/extras/ApprovalCard";
import { ApprovalsCard } from "../../src/screens/settings/ApprovalsCard";

jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => {}),
  requestPermissionsAsync: jest.fn(async () => ({})),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 77 },
}));

jest.mock("../../src/ui/components/Toast", () => {
  const actual = jest.requireActual("../../src/ui/components/Toast");
  return {
    ...actual,
    toast: {
      show: jest.fn(),
    },
  };
});

const wrap = async (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("AP-A: approvals", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    approvalsStore.getState().reset();
    chatsStore.setState({ chats: [] });
    sessionStore.setState({
      session: null,
      state: "open" as never,
      profile: { id: "p1", baseUrl: "http://h", name: "nanobot" } as never,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("polling maps a GET payload into the store, and a profile switch clears it", async () => {
    const pendingItem: ApprovalItem = {
      id: "appr-1",
      session_key: "websocket:c1",
      tool: "exec",
      summary: "npm test",
      created_at: 1000,
      expires_in: 300,
    };

    const f = fakeSession({
      "/api/ext/approvals": () => ({
        enabled: true,
        pending: [pendingItem],
        allow: { "websocket:c1": ["exec"] },
      }),
    });
    sessionStore.setState({ session: f.session });

    await act(async () => {
      await approvalsStore.getState().refresh();
    });

    const state = approvalsStore.getState();
    expect(state.enabled).toBe(true);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0].summary).toBe("npm test");
    expect(state.allow).toEqual({ "websocket:c1": ["exec"] });

    // Profile switch clears store
    await act(async () => {
      sessionStore.setState({
        profile: { id: "p2", baseUrl: "http://h2", name: "other" } as never,
      });
    });

    const resetState = approvalsStore.getState();
    expect(resetState.pending).toHaveLength(0);
    expect(resetState.allow).toEqual({});
  });

  test("the card renders the summary and chat label. Allow, Deny and Always post the right bodies. After a decide, the next pending one shows", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    chatsStore.setState({
      chats: [{ key: "websocket:c1", title: "Project Phoenix" }] as never,
    });

    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response;
    });
    global.fetch = fetchMock as never;

    approvalsStore.setState({
      enabled: true,
      pending: [
        {
          id: "req-1",
          session_key: "websocket:c1",
          tool: "exec",
          summary: "cat /etc/hosts",
          created_at: 100,
          expires_in: 300,
        },
        {
          id: "req-2",
          session_key: "cron:backup",
          tool: "exec",
          summary: "tar -czf backup.tar.gz .",
          created_at: 200,
          expires_in: 250,
        },
      ],
      allow: {},
    });

    await wrap(<ApprovalCard />);

    // Oldest pending is req-1
    expect(screen.getByText("cat /etc/hosts")).toBeTruthy();
    expect(screen.getByText("Project Phoenix")).toBeTruthy();

    // 1. Press Allow
    const allowBtn = screen.getByRole("button", { name: /^allow$|^consenti$/i });
    await act(async () => {
      fireEvent.press(allowBtn);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/approvals/decide",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "req-1", allow: true, always: false }),
      }),
    );

    // After deciding req-1, req-2 is shown (cron -> Automation / Automazione)
    expect(screen.getByText("tar -czf backup.tar.gz .")).toBeTruthy();
    expect(screen.getByText(/automation|automazione/i)).toBeTruthy();

    // 2. Press Deny on req-2
    const denyBtn = screen.getByRole("button", { name: /deny|nega/i });
    await act(async () => {
      fireEvent.press(denyBtn);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/approvals/decide",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "req-2", allow: false, always: false }),
      }),
    );

    // 3. Test Always allow posts always: true
    await act(async () => {
      approvalsStore.setState({
        pending: [
          {
            id: "req-3",
            session_key: "websocket:c1",
            tool: "exec",
            summary: "pwd",
            created_at: 300,
            expires_in: 300,
          },
        ],
      });
    });

    const alwaysBtn = screen.getByRole("button", { name: /always allow|consenti sempre/i });
    await act(async () => {
      fireEvent.press(alwaysBtn);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/approvals/decide",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "req-3", allow: true, always: true }),
      }),
    );
  });

  test("a 404 on decide shows the expired toast and moves on", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    const fetchMock = jest.fn(async () => {
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: "not_found" }),
      } as Response;
    });
    global.fetch = fetchMock as never;

    approvalsStore.setState({
      enabled: true,
      pending: [
        {
          id: "expired-1",
          session_key: "websocket:c1",
          tool: "exec",
          summary: "sleep 1",
          created_at: 100,
          expires_in: 0,
        },
        {
          id: "valid-2",
          session_key: "kanban:main",
          tool: "exec",
          summary: "git status",
          created_at: 200,
          expires_in: 200,
        },
      ],
    });

    await wrap(<ApprovalCard />);
    expect(screen.getByText("sleep 1")).toBeTruthy();

    const allowBtn = screen.getByRole("button", { name: /^allow$|^consenti$/i });
    await act(async () => {
      fireEvent.press(allowBtn);
    });

    // Toast shown
    expect(toast.show).toHaveBeenCalledWith(expect.stringMatching(/expired|scaduto/i));

    // Moves on to the next pending one
    expect(screen.getByText("git status")).toBeTruthy();
    expect(screen.getByText("Kanban")).toBeTruthy();
  });

  test("the toggle posts settings. Remove asks for confirm and posts forget", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });
    chatsStore.setState({
      chats: [{ key: "websocket:c1", title: "Dev Chat" }] as never,
    });

    const fetchMock = jest.fn(async (url: string) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response;
    });
    global.fetch = fetchMock as never;

    approvalsStore.setState({
      enabled: false,
      allow: {
        "websocket:c1": ["exec"],
      },
    });

    await wrap(<ApprovalsCard />);

    // Toggle the switch
    const toggle = screen.getByRole("switch");
    await act(async () => {
      fireEvent(toggle, "valueChange", true);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/approvals/settings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ enabled: true }),
      }),
    );

    // Allowed chat is listed with Remove
    expect(screen.getByText("Dev Chat")).toBeTruthy();
    const removeBtn = screen.getByRole("button", { name: /remove|rimuovi/i });
    await act(async () => {
      fireEvent.press(removeBtn);
    });

    // Confirm dialog appears
    const confirmBtn = screen.getByRole("button", { name: /confirm|conferma|rimuovi/i });
    await act(async () => {
      fireEvent.press(confirmBtn);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/approvals/forget",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ session_key: "websocket:c1" }),
      }),
    );
  });

  test("a new pending id while AppState is background schedules exactly one notification, with no command text in it", async () => {
    const item: ApprovalItem = {
      id: "notif-1",
      session_key: "websocket:c1",
      tool: "exec",
      summary: "rm -rf /dangerous/path",
      created_at: 100,
      expires_in: 300,
    };

    const f = fakeSession({
      "/api/ext/approvals": () => ({
        enabled: true,
        pending: [item],
        allow: {},
      }),
    });
    sessionStore.setState({ session: f.session });

    // Put AppState in background
    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      value: "background",
    });

    await act(async () => {
      await approvalsStore.getState().refresh();
    });

    const sched = Notifications.scheduleNotificationAsync as jest.Mock;
    expect(sched).toHaveBeenCalledTimes(1);

    const callArg = sched.mock.calls[0][0];
    expect(callArg.trigger).toEqual({ channelId: "turns" });
    // Title is localized "Comando da approvare" / "Command needs approval"
    expect(callArg.content.title).toMatch(/approv/i);
    // Command text MUST NOT be in the notification
    expect(JSON.stringify(callArg)).not.toContain("rm -rf /dangerous/path");
    expect(JSON.stringify(callArg)).not.toContain("dangerous");

    // Second refresh with the same id does NOT notify again
    await act(async () => {
      await approvalsStore.getState().refresh();
    });
    expect(sched).toHaveBeenCalledTimes(1);
  });
});
