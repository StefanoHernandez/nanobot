import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { Composer } from "../../src/screens/thread/Composer";
import { i18n } from "../../src/i18n";
import { prefs } from "../../src/settings/prefs";
import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";

jest.mock("../../src/extras/sttEngine", () => ({
  DeviceSttEngine: class {
    on() {
      return () => undefined;
    }
    async start() {}
    async stop() {
      return "hello";
    }
    async cancel() {}
  },
  isRecognitionAvailable: () => true,
  isVoiceAvailable: () => true,
  warnEngineUnavailableOnce: jest.fn(),
}));

jest.mock("../../src/extras/voice", () => ({
  useVoiceInput: () => ({
    state: "idle",
    start: jest.fn(),
    stop: jest.fn(async () => null),
    cancel: jest.fn(),
    error: null,
    elapsedMs: 0,
  }),
  voiceAvailable: () => false,
}));

const preset = {
  name: "writer",
  provider: "openai",
  model: "m",
  max_tokens: 100,
  context_window_tokens: 200000,
  temperature: 0.1,
  reasoning_effort: "medium",
  reasoning_effort_values: ["low", "medium", "high"],
  is_default: false,
  active: true,
};

beforeAll(async () => {
  await i18n.changeLanguage("en");
  prefs.setVoiceEngine("device");
});

beforeEach(() => {
  threadStore.setState({
    threads: {
      "websocket:c1": {
        messages: [
          {
            id: "m1",
            role: "assistant",
            kind: "message",
            usage: { context_tokens: 1000 },
            contextWindowTokens: 10000,
          } as never,
        ],
        running: false,
        model: null,
        preset: null,
        notices: [],
        draft: "",
        loaded: true,
        stopped: false,
        sendError: null,
        uploading: false,
        hydrating: false,
        pendingFiles: [],
        forkBoundary: null,
        temporary: false,
      },
    },
  });
  sessionStore.setState({
    session: {
      get: async (path: string) => {
        if (path === "/api/sessions") return { sessions: [{ key: "websocket:c1", model_preset: "writer" }] };
        if (path.startsWith("/api/settings")) return { model_presets: [preset] };
        return {};
      },
      client: { onRuntimeModelUpdate: () => () => {}, onChat: () => () => {} },
    } as never,
    state: "open",
    profile: null,
  });
});

afterEach(() => {
  sessionStore.setState({ session: null, state: "none", profile: null });
  threadStore.setState({ threads: {} });
});

test("recording hides the effort and context controls, and stopping brings them back", async () => {
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <Composer chatKey="websocket:c1" />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByLabelText("Reasoning: Medium")).toBeTruthy();
  expect(screen.getByLabelText("Context")).toBeTruthy();

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Voice input"));
  });
  expect(await screen.findByLabelText("Stop recording")).toBeTruthy();
  expect(screen.queryByLabelText("Reasoning: Medium")).toBeNull();
  expect(screen.queryByLabelText("Context")).toBeNull();

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Stop recording"));
  });
  await waitFor(() => expect(screen.getByLabelText("Reasoning: Medium")).toBeTruthy());
  expect(screen.getByLabelText("Context")).toBeTruthy();
  expect(screen.queryByLabelText("Stop recording")).toBeNull();
});
