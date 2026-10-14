import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { Composer } from "../../src/screens/thread/Composer";
import { SubagentsButton } from "../../src/screens/thread/SubagentsSheet";
import { SubagentThreadScreen } from "../../src/screens/thread/SubagentThreadScreen";
import { i18n } from "../../src/i18n";
import { useThreadSlice } from "../../src/state/threadStore";
import { useSession } from "../../src/state/sessionStore";
import { useVoiceInput, voiceAvailable } from "../../src/extras/voice";
import { loadSubagentThread, subagentsAvailable, useSubagents } from "../../src/state/subagentsStore";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastHost } from "../../src/ui/components";

jest.mock("../../src/extras/logic", () => ({ ...jest.requireActual("../../src/extras/logic"), loadCommands: jest.fn().mockResolvedValue([]) }));
jest.mock("../../src/state/threadStore", () => ({
  useThreadSlice: jest.fn(),
  threadStore: jest.requireActual("../../src/state/threadStore").threadStore,
}));
jest.mock("../../src/state/sessionStore");
jest.mock("../../src/extras/voice");
jest.mock("../../src/state/subagentsStore");
jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }));

const slice = jest.fn();
const setDraft = jest.fn();
const send = jest.fn();
const voice = { state: "idle", elapsedMs: 0, error: null as string | null, start: jest.fn(), stop: jest.fn(), cancel: jest.fn() };
const cancelTask = jest.fn().mockResolvedValue(undefined);
const session = { get: jest.fn().mockResolvedValue({ transcription: {} }), client: { onRuntimeModelUpdate: () => () => {}, onChat: () => () => {} } };

const task = (id: string, state: string) => ({ task_id: id, label: `L-${id}`, state, created_at: 1, completed_at: null, elapsed_seconds: 5 });

beforeAll(async () => { await i18n.changeLanguage("en"); });
beforeEach(() => {
  jest.clearAllMocks();
  cancelTask.mockResolvedValue(undefined);
  voice.state = "idle"; voice.error = null;
  (useSession as jest.Mock).mockReturnValue({ session, state: "open" });
  (useThreadSlice as jest.Mock).mockReturnValue({ draft: "x", setDraft, send, running: false, stop: jest.fn() });
  (useVoiceInput as jest.Mock).mockImplementation(() => voice);
  (voiceAvailable as jest.Mock).mockReturnValue(true);
  (subagentsAvailable as jest.Mock).mockReturnValue(true);
});

const wrap = (el: React.ReactElement) =>
  render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><ThemeProvider>{el}<ToastHost /></ThemeProvider></SafeAreaProvider>);
const mountComposer = async () => { const r = await wrap(<Composer chatKey="websocket:c1" />); await act(async () => {}); return r; };

test("stop() transcript is appended to the draft, never sent", async () => {
  voice.state = "recording";
  voice.stop.mockResolvedValue("ciao");
  await mountComposer();
  await act(async () => { fireEvent.press(screen.getByLabelText("Stop recording")); });
  expect(setDraft).toHaveBeenCalledWith("x ciao");
  expect(send).not.toHaveBeenCalled();
});

test("voice error shows a toast", async () => {
  voice.error = "permission";
  await mountComposer();
  expect(screen.getByText(i18n.t("voice.error.permission"))).toBeTruthy();
});

test("no mic button when voice unavailable", async () => {
  (voiceAvailable as jest.Mock).mockReturnValue(false);
  await mountComposer();
  expect(screen.queryByLabelText("Voice input")).toBeNull();
});

test("badge counts active tasks", async () => {
  (useSubagents as jest.Mock).mockReturnValue({ tasks: [task("a", "running"), task("b", "done"), task("c", "queued")], refresh: jest.fn(), cancel: cancelTask });
  await wrap(<SubagentsButton chatKey="websocket:c1" />);
  expect(screen.getByText("2")).toBeTruthy();
});

test("cancel + confirm calls cancel(id) once", async () => {
  (useSubagents as jest.Mock).mockReturnValue({ tasks: [task("a", "running")], refresh: jest.fn(), cancel: cancelTask });
  await wrap(<SubagentsButton chatKey="websocket:c1" />);
  await fireEvent.press(screen.getByLabelText("Subagents"));
  await fireEvent.press(screen.getByText("Cancel task"));
  expect(cancelTask).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Confirm"));
  expect(cancelTask).toHaveBeenCalledTimes(1);
  expect(cancelTask).toHaveBeenCalledWith("a");
});

test("subagent thread renders messages, no composer", async () => {
  (loadSubagentThread as jest.Mock).mockResolvedValue([{ id: "m1", role: "assistant", content: "hello from sub", createdAt: 1 }]);
  (useSubagents as jest.Mock).mockReturnValue({ tasks: [task("a", "done")], refresh: jest.fn(), cancel: cancelTask });
  await wrap(<SubagentThreadScreen chatKey="websocket:c1" taskId="a" onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText("hello from sub")).toBeTruthy());
  expect(screen.queryByPlaceholderText("Message nanobot…")).toBeNull();
});
