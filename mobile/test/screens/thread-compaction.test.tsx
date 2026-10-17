import "../../src/platform/install";
import { i18n } from "../../src/i18n";
import React from "react";
import { act, render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";
import { fakeSession, flush, thread } from "../state/fake";
import { ThreadScreen } from "../../src/screens/thread/ThreadScreen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { toast } from "../../src/ui/components/Toast";

beforeAll(() => i18n.changeLanguage("it"));

jest.mock("../../src/ui/markdown/Markdown", () => {
  const { Text } = require("react-native");
  return {
    Markdown: ({ text }: { text: string }) => <Text>{text}</Text>,
  };
});

jest.mock("../../src/ui/components/Toast", () => {
  const actual = jest.requireActual("../../src/ui/components/Toast");
  return {
    ...actual,
    toast: {
      show: jest.fn(),
      setLift: jest.fn(),
    },
  };
});

const KEY = "websocket:c1";
const basePath = `/api/sessions/${encodeURIComponent(KEY)}/webui-thread`;
const contextPath = `/api/sessions/${encodeURIComponent(KEY)}/context`;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
  jest.clearAllMocks();
});

afterEach(async () => {
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
  threadStore.setState({ threads: {} });
});

test("CH-A part 2: transient notice goes away on terminal phase, and divider shows freed tokens", async () => {
  const history = thread([
    {
      event: "user_message",
      chat_id: "c1",
      text: "hello",
      starts_turn: true,
      turn_id: "t1",
    },
    {
      event: "message",
      chat_id: "c1",
      text: "world",
      turn_id: "t1",
    },
    {
      event: "turn_end",
      chat_id: "c1",
      turn_id: "t1",
      usage: { context_tokens: 12000 },
      context_window_tokens: 200000,
    },
  ]);

  const f = fakeSession({
    [basePath]: () => history,
    [contextPath]: () => ({ estimated_session_tokens: 4500 }),
  });
  sessionStore.setState({ session: f.session, state: "open" as never });

  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <ThreadScreen chatKey={KEY} onBack={() => {}} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
  await act(flush);

  // 1. Live context_compaction started: shows transient notice
  await act(async () => {
    f.emit("c1", {
      event: "context_compaction",
      compaction_id: "cmp1",
      phase: "started",
    });
  });
  await act(flush);

  expect(screen.getByText("Compattazione in corso…")).toBeTruthy();

  // 2. Succeeded: notice goes away, divider shows freed tokens
  await act(async () => {
    f.emit("c1", {
      event: "context_compaction",
      compaction_id: "cmp1",
      phase: "succeeded",
    });
  });
  await act(flush);
  await act(flush);

  // Notice should be gone
  expect(screen.queryByText("Compattazione in corso…")).toBeNull();

  // Compaction divider is rendered in the chat with freed tokens: 12000 - 4500 = 7500
  expect(screen.getByText(/Contesto compattato · liberati ~7500 token \(da 12000 a 4500\)/)).toBeTruthy();

  // Context indicator shows the value (4500 / 200000 = 2%) instead of hiding
  expect(screen.getByText("2%")).toBeTruthy();
});

test("CH-A part 2: failed compaction shows its own label", async () => {
  const history = thread([]);
  const f = fakeSession({
    [basePath]: () => history,
  });
  sessionStore.setState({ session: f.session, state: "open" as never });

  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <ThreadScreen chatKey={KEY} onBack={() => {}} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
  await act(flush);

  await act(async () => {
    f.emit("c1", {
      event: "context_compaction",
      compaction_id: "cmp2",
      phase: "failed",
    });
  });
  await act(flush);

  expect(screen.getByText("Compattazione non riuscita")).toBeTruthy();
});

test("CH-A part 2: /compact without an event shows the toast after 10 s", async () => {
  const history = thread([]);
  const f = fakeSession({
    [basePath]: () => history,
  });
  sessionStore.setState({ session: f.session, state: "open" as never });

  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <ThreadScreen chatKey={KEY} onBack={() => {}} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
  await act(flush);

  // User sends /compact
  await act(async () => {
    threadStore.getState().send(f.session, KEY, "/compact");
  });

  // Advance 9 seconds: no toast yet
  await act(async () => {
    jest.advanceTimersByTime(9000);
  });
  expect(toast.show).not.toHaveBeenCalledWith("Niente da compattare");

  // Advance 1 more second (10s total): toast shown
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(toast.show).toHaveBeenCalledWith("Niente da compattare");
});

test("CH-A part 2: on hydrate, if newest usage row is older than compaction row, fetch /context once and use it", async () => {
  const history = thread([
    {
      event: "user_message",
      chat_id: "c1",
      text: "hello",
      starts_turn: true,
      turn_id: "t1",
    },
    {
      event: "message",
      chat_id: "c1",
      text: "world",
      turn_id: "t1",
    },
    {
      event: "turn_end",
      chat_id: "c1",
      turn_id: "t1",
      usage: { context_tokens: 12000 },
      context_window_tokens: 200000,
    },
    {
      event: "context_compaction",
      chat_id: "c1",
      compaction_id: "cmp-old",
      phase: "succeeded",
    },
  ]);

  const f = fakeSession({
    [basePath]: () => history,
    [contextPath]: () => ({ estimated_session_tokens: 3000 }),
  });
  sessionStore.setState({ session: f.session, state: "open" as never });

  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <ThreadScreen chatKey={KEY} onBack={() => {}} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
  await act(flush);
  await act(flush);

  // /context was fetched
  expect(f.get).toHaveBeenCalledWith(contextPath);
  // Indicator is visible and shows 3000 / 200000 = 2% (or 1.5% -> 2%)
  expect(screen.getByText("2%")).toBeTruthy();
});
