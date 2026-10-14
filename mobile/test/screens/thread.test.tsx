import "../../src/platform/install";
import { i18n } from "../../src/i18n";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";
import { fakeSession, flush, thread } from "../state/fake";
import { ThreadScreen } from "../../src/screens/thread/ThreadScreen";

beforeAll(() => i18n.changeLanguage("it"));
const seen: string[] = [];
jest.mock("../../src/ui/markdown/Markdown", () => {
  const { Text } = require("react-native");
  return { Markdown: ({ text }: { text: string }) => { seen.push(text); return <Text>{text}</Text>; } };
});

const KEY = "websocket:c1";
const T = { turn_id: "t1" };

async function mount(key = KEY, history = thread([])) {
  const f = fakeSession({ [`/api/sessions/${encodeURIComponent(key)}/webui-thread`]: () => history });
  sessionStore.setState({ session: f.session, state: "open" as never });
  await render(<ThemeProvider><ThreadScreen chatKey={key} onBack={() => {}} /></ThemeProvider>);
  return f;
}
const emit = (f: ReturnType<typeof fakeSession>, ev: Record<string, unknown>) => act(() => f.emit("c1", ev));

// FlatList schedules batched-render timers; run them under act and drain before teardown.
beforeEach(() => { jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] }); });
afterEach(async () => {
  await act(async () => { jest.runOnlyPendingTimers(); });
  jest.useRealTimers();
  seen.length = 0;
  threadStore.setState({ threads: {} });
});

test("a delta re-renders only the streaming row", async () => {
  const f = await mount(KEY, thread([
    { event: "user_message", chat_id: "c1", text: "q1", starts_turn: true, turn_id: "t0" },
    { event: "message", chat_id: "c1", text: "old answer", turn_id: "t0" },
    { event: "turn_end", chat_id: "c1", turn_id: "t0" },
  ]));
  await act(flush);
  expect(seen).toContain("old answer");
  await emit(f, { event: "user_message", text: "q2", starts_turn: true, ...T });
  await emit(f, { event: "delta", text: "Hel", stream_id: "s", ...T });
  seen.length = 0;
  await emit(f, { event: "delta", text: "lo", stream_id: "s", ...T });
  expect(seen).toEqual(["Hello"]);
});

test("reasoning block toggles", async () => {
  const f = await mount();
  await act(flush);
  await emit(f, { event: "user_message", text: "q", starts_turn: true, ...T });
  await emit(f, { event: "reasoning_delta", text: "secret thoughts", ...T });
  await emit(f, { event: "delta", text: "answer", stream_id: "s", ...T });
  await emit(f, { event: "reasoning_end", ...T });
  await emit(f, { event: "stream_end", stream_id: "s", ...T });
  await emit(f, { event: "turn_end", ...T });
  await fireEvent.press(screen.getByText(/Lavorato/));
  expect(screen.queryByText("secret thoughts")).toBeNull();
  await fireEvent.press(screen.getByText("Ragionamento"));
  expect(screen.getByText("secret thoughts")).toBeTruthy();
  await fireEvent.press(screen.getByText("Ragionamento"));
  expect(screen.queryByText("secret thoughts")).toBeNull();
});

test("activity row shows tool count and expands", async () => {
  const f = await mount();
  await act(flush);
  await emit(f, { event: "user_message", text: "q", starts_turn: true, ...T });
  await emit(f, { event: "message", text: "read_file(a.py)", kind: "tool_hint", ...T });
  await emit(f, { event: "message", text: "done", ...T });
  await emit(f, { event: "turn_end", ...T });
  const head = screen.getByText(/Lavorato.*1 strument/);
  expect(screen.queryByText("read_file(a.py)")).toBeNull();
  await fireEvent.press(head);
  expect(screen.getByText("read_file(a.py)")).toBeTruthy();
});

test("Stop only while running and calls stop()", async () => {
  const f = await mount();
  await act(flush);
  expect(screen.queryByLabelText("Ferma")).toBeNull();
  await emit(f, { event: "user_message", text: "q", starts_turn: true, ...T });
  await fireEvent.press(screen.getByLabelText("Ferma"));
  expect(f.sent.at(-1)?.content).toBe("/stop");
  expect(screen.queryByLabelText("Ferma")).toBeNull();
});

test("writable chat has the composer slot", async () => {
  await mount();
  await act(flush);
  expect(screen.getByLabelText("Invia")).toBeTruthy();
});

test("non-writable chat has no composer slot", async () => {
  await mount("telegram:9");
  await act(flush);
  expect(screen.queryByLabelText("Invia")).toBeNull();
  expect(screen.getByText("Chat in sola lettura")).toBeTruthy();
});

test("notice is localized by kind", async () => {
  const f = await mount();
  await act(flush);
  await emit(f, { event: "context_compaction", phase: "succeeded" });
  expect(screen.getByText("Contesto compattato")).toBeTruthy();
});

test("mounting ThreadScreen loads once and replays vendor-buffered events", async () => {
  const path = `/api/sessions/${encodeURIComponent(KEY)}/webui-thread`;
  const f = fakeSession({ [path]: () => thread([]) }, { c1: [{ event: "message", text: "queued reply", turn_id: "tq" }] });
  sessionStore.setState({ session: f.session, state: "open" as never });
  await render(<ThemeProvider><ThreadScreen chatKey={KEY} onBack={() => {}} /></ThemeProvider>);
  await act(flush);
  expect(f.get.mock.calls.filter(([p]) => p === path)).toHaveLength(1);
  expect(f.attached.filter((id) => id === "c1")).toHaveLength(1);
  expect(seen).toContain("queued reply");
});
