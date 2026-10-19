import "../../src/platform/install";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { kv } from "../../src/platform/storage";
import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";
import { outboxStore } from "../../src/extras/outbox";
import { Composer } from "../../src/screens/thread/Composer";
import { fakeSession, flush } from "../state/fake";

const KEY = "websocket:c1";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  for (const k of kv.keys()) kv.del(k);
  const f = fakeSession();
  // Offline: the outbox keeps what it is given, so the bar has something to show.
  sessionStore.setState({ session: f.session, state: "offline" as never, profile: { id: "p1", name: "U", baseUrl: "https://h", hasSecret: true } });
  outboxStore.setState({ activeProfileId: "p1", queues: {} });
  threadStore.setState({
    threads: { [KEY]: { messages: [], running: true, notices: [], draft: "", loaded: true, queuedMessages: [], pendingFiles: [] } as never },
  });
});

afterEach(() => {
  threadStore.setState({ threads: {} });
  outboxStore.setState({ activeProfileId: null, queues: {} });
});

const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <Composer chatKey={KEY} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

const queueOutbox = (text: string) => act(async () => { outboxStore.getState().enqueue(KEY, text); await flush(); });
const queueBehindBot = (id: string, text: string) =>
  act(async () => {
    const slice = threadStore.getState().threads[KEY];
    threadStore.setState({ threads: { [KEY]: { ...slice, queuedMessages: [...(slice.queuedMessages ?? []), { id, text }] } } });
    await flush();
  });

const line = (n: number) => (n === 1 ? "1 message waiting — tap to manage" : `${n} messages waiting — tap to manage`);

test("with nothing waiting the bar is not there", async () => {
  await mount();
  expect(screen.queryByText(/waiting — tap to manage/)).toBeNull();
});

test("outbox and queued messages share one collapsed line", async () => {
  await mount();
  await queueOutbox("sent when online");
  await queueBehindBot("q1", "sent after the bot");

  expect(screen.getAllByText(/waiting — tap to manage/)).toHaveLength(1);
  expect(screen.getByText(line(2))).toBeTruthy();
  expect(screen.getByRole("button", { name: line(2) }).props.accessibilityState.expanded).toBe(false);
  expect(screen.queryByText("sent when online")).toBeNull();
  expect(screen.queryByText("sent after the bot")).toBeNull();
  expect(screen.queryByText("Send now")).toBeNull();
});

test("one waiting message reads in the singular", async () => {
  await mount();
  await queueBehindBot("q1", "only one");
  expect(screen.getByText(line(1))).toBeTruthy();
});

test("tapping the line lists both kinds with their actions, tapping again hides them", async () => {
  await mount();
  await queueOutbox("sent when online");
  await queueBehindBot("q1", "sent after the bot");

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: line(2) }));
  });

  expect(screen.getByRole("button", { name: line(2) }).props.accessibilityState.expanded).toBe(true);
  expect(screen.getByText("Not sent yet")).toBeTruthy();
  expect(screen.getByText("sent when online")).toBeTruthy();
  expect(screen.getByText("Pending")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  expect(screen.getByText("Waiting for the bot to finish")).toBeTruthy();
  expect(screen.getByText("sent after the bot")).toBeTruthy();
  expect(screen.getByText("Send now")).toBeTruthy();
  expect(screen.getByText("Edit")).toBeTruthy();
  expect(screen.getByText("Delete")).toBeTruthy();

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: line(2) }));
  });
  expect(screen.queryByText("sent when online")).toBeNull();
  expect(screen.queryByText("sent after the bot")).toBeNull();
});

test("the count follows the lists and the bar starts collapsed again after it empties", async () => {
  await mount();
  await queueOutbox("sent when online");
  await queueBehindBot("q1", "sent after the bot");
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: line(2) }));
  });

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  });
  expect(screen.getByText(line(1))).toBeTruthy();
  expect(screen.getByText("sent after the bot")).toBeTruthy();

  await act(async () => {
    fireEvent.press(screen.getByText("Delete"));
  });
  expect(screen.queryByText(/waiting — tap to manage/)).toBeNull();

  await queueBehindBot("q2", "a new one");
  expect(screen.getByText(line(1))).toBeTruthy();
  expect(screen.queryByText("a new one")).toBeNull();
});
