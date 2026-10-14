import "../../src/platform/install";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { kv } from "../../src/platform/storage";
import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";
import { outboxStore } from "../../src/extras/outbox";
import { fakeSession, flush, thread } from "../state/fake";
import { ThreadScreen } from "../../src/screens/thread/ThreadScreen";

jest.mock("../../src/ui/markdown/Markdown", () => {
  const { Text } = require("react-native");
  return { Markdown: ({ text }: { text: string }) => <Text>{text}</Text> };
});

const KEY = "websocket:c1";

function makeFake(key = KEY, history = thread([])) {
  const f = fakeSession({ [`/api/sessions/${encodeURIComponent(key)}/webui-thread`]: () => history });
  jest.spyOn(f.client, "sendMessage");
  return f;
}

async function mount(key = KEY, profileId = "p1", history = thread([])) {
  const f = makeFake(key, history);
  sessionStore.setState({
    session: f.session,
    state: "open" as never,
    profile: { id: profileId, name: `User ${profileId}`, baseUrl: `https://${profileId}.example.com`, hasSecret: true },
  });
  await render(
    <ThemeProvider>
      <ThreadScreen chatKey={key} onBack={() => {}} />
    </ThemeProvider>,
  );
  return f;
}

const step = async (fn?: () => void) => {
  if (fn) {
    await act(async () => {
      fn();
    });
  }
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  await act(flush);
};

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
  for (const k of kv.keys()) {
    kv.del(k);
  }
  outboxStore.setState({ activeProfileId: null, queues: {} });
});

afterEach(async () => {
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
  threadStore.setState({ threads: {} });
});

describe("P5-O1: Offline outbox per chat", () => {
  test("1. Queue while offline: pressing Send enqueues to outbox & kv, clears draft, does not send, renders Pending", async () => {
    const f = await mount();
    await step();
    await step(() => {
      sessionStore.setState({ state: "offline" });
    });

    const input = screen.getByPlaceholderText("Message nanobot…");
    await step(() => fireEvent.changeText(input, "hello offline"));
    expect(threadStore.getState().threads[KEY]?.draft).toBe("hello offline");

    const sendBtn = screen.getByLabelText("Send");
    await step(() => fireEvent.press(sendBtn));

    // Enqueued in outboxStore
    const queue = outboxStore.getState().queues[KEY];
    expect(queue).toHaveLength(1);
    expect(queue[0].text).toBe("hello offline");
    expect(queue[0].paused).toBe(false);

    // Persisted in kv
    const stored = kv.get("outbox:v1:p1");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed[KEY]).toHaveLength(1);
    expect(parsed[KEY][0].text).toBe("hello offline");

    // Draft cleared
    expect(threadStore.getState().threads[KEY]?.draft).toBe("");

    // sendMessage was NOT called on client
    expect(f.client.sendMessage).not.toHaveBeenCalled();

    // OutboxBar renders the item with Pending label
    expect(screen.getByText("hello offline")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
  });

  test("2. Cancel: pressing Cancel removes from outbox and kv, nothing sent on reconnect", async () => {
    const f = await mount();
    await step();
    await step(() => {
      sessionStore.setState({ state: "offline" });
    });

    const input = screen.getByPlaceholderText("Message nanobot…");
    await step(() => fireEvent.changeText(input, "message to cancel"));
    const sendBtn = screen.getByLabelText("Send");
    await step(() => fireEvent.press(sendBtn));

    expect(screen.getByText("message to cancel")).toBeTruthy();
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    await step(() => fireEvent.press(cancelBtn));

    // Removed from outboxStore and kv
    expect(outboxStore.getState().queues[KEY] ?? []).toHaveLength(0);
    const stored = JSON.parse(kv.get("outbox:v1:p1") ?? "{}");
    expect(stored[KEY] ?? []).toHaveLength(0);
    expect(screen.queryByText("message to cancel")).toBeNull();

    // Reconnect to "open"
    await step(() => {
      sessionStore.setState({ state: "open" });
    });

    expect(f.client.sendMessage).not.toHaveBeenCalled();
  });

  test("3. FIFO send on reconnect (waiting for hydrate & idle): first sends, second waits until first finishes", async () => {
    const f = await mount();
    await step();
    await step(() => {
      sessionStore.setState({ state: "reconnecting" });
    });

    // Enqueue "first"
    const input = screen.getByPlaceholderText("Message nanobot…");
    await step(() => fireEvent.changeText(input, "first"));
    await step(() => fireEvent.press(screen.getByLabelText("Send")));

    // Enqueue "second"
    await step(() => fireEvent.changeText(input, "second"));
    await step(() => fireEvent.press(screen.getByLabelText("Send")));

    expect(outboxStore.getState().queues[KEY]).toHaveLength(2);
    expect(f.client.sendMessage).not.toHaveBeenCalled();

    // Transition sessionStore to "open" while threadStore has loaded: true, running: false
    await step(() => {
      sessionStore.setState({ state: "open" });
    });

    // "first" sent immediately, sendMessage called once with "first", setting running: true
    expect(f.client.sendMessage).toHaveBeenCalledTimes(1);
    expect(f.client.sendMessage).toHaveBeenCalledWith("c1", "first", undefined, expect.anything());
    expect(threadStore.getState().threads[KEY]?.running).toBe(true);

    // "second" is still waiting in queue because running: true
    expect(outboxStore.getState().queues[KEY]).toHaveLength(1);
    expect(outboxStore.getState().queues[KEY][0].text).toBe("second");

    // Once the first turn ends, "second" is sent automatically
    await step(() => {
      f.runStatus("c1", null);
    });

    expect(f.client.sendMessage).toHaveBeenCalledTimes(2);
    expect(f.client.sendMessage).toHaveBeenLastCalledWith("c1", "second", undefined, expect.anything());
    expect(outboxStore.getState().queues[KEY] ?? []).toHaveLength(0);
  });

  test("4. Profile switch never auto-sends: old items loaded with paused: true, send only on user tap", async () => {
    const f1 = await mount(KEY, "p1");
    await step();
    await step(() => {
      sessionStore.setState({ state: "offline" });
    });
    const f2 = makeFake(KEY);

    // Enqueue a message under p1
    const input = screen.getByPlaceholderText("Message nanobot…");
    await step(() => fireEvent.changeText(input, "message from p1"));
    await step(() => fireEvent.press(screen.getByLabelText("Send")));

    expect(outboxStore.getState().queues[KEY]).toHaveLength(1);

    // Switch sessionStore to profile p2 with state: "open"
    await step(() => {
      sessionStore.setState({
        session: f2.session,
        state: "open",
        profile: { id: "p2", name: "User 2", baseUrl: "https://p2.example.com", hasSecret: true },
      });
    });

    // Nothing from p1 is visible or sent under p2
    expect(screen.queryByText("message from p1")).toBeNull();
    expect(f1.client.sendMessage).not.toHaveBeenCalled();
    expect(f2.client.sendMessage).not.toHaveBeenCalled();

    // Switch back to p1 with state: "open"
    await step(() => {
      sessionStore.setState({
        session: f1.session,
        state: "open",
        profile: { id: "p1", name: "User 1", baseUrl: "https://p1.example.com", hasSecret: true },
      });
    });

    // Item loaded from kv has paused: true
    expect(screen.getByText("message from p1")).toBeTruthy();
    expect(screen.getByText("Pending — tap to send")).toBeTruthy();
    // Does NOT auto-send on profile switch
    expect(f1.client.sendMessage).not.toHaveBeenCalled();

    // User taps sendNow
    const sendNowBtn = screen.getByRole("button", { name: "Send now" });
    await step(() => fireEvent.press(sendNowBtn));

    // Now it is sent!
    expect(f1.client.sendMessage).toHaveBeenCalledTimes(1);
    expect(f1.client.sendMessage).toHaveBeenCalledWith("c1", "message from p1", undefined, expect.anything());
    expect(outboxStore.getState().queues[KEY] ?? []).toHaveLength(0);
  });

  describe("review fixes", () => {
    const slice = (over: Record<string, unknown> = {}) =>
      threadStore.setState({ threads: { [KEY]: { ...({} as never), loaded: true, running: false, uploading: false, hydrating: false, ...over } as never } });

    function setup(sendResult: boolean) {
      const f = makeFake();
      sessionStore.setState({ session: f.session, state: "open" as never, profile: { id: "p1", name: "U", baseUrl: "https://p1.example.com", hasSecret: true } });
      outboxStore.getState().syncProfile("p1");
      const send = jest.fn(() => sendResult);
      threadStore.setState({ send } as never);
      return send;
    }

    test("does not flush while the chat is re-hydrating after a reconnect", () => {
      const send = setup(true);
      slice({ hydrating: true });
      outboxStore.getState().enqueue(KEY, "a");
      expect(outboxStore.getState().flushNext(KEY)).toBe(false);
      expect(send).not.toHaveBeenCalled();
      slice({ hydrating: false });
      expect(outboxStore.getState().flushNext(KEY)).toBe(true);
      expect(outboxStore.getState().queues[KEY]).toHaveLength(0);
    });

    test("a refused send keeps the item queued (paused) instead of losing it", () => {
      const send = setup(false);
      slice();
      outboxStore.getState().enqueue(KEY, "a");
      expect(outboxStore.getState().flushNext(KEY)).toBe(false);
      expect(send).toHaveBeenCalledTimes(1);
      const q = outboxStore.getState().queues[KEY];
      expect(q).toHaveLength(1);
      expect(q[0].paused).toBe(true);
      expect(JSON.parse(kv.get("outbox:v1:p1") ?? "{}")[KEY]).toHaveLength(1);
    });

    test("send-now on a non-head paused item unpauses the queue so the head flushes", () => {
      const send = setup(true);
      slice({ running: true });
      outboxStore.getState().enqueue(KEY, "a");
      outboxStore.getState().enqueue(KEY, "b");
      outboxStore.setState({ queues: { [KEY]: outboxStore.getState().queues[KEY].map((it) => ({ ...it, paused: true })) } });
      const b = outboxStore.getState().queues[KEY][1];
      outboxStore.getState().resumeItem(KEY, b.id);
      expect(outboxStore.getState().queues[KEY].every((it) => !it.paused)).toBe(true);
      slice();
      outboxStore.getState().flushNext(KEY);
      expect(send).toHaveBeenCalledWith(expect.anything(), KEY, "a", undefined);
    });
  });
});
