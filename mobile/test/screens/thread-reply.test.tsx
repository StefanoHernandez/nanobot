import "../../src/platform/install";
import React from "react";
import { act, fireEvent, render, within } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";
import { ThreadScreen } from "../../src/screens/thread/ThreadScreen";
import { fakeSession, flush, thread } from "../state/fake";

const KEY = "websocket:c1";

beforeAll(async () => {
  await i18n.changeLanguage("it");
});

describe("Part 5: Swipe a message to reply (quote)", () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    threadStore.setState({ threads: {} });
  });

  test("swipe right on message sets reply bar above composer", async () => {
    const f = fakeSession({
      [`/api/sessions/${encodeURIComponent(KEY)}/webui-thread`]: () =>
        thread([
          { event: "user_message", chat_id: "c1", text: "Domanda utente", turn_id: "t1", starts_turn: true },
          { event: "message", chat_id: "c1", text: "Risposta bot", turn_id: "t1" },
          { event: "turn_end", chat_id: "c1", turn_id: "t1" },
        ]),
    });
    sessionStore.setState({
      session: f.session,
      state: "open" as never,
      profile: { id: "p1", name: "U", baseUrl: "https://h", hasSecret: true },
    });

    const r = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <ThreadScreen chatKey={KEY} onBack={() => {}} />
        </ThemeProvider>
      </SafeAreaProvider>
    );

    await act(async () => {
      await flush();
      jest.runOnlyPendingTimers();
    });

    // Initially no reply bar
    expect(r.queryByTestId("reply-bar")).toBeNull();

    // Swipe user message
    const userSwipe = r.getByTestId("message-swipe-history-0");
    await act(async () => {
      fireEvent(userSwipe, "swipeableOpen", "left");
      await flush();
    });

    // Reply bar appears with "Tu" and preview
    const replyBar1 = r.getByTestId("reply-bar");
    expect(within(replyBar1).getByText("Tu")).toBeTruthy();
    expect(within(replyBar1).getByText("Domanda utente")).toBeTruthy();

    // Swipe bot message
    const botSwipe = r.getByTestId("message-swipe-history-1");
    await act(async () => {
      fireEvent(botSwipe, "swipeableOpen", "left");
      await flush();
    });

    // Reply bar now displays Nanobot and bot reply preview
    const replyBar2 = r.getByTestId("reply-bar");
    expect(within(replyBar2).getByText("Nanobot")).toBeTruthy();
    expect(within(replyBar2).getByText("Risposta bot")).toBeTruthy();

    r.unmount();
  });

  test("the X button clears the reply bar", async () => {
    const f = fakeSession({
      [`/api/sessions/${encodeURIComponent(KEY)}/webui-thread`]: () =>
        thread([
          { event: "user_message", chat_id: "c1", text: "Messaggio originale", turn_id: "t1", starts_turn: true },
          { event: "turn_end", chat_id: "c1", turn_id: "t1" },
        ]),
    });
    sessionStore.setState({
      session: f.session,
      state: "open" as never,
      profile: { id: "p1", name: "U", baseUrl: "https://h", hasSecret: true },
    });

    const r = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <ThreadScreen chatKey={KEY} onBack={() => {}} />
        </ThemeProvider>
      </SafeAreaProvider>
    );

    await act(async () => {
      await flush();
      jest.runOnlyPendingTimers();
    });

    // Swipe message to set reply
    const userSwipe = r.getByTestId("message-swipe-history-0");
    await act(async () => {
      fireEvent(userSwipe, "swipeableOpen", "left");
      await flush();
    });

    expect(r.getByTestId("reply-bar")).toBeTruthy();

    // Tap X to dismiss
    const closeBtn = r.getByTestId("reply-bar-close");
    await act(async () => {
      fireEvent.press(closeBtn);
      await flush();
    });

    // Reply bar is gone
    expect(r.queryByTestId("reply-bar")).toBeNull();
    expect(threadStore.getState().threads[KEY]?.replyingTo).toBeNull();

    r.unmount();
  });

  test("send prefixes the quote with > and clears reply bar", async () => {
    const f = fakeSession({
      [`/api/sessions/${encodeURIComponent(KEY)}/webui-thread`]: () =>
        thread([
          { event: "user_message", chat_id: "c1", text: "Prima riga\nSeconda riga", turn_id: "t1", starts_turn: true },
          { event: "turn_end", chat_id: "c1", turn_id: "t1" },
        ]),
    });
    sessionStore.setState({
      session: f.session,
      state: "open" as never,
      profile: { id: "p1", name: "U", baseUrl: "https://h", hasSecret: true },
    });

    const r = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <ThreadScreen chatKey={KEY} onBack={() => {}} />
        </ThemeProvider>
      </SafeAreaProvider>
    );

    await act(async () => {
      await flush();
      jest.runOnlyPendingTimers();
    });

    // Swipe message
    const userSwipe = r.getByTestId("message-swipe-history-0");
    await act(async () => {
      fireEvent(userSwipe, "swipeableOpen", "left");
      await flush();
    });

    // Type reply text in composer
    const input = r.getByPlaceholderText("Scrivi a nanobot…");
    await act(async () => {
      fireEvent.changeText(input, "Mia risposta");
      await flush();
    });

    // Send
    const sendBtn = r.getByLabelText(i18n.t("composer.send"));
    await act(async () => {
      fireEvent.press(sendBtn);
      await flush();
    });

    // Verify sent message format
    expect(f.sent).toHaveLength(1);
    const expected = "> Prima riga\n> Seconda riga\n\nMia risposta";
    expect(f.sent[0].content).toBe(expected);

    // Reply bar is cleared
    expect(r.queryByTestId("reply-bar")).toBeNull();
    expect(threadStore.getState().threads[KEY]?.replyingTo).toBeNull();

    r.unmount();
  });

  test("cut quote at 500 characters with …", async () => {
    const longOriginal = "A".repeat(600);
    const f = fakeSession({
      [`/api/sessions/${encodeURIComponent(KEY)}/webui-thread`]: () =>
        thread([
          { event: "user_message", chat_id: "c1", text: longOriginal, turn_id: "t1", starts_turn: true },
          { event: "turn_end", chat_id: "c1", turn_id: "t1" },
        ]),
    });
    sessionStore.setState({
      session: f.session,
      state: "open" as never,
      profile: { id: "p1", name: "U", baseUrl: "https://h", hasSecret: true },
    });

    const r = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <ThreadScreen chatKey={KEY} onBack={() => {}} />
        </ThemeProvider>
      </SafeAreaProvider>
    );

    await act(async () => {
      await flush();
      jest.runOnlyPendingTimers();
    });

    const userSwipe = r.getByTestId("message-swipe-history-0");
    await act(async () => {
      fireEvent(userSwipe, "swipeableOpen", "left");
      await flush();
    });

    const input = r.getByPlaceholderText("Scrivi a nanobot…");
    await act(async () => {
      fireEvent.changeText(input, "Risposta a messaggio lungo");
      await flush();
    });

    const sendBtn = r.getByLabelText(i18n.t("composer.send"));
    await act(async () => {
      fireEvent.press(sendBtn);
      await flush();
    });

    expect(f.sent).toHaveLength(1);
    const expectedQuote = `> ${"A".repeat(500)}…\n\nRisposta a messaggio lungo`;
    expect(f.sent[0].content).toBe(expectedQuote);

    r.unmount();
  });
});
