import "../../src/platform/install";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { sessionStore } from "../../src/state/sessionStore";
import { createThreadStore, threadStore } from "../../src/state/threadStore";
import { Composer } from "../../src/screens/thread/Composer";
import { fakeSession, flush, thread } from "../state/fake";

const KEY = "websocket:c1";

beforeAll(async () => {
  await i18n.changeLanguage("it");
});

/** The queue is one collapsed line; open it to reach the cards. */
const expandQueue = async (r: { getByRole: (role: string, opts: { name: RegExp }) => unknown }) => {
  await act(async () => {
    fireEvent.press(r.getByRole("button", { name: /in attesa — tocca per gestire/ }) as never);
    await flush();
  });
};

describe("Part 4: Messages sent while running go into visible queue", () => {
  test("sending while running queues message in state and shows card", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session, state: "open" as never, profile: { id: "p1", name: "U", baseUrl: "https://h", hasSecret: true } });
    threadStore.setState({
      threads: {
        [KEY]: {
          messages: [],
          running: true,
          notices: [],
          preset: null,
          model: null,
          temporary: false,
          forkBoundary: null,
          draft: "",
          loaded: true,
          stopped: false,
          sendError: null,
          uploading: false,
          pendingFiles: [],
          queuedMessages: [],
        },
      },
    });

    const r = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <Composer chatKey={KEY} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    // Type in draft via TextInput
    const input = r.getByPlaceholderText("Scrivi a nanobot…");
    await act(async () => {
      fireEvent.changeText(input, "messaggio in coda");
      await flush();
    });

    // Press Send (labeled with composer.steer while running)
    await act(async () => {
      fireEvent.press(r.getByLabelText(i18n.t("composer.steer")));
      await flush();
    });

    // Client sendMessage was NOT called
    expect(f.sent).toHaveLength(0);

    // Collapsed line first, card after expanding
    expect(r.getByText("1 messaggio in attesa — tocca per gestire")).toBeTruthy();
    expect(r.queryByText("messaggio in coda")).toBeNull();
    await expandQueue(r);
    expect(r.getByText("messaggio in coda")).toBeTruthy();
    expect(r.getByText("Invia ora")).toBeTruthy();
    expect(r.getByText("Modifica")).toBeTruthy();
    expect(r.getByText("Elimina")).toBeTruthy();
    expect(threadStore.getState().threads[KEY].queuedMessages).toHaveLength(1);
    r.unmount();
  });

  test("'Invia ora' steers the queued message", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session, state: "open" as never, profile: { id: "p1", name: "U", baseUrl: "https://h", hasSecret: true } });
    threadStore.setState({
      threads: {
        [KEY]: {
          messages: [],
          running: true,
          notices: [],
          preset: null,
          model: null,
          temporary: false,
          forkBoundary: null,
          draft: "",
          loaded: true,
          stopped: false,
          sendError: null,
          uploading: false,
          pendingFiles: [],
          queuedMessages: [{ id: "q1", text: "steer questo" }],
        },
      },
    });

    const r = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <Composer chatKey={KEY} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    await expandQueue(r);
    expect(r.getByText("steer questo")).toBeTruthy();

    // Click "Invia ora"
    await act(async () => {
      fireEvent.press(r.getByText("Invia ora"));
      await flush();
    });

    expect(f.sent).toHaveLength(1);
    expect(f.sent[0]).toMatchObject({
      chatId: "c1",
      content: "steer questo",
      options: expect.objectContaining({ startsNewRun: false }),
    });
    expect(threadStore.getState().threads[KEY].queuedMessages).toHaveLength(0);
    expect(r.queryByTestId("queued-card-q1")).toBeNull();
    r.unmount();
  });

  test("'Modifica' refills the composer and removes card", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session, state: "open" as never, profile: { id: "p1", name: "U", baseUrl: "https://h", hasSecret: true } });
    threadStore.setState({
      threads: {
        [KEY]: {
          messages: [],
          running: true,
          notices: [],
          preset: null,
          model: null,
          temporary: false,
          forkBoundary: null,
          draft: "",
          loaded: true,
          stopped: false,
          sendError: null,
          uploading: false,
          pendingFiles: [],
          queuedMessages: [{ id: "q2", text: "testo da modificare" }],
        },
      },
    });

    const r = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <Composer chatKey={KEY} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    await expandQueue(r);
    expect(r.getByText("testo da modificare")).toBeTruthy();

    // Click "Modifica"
    await act(async () => {
      fireEvent.press(r.getByText("Modifica"));
      await flush();
    });

    // Card removed
    expect(threadStore.getState().threads[KEY].queuedMessages).toHaveLength(0);
    expect(r.queryByTestId("queued-card-q2")).toBeNull();

    // Composer draft refilled
    expect(threadStore.getState().threads[KEY].draft).toBe("testo da modificare");
    r.unmount();
  });

  test("'Elimina' removes the card from queue", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session, state: "open" as never, profile: { id: "p1", name: "U", baseUrl: "https://h", hasSecret: true } });
    threadStore.setState({
      threads: {
        [KEY]: {
          messages: [],
          running: true,
          notices: [],
          preset: null,
          model: null,
          temporary: false,
          forkBoundary: null,
          draft: "",
          loaded: true,
          stopped: false,
          sendError: null,
          uploading: false,
          pendingFiles: [],
          queuedMessages: [{ id: "q3", text: "cancella questo" }],
        },
      },
    });

    const r = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <Composer chatKey={KEY} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    await expandQueue(r);
    expect(r.getByText("cancella questo")).toBeTruthy();

    // Click "Elimina"
    await act(async () => {
      fireEvent.press(r.getByText("Elimina"));
      await flush();
    });

    expect(threadStore.getState().threads[KEY].queuedMessages).toHaveLength(0);
    expect(r.queryByTestId("queued-card-q3")).toBeNull();
    expect(f.sent).toHaveLength(0);
    expect(threadStore.getState().threads[KEY].draft).toBe("");
    r.unmount();
  });

  test("turn_end sends the first card, and leaves the rest", async () => {
    const f = fakeSession({
      [`/api/sessions/${encodeURIComponent(KEY)}/webui-thread`]: thread([]),
    });
    sessionStore.setState({ session: f.session, state: "open" as never, profile: { id: "p1", name: "U", baseUrl: "https://h", hasSecret: true } });
    const store = createThreadStore();
    await store.getState().load(f.session, KEY);

    // Initial send starts run
    store.getState().send(f.session, KEY, "primo messaggio");
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0].content).toBe("primo messaggio");
    expect(store.getState().threads[KEY].running).toBe(true);

    // Send while running adds to queue
    store.getState().send(f.session, KEY, "coda 1");
    store.getState().send(f.session, KEY, "coda 2");
    expect(store.getState().threads[KEY].queuedMessages).toHaveLength(2);
    expect(f.sent).toHaveLength(1); // not sent yet

    // Bot finishes current turn
    f.emit("c1", { event: "turn_end", turn_id: "t1" });

    // First card was sent as a new message!
    expect(f.sent).toHaveLength(2);
    expect(f.sent[1].content).toBe("coda 1");
    expect(f.sent[1].options?.startsNewRun).toBeUndefined(); // starts a new turn!
    expect(store.getState().threads[KEY].running).toBe(true);

    // Second card is still in queue
    expect(store.getState().threads[KEY].queuedMessages).toHaveLength(1);
    expect(store.getState().threads[KEY].queuedMessages![0].text).toBe("coda 2");

    // Second turn finishes -> sends second card
    f.emit("c1", { event: "turn_end", turn_id: "t2" });
    expect(f.sent).toHaveLength(3);
    expect(f.sent[2].content).toBe("coda 2");
    expect(store.getState().threads[KEY].queuedMessages).toHaveLength(0);
  });
});
