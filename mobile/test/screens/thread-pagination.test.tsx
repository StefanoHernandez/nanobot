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

beforeAll(() => i18n.changeLanguage("it"));

const seen: string[] = [];
jest.mock("../../src/ui/markdown/Markdown", () => {
  const { Text } = require("react-native");
  return {
    Markdown: ({ text }: { text: string }) => {
      seen.push(text);
      return <Text>{text}</Text>;
    },
  };
});

const KEY = "websocket:c1";

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
});

afterEach(async () => {
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
  seen.length = 0;
  threadStore.setState({ threads: {} });
});

test("CH-A part 1: load older messages with 3 pages, stops at has_more_before false, and reconnect preserves older pages", async () => {
  const page3 = thread([
    { event: "user_message", chat_id: "c1", text: "q3", starts_turn: true, turn_id: "t3" },
    { event: "message", chat_id: "c1", text: "ans3", turn_id: "t3" },
    { event: "turn_end", chat_id: "c1", turn_id: "t3" },
  ], {
    page: { before_cursor: "cur2", has_more_before: true },
  });

  const page2 = thread([
    { event: "user_message", chat_id: "c1", text: "q2", starts_turn: true, turn_id: "t2" },
    { event: "message", chat_id: "c1", text: "ans2", turn_id: "t2" },
    { event: "turn_end", chat_id: "c1", turn_id: "t2" },
  ], {
    page: { before_cursor: "cur1", has_more_before: true },
  });

  const page1 = thread([
    { event: "user_message", chat_id: "c1", text: "q1", starts_turn: true, turn_id: "t1" },
    { event: "message", chat_id: "c1", text: "ans1", turn_id: "t1" },
    { event: "turn_end", chat_id: "c1", turn_id: "t1" },
  ], {
    page: { before_cursor: null, has_more_before: false },
  });

  const basePath = `/api/sessions/${encodeURIComponent(KEY)}/webui-thread`;
  const routes = {
    [basePath]: () => page3,
    [`${basePath}?before=cur2`]: () => page2,
    [`${basePath}?before=cur1`]: () => page1,
  };

  const f = fakeSession(routes);
  sessionStore.setState({ session: f.session, state: "open" as never });

  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <ThreadScreen chatKey={KEY} onBack={() => {}} />
      </ThemeProvider>
    </SafeAreaProvider>
  );

  await act(flush);
  expect(seen).toContain("ans3");
  expect(seen).not.toContain("ans2");
  expect(seen).not.toContain("ans1");

  // Load older page (page 2)
  await act(async () => {
    await threadStore.getState().loadOlder(KEY);
  });
  await act(flush);

  expect(seen).toContain("ans2");
  expect(seen).toContain("ans3");
  expect(seen).not.toContain("ans1");

  // Load older page (page 1)
  await act(async () => {
    await threadStore.getState().loadOlder(KEY);
  });
  await act(flush);

  expect(seen).toContain("ans1");
  expect(seen).toContain("ans2");
  expect(seen).toContain("ans3");

  const msgs = threadStore.getState().threads[KEY]?.messages ?? [];
  const contents = msgs.map((m) => m.content);
  // Verify order and no duplicates
  expect(contents).toEqual(["q1", "ans1", "q2", "ans2", "q3", "ans3"]);

  // has_more_before: false stops it - further loadOlder calls do nothing
  const callCountBefore = f.get.mock.calls.length;
  await act(async () => {
    await threadStore.getState().loadOlder(KEY);
  });
  await act(flush);
  expect(f.get.mock.calls.length).toBe(callCountBefore);

  // A reconnect must keep the older pages
  await act(async () => {
    f.setStatus("reconnecting");
    f.setStatus("open");
  });
  await act(flush);
  await act(flush);

  const msgsAfterReconnect = threadStore.getState().threads[KEY]?.messages ?? [];
  expect(msgsAfterReconnect.map((m) => m.content)).toEqual(["q1", "ans1", "q2", "ans2", "q3", "ans3"]);
});

test("CH-A part 1: FlatList onEndReached triggers loadOlder and shows spinner while loading", async () => {
  let resolvePage2!: (val: unknown) => void;
  const page2Promise = new Promise((r) => {
    resolvePage2 = r;
  });

  const page3 = thread([
    { event: "user_message", chat_id: "c1", text: "q3", starts_turn: true, turn_id: "t3" },
    { event: "message", chat_id: "c1", text: "ans3", turn_id: "t3" },
    { event: "turn_end", chat_id: "c1", turn_id: "t3" },
  ], {
    page: { before_cursor: "cur2", has_more_before: true },
  });

  const page2 = thread([
    { event: "user_message", chat_id: "c1", text: "q2", starts_turn: true, turn_id: "t2" },
    { event: "message", chat_id: "c1", text: "ans2", turn_id: "t2" },
    { event: "turn_end", chat_id: "c1", turn_id: "t2" },
  ], {
    page: { before_cursor: null, has_more_before: false },
  });

  const basePath = `/api/sessions/${encodeURIComponent(KEY)}/webui-thread`;
  const routes = {
    [basePath]: () => page3,
    [`${basePath}?before=cur2`]: () => page2Promise,
  };

  const f = fakeSession(routes);
  sessionStore.setState({ session: f.session, state: "open" as never });

  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <ThreadScreen chatKey={KEY} onBack={() => {}} />
      </ThemeProvider>
    </SafeAreaProvider>
  );

  await act(flush);
  expect(screen.queryByTestId("loading-older")).toBeNull();

  const flatList = screen.getByTestId("message-flatlist");

  // Trigger onEndReached
  await act(async () => {
    flatList.props.onEndReached();
  });

  // Spinner should be visible while loading
  expect(screen.getByTestId("loading-older")).toBeTruthy();

  // Resolve page 2
  await act(async () => {
    resolvePage2(page2);
  });
  await act(flush);

  // Spinner should disappear
  expect(screen.queryByTestId("loading-older")).toBeNull();
  expect(seen).toContain("ans2");
});
