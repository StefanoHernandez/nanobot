import "../../src/platform/install";
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { ToastHost } from "../../src/ui/components";
import { i18n } from "../../src/i18n";
import { ContextIndicator } from "../../src/screens/thread/ContextIndicator";
import { ContextPopover } from "../../src/screens/thread/ContextPopover";
import { WorkspaceButton, WorkspaceSheet } from "../../src/screens/thread/WorkspaceSheet";
import { MessageList } from "../../src/screens/thread/MessageList";
import { ThreadScreen } from "../../src/screens/thread/ThreadScreen";
import { useThread, useThreadSlice } from "../../src/state/threadStore";
import { useWorkspace, workspaceStore } from "../../src/state/workspace";
import { chatsStore } from "../../src/state/chatsStore";

jest.mock("../../src/state/threadStore", () => ({
  useThreadSlice: jest.fn(),
  useThread: jest.fn(),
  threadStore: jest.requireActual("../../src/state/threadStore").threadStore,
}));
jest.mock("../../src/state/workspace", () => ({ ...jest.requireActual("../../src/state/workspace"), useWorkspace: jest.fn() }));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("../../src/ui/markdown/Markdown", () => {
  const { Text } = require("react-native");
  return { Markdown: ({ text }: { text: string }) => <Text>{text}</Text> };
});
jest.mock("../../src/screens/thread/Composer", () => ({ Composer: () => null }));
jest.mock("../../src/screens/thread/SubagentsSheet", () => ({ SubagentsButton: () => null }));
jest.mock("../../src/extras/CommandDrawer", () => ({ CommandDrawerButton: () => null }));

const KEY = "websocket:c1";
const wrap = (el: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>{el}<ToastHost /></ThemeProvider>
    </SafeAreaProvider>,
  );

const round = (p: number, c: number) => ({ prompt_tokens: p, completion_tokens: c, cached_tokens: 0 });
const asst = (id: string, extra: Record<string, unknown> = {}) => ({ id, role: "assistant", content: `A-${id}`, createdAt: 1, turnId: id, ...extra });
const usr = (id: string) => ({ id, role: "user", content: `U-${id}`, createdAt: 1 });

const setScope = jest.fn();
const scope = { project_path: "/p", project_name: "proj", access_mode: "restricted" as const, restrict_to_workspace: true };
const info = { controls: { can_change_project: true }, recent_projects: [{ name: "r1", path: "/r1" }], favorite_projects: [{ name: "f1", path: "/f1" }] };

beforeAll(async () => { await i18n.changeLanguage("en"); });
beforeEach(() => {
  jest.clearAllMocks();
  workspaceStore.setState({ errors: {} });
  setScope.mockResolvedValue(undefined);
  (useWorkspace as jest.Mock).mockReturnValue({ scope, info, error: null, browse: jest.fn(), setScope });
  (useThreadSlice as jest.Mock).mockReturnValue({ messages: [], temporary: false, forkBoundary: null });
});

afterEach(async () => { await act(async () => {}); });
const settle = async () => { await act(async () => {}); };

test("indicator shows 50% and hides on null usage", async () => {
  (useThreadSlice as jest.Mock).mockReturnValue({ messages: [asst("a", { usage: { context_tokens: 64000 }, contextWindowTokens: 128000 })] });
  await wrap(<ContextIndicator chatKey={KEY} />);
  expect(screen.getByText("50%")).toBeTruthy();
});
test("indicator hidden without usage", async () => {
  await wrap(<ContextIndicator chatKey={KEY} />);
  expect(screen.queryByText(/%/)).toBeNull();
});

test("popover: 3 bars, oldest first", async () => {
  const messages = [
    asst("a", { usage: { context_tokens: 3000 }, contextWindowTokens: 128000, roundUsages: [round(1000, 10)] }),
    asst("b", { roundUsages: [round(2000, 10)] }),
    asst("c", { roundUsages: [round(3000, 10)] }),
  ] as never;
  await wrap(<ContextPopover open onClose={() => {}} messages={messages} />);
  const bars = screen.getAllByTestId("round-label");
  expect(bars.map((b) => b.props.children)).toEqual(["1k", "2k", "3k"]);
});

test("access switch calls setScope full", async () => {
  await wrap(<WorkspaceSheet chatKey={KEY} open onClose={() => {}} />);
  fireEvent(screen.getByLabelText("Full access"), "valueChange", true);
  await waitFor(() => expect(setScope).toHaveBeenCalled());
  expect(setScope).toHaveBeenCalledWith(expect.objectContaining({ access_mode: "full" }));
});
test("switch reverts and toasts on reject", async () => {
  setScope.mockRejectedValue(new Error("workspace_scope_timeout"));
  await wrap(<WorkspaceSheet chatKey={KEY} open onClose={() => {}} />);
  fireEvent(screen.getByLabelText("Full access"), "valueChange", true);
  await waitFor(() => expect(setScope).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByText(i18n.t("workspace.error"))).toBeTruthy());
  expect(screen.getByLabelText("Full access").props.value).toBe(false);
});

const flat = (n: unknown, out: string[] = []): string[] => {
  if (typeof n === "string") out.push(n);
  else if (Array.isArray(n)) n.forEach((x) => flat(x, out));
  else if (n && typeof n === "object") flat((n as { children?: unknown }).children, out);
  return out;
};

test("fork boundary divider sits between A-a1 and U-u2", async () => {
  const messages = [usr("u1"), asst("a1"), usr("u2")] as never;
  await wrap(<MessageList chatKey={KEY} messages={messages} running={false} notices={[]} forkBoundary={2} />);
  await screen.findByText("Forked here");
  const t = flat(screen.toJSON());
  const i = (x: string) => t.indexOf(x);
  // inverted list: newest first, so the divider is rendered after U-u2 and before A-a1
  expect(i("U-u2")).toBeLessThan(i("Forked here"));
  expect(i("Forked here")).toBeLessThan(i("A-a1"));
});

test("estimated rounds are marked with ~", async () => {
  const messages = [asst("a", { usage: { context_tokens: 3000 }, contextWindowTokens: 128000, roundUsages: [{ ...round(1000, 10), estimated_tokens: 5 }, round(2000, 10)] })] as never;
  await wrap(<ContextPopover open onClose={() => {}} messages={messages} />);
  expect(screen.getAllByTestId("round-label").map((b) => b.props.children)).toEqual(["~1k", "2k"]);
});

test("a server error without a reject also reverts the switch", async () => {
  setScope.mockImplementation(async () => { workspaceStore.getState().setError(KEY, "workspace_scope_rejected:x"); });
  await wrap(<WorkspaceSheet chatKey={KEY} open onClose={() => {}} />);
  fireEvent(screen.getByLabelText("Full access"), "valueChange", true);
  await screen.findByText(i18n.t("workspace.error"));
  expect(screen.getByLabelText("Full access").props.value).toBe(false);
});

test("can_change_project false hides the workspace button", async () => {
  (useWorkspace as jest.Mock).mockReturnValue({ scope, info: { ...info, controls: { can_change_project: false } }, error: null, browse: jest.fn(), setScope });
  await wrap(<WorkspaceButton chatKey={KEY} />);
  expect(screen.queryByLabelText("Workspace")).toBeNull();
});

test("workspace button shows when allowed", async () => {
  await wrap(<WorkspaceButton chatKey={KEY} />);
  expect(screen.getByLabelText("Workspace")).toBeTruthy();
});

test("tapping a recent folder sets that path", async () => {
  await wrap(<WorkspaceSheet chatKey={KEY} open onClose={() => {}} />);
  fireEvent.press(screen.getByText("r1"));
  await waitFor(() => expect(setScope).toHaveBeenCalledWith(expect.objectContaining({ project_path: "/r1" })));
});

test("browse into a folder, then .. goes to the parent", async () => {
  const dirs: Record<string, unknown> = {
    "/p": { path: "/p", parent: "/", entries: [{ name: "a", path: "/p/a" }], truncated: false, host: "h", platform: "p" },
    "/p/a": { path: "/p/a", parent: "/p", entries: [], truncated: false, host: "h", platform: "p" },
  };
  const browse = jest.fn(async (p: string) => dirs[p]);
  (useWorkspace as jest.Mock).mockReturnValue({ scope, info, error: null, browse, setScope });
  await wrap(<WorkspaceSheet chatKey={KEY} open onClose={() => {}} />);
  fireEvent.press(screen.getByText("Browse…"));
  fireEvent.press(await screen.findByText("a"));
  await screen.findByText("/p/a");
  expect(browse).toHaveBeenLastCalledWith("/p/a");
  fireEvent.press(screen.getByText(".."));
  await screen.findByText("/p");
  expect(browse).toHaveBeenLastCalledWith("/p");
});

test("temporary chat: label, no workspace button", async () => {
  (useThread as jest.Mock).mockReturnValue({ messages: [], running: false, notices: [], model: null, preset: null, temporary: true, forkBoundary: null });
  (useWorkspace as jest.Mock).mockReturnValue({ scope: null, info: null, error: null, browse: jest.fn(), setScope });
  await wrap(<ThreadScreen chatKey={KEY} onBack={() => {}} />);
  await settle();
  expect(await screen.findByText("Temporary")).toBeTruthy();
  expect(screen.queryByLabelText("Workspace")).toBeNull();
});

const fork = jest.fn();
const longPress = async (msgs: unknown[], text: string) => {
  await wrap(<MessageList chatKey={KEY} messages={msgs as never} running={false} notices={[]} forkBoundary={null} />);
  await settle();
  fireEvent(await screen.findByText(text), "longPress");
};
beforeEach(() => { fork.mockReset().mockResolvedValue("websocket:new"); chatsStore.setState({ fork } as never); });

test("long-press first assistant forks with index 1 and pushes", async () => {
  await longPress([usr("u1"), asst("a1"), usr("u2"), asst("a2")], "A-a1");
  fireEvent.press(await screen.findByText("Fork from here"));
  await waitFor(() => expect(fork).toHaveBeenCalledWith(KEY, 1));
  expect(router.push).toHaveBeenCalledWith("/chat/" + encodeURIComponent("websocket:new"));
});

test("trace rows between turns do not shift the index", async () => {
  const trace = { id: "t1", role: "assistant", kind: "trace", content: "", traces: ["tool"], createdAt: 1 };
  await longPress([usr("u1"), trace, asst("a1"), usr("u2"), trace && { ...trace, id: "t2" }, asst("a2")], "A-a1");
  fireEvent.press(await screen.findByText("Fork from here"));
  await waitFor(() => expect(fork).toHaveBeenCalledWith(KEY, 1));
});

test("last assistant forks with the user count", async () => {
  await longPress([usr("u1"), asst("a1"), usr("u2"), asst("a2")], "A-a2");
  fireEvent.press(await screen.findByText("Fork from here"));
  await waitFor(() => expect(fork).toHaveBeenCalledWith(KEY, 2));
});

test("a streaming row has no menu", async () => {
  await longPress([usr("s0"), asst("s1", { isStreaming: true })], "A-s1");
  expect(screen.queryByText("Fork from here")).toBeNull();
});

test("copy writes the text and toasts", async () => {
  await longPress([usr("u1"), asst("a1")], "A-a1");
  fireEvent.press(await screen.findByText("Copy"));
  await screen.findByText("Copied");
});
