import "../../src/platform/install";
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { buildShellHtml } from "../../src/screens/viewer/ArtifactWebView";
import { FileViewer } from "../../src/screens/viewer/FileViewer";
import { artifactStore } from "../../src/screens/viewer/artifactStore";
import { kv } from "../../src/platform/storage";
import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";
import { chatsStore } from "../../src/state/chatsStore";
import {
  getArtifactState,
  setArtifactState,
  clearArtifactState,
  clearArtifactStateForChat,
  hasArtifactState,
  MAX_STATE_BYTES,
} from "../../src/artifacts/artifactState";

beforeAll(async () => {
  await i18n.changeLanguage("it");
});

const mockInjectJavaScript = jest.fn();
let capturedWebViewProps: any = null;

jest.mock("react-native-webview", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    WebView: React.forwardRef((props: any, ref: any) => {
      capturedWebViewProps = props;
      React.useImperativeHandle(ref, () => ({
        injectJavaScript: mockInjectJavaScript,
      }));
      return <View testID="webview" {...props} />;
    }),
  };
});

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    replace: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => true),
}));

jest.mock("expo-linking", () => ({
  openURL: jest.fn(async () => true),
}));

jest.mock("expo-screen-orientation", () => ({
  OrientationLock: { LANDSCAPE: "LANDSCAPE", PORTRAIT_UP: "PORTRAIT_UP" },
  lockAsync: jest.fn(async () => {}),
}));

jest.mock("expo-print", () => ({
  printToFileAsync: jest.fn(async () => ({ uri: "file:///cache/artifacts/preview.pdf" })),
}));

const mockFileFactory = jest.fn();
jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation((...args) => mockFileFactory(...args)),
  Directory: jest.fn(),
  Paths: { cache: { uri: "file:///cache" } },
}));

const wrap = async (ui: React.ReactElement) => {
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 640 },
        insets: { top: 24, left: 0, bottom: 24, right: 0 },
      }}
    >
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
};

describe("AR-B: window.nanobot bridge and artifact state", () => {
  beforeEach(() => {
    mockInjectJavaScript.mockClear();
    capturedWebViewProps = null;
    artifactStore.clear();
    // Clear MMKV keys
    for (const k of kv.keys()) {
      if (k.startsWith("artifact-state:")) kv.del(k);
    }
  });

  afterEach(async () => {
    await cleanup();
    artifactStore.clear();
    threadStore.setState({ threads: {} });
    sessionStore.setState({ session: null, state: "none" as never, profile: null });
  });

  test("Shell contains the bridge for html and react, not for other kinds", () => {
    const htmlShell = buildShellHtml({ kind: "html", html: "<p>test</p>" });
    expect(htmlShell).toContain("window.nanobot =");
    expect(htmlShell).toContain("window.__nanobotBridgeCallback");

    const reactShell = buildShellHtml({ kind: "react", html: "function App() { return <h1>Test</h1>; }" });
    expect(reactShell).toContain("window.nanobot =");
    expect(reactShell).toContain("window.__nanobotBridgeCallback");

    const otherKinds = ["svg", "mermaid", "chart", "map", "pdf", "docx", "pptx", "xlsx"] as const;
    for (const kind of otherKinds) {
      const shell = buildShellHtml({ kind, html: "<test></test>" });
      expect(shell).not.toContain("window.nanobot =");
      expect(shell).not.toContain("window.__nanobotBridgeCallback");
    }
  });

  test("state.set then reopen -> state.get returns it", async () => {
    const chatKey = "chat-123";
    const artifactId = "todo-list";
    const sampleState = { items: ["latte", "pane"], done: [false, true] };

    await setArtifactState(chatKey, artifactId, sampleState);
    expect(hasArtifactState(chatKey, artifactId)).toBe(true);

    const retrieved = await getArtifactState(chatKey, artifactId);
    expect(retrieved).toEqual(sampleState);

    // Verify key in MMKV
    const raw = kv.get(`artifact-state:${chatKey}:${artifactId}`);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual(sampleState);
  });

  test("state.set > 64 KB is rejected with clear error", async () => {
    const chatKey = "chat-123";
    const artifactId = "large-data";
    // 64 KB is 65536 bytes
    const hugeString = "x".repeat(MAX_STATE_BYTES + 10);
    const hugeState = { data: hugeString };

    await expect(setArtifactState(chatKey, artifactId, hugeState)).rejects.toThrow(
      /64 KB/i,
    );
  });

  test("reset clears saved state in MMKV and memory", async () => {
    const chatKey = "chat-123";
    const artifactId = "todo-list";
    await setArtifactState(chatKey, artifactId, { item: "latte" });
    expect(hasArtifactState(chatKey, artifactId)).toBe(true);

    clearArtifactState(chatKey, artifactId);
    expect(hasArtifactState(chatKey, artifactId)).toBe(false);
    expect(await getArtifactState(chatKey, artifactId)).toBeNull();
    expect(kv.get(`artifact-state:${chatKey}:${artifactId}`)).toBeNull();
  });

  test("deleting the chat clears its keys", async () => {
    const chatKey = "chat-abc";
    await setArtifactState(chatKey, "art-1", { foo: "bar" });
    await setArtifactState(chatKey, "art-2", { baz: 123 });
    await setArtifactState("other-chat", "art-1", { keep: true });

    expect(kv.get(`artifact-state:${chatKey}:art-1`)).toBeTruthy();
    expect(kv.get(`artifact-state:${chatKey}:art-2`)).toBeTruthy();
    expect(kv.get(`artifact-state:other-chat:art-1`)).toBeTruthy();

    clearArtifactStateForChat(chatKey);

    expect(kv.get(`artifact-state:${chatKey}:art-1`)).toBeNull();
    expect(kv.get(`artifact-state:${chatKey}:art-2`)).toBeNull();
    expect(kv.get(`artifact-state:other-chat:art-1`)).toBeTruthy();
  });

  test("Reset dati entry in viewer menu resets state", async () => {
    const chatKey = "chat-xyz";
    const artifactId = "checklist";
    await setArtifactState(chatKey, artifactId, { done: true });

    artifactStore.set("<div>test</div>", "preview.html", { id: artifactId });
    await wrap(<FileViewer uri="" name="preview.html" chatKey={chatKey} />);

    // Menu button (dots-vertical) should be visible because artifact has saved state
    const menuBtn = screen.getByLabelText("Altro");
    expect(menuBtn).toBeTruthy();
    await fireEvent.press(menuBtn);

    // Reset dati option appears
    const resetOption = await screen.findByText("Reset dati");
    expect(resetOption).toBeTruthy();
    await fireEvent.press(resetOption);

    expect(hasArtifactState(chatKey, artifactId)).toBe(false);
    expect(await getArtifactState(chatKey, artifactId)).toBeNull();
  });

  test("send opens the dialog with the text; confirm sends once to the right chat", async () => {
    const chatKey = "websocket:chat-send";
    const artifactId = "app-1";
    const mockSession = { client: { id: "test-client" } } as any;

    sessionStore.setState({
      session: mockSession,
      state: "open" as never,
      profile: null,
    });

    const mockSend = jest.fn(() => true);
    threadStore.setState({
      threads: {
        [chatKey]: {
          messages: [{ id: "m1", role: "assistant", content: "test" }],
        } as any,
      },
      send: mockSend as any,
    });

    artifactStore.set("<div>test</div>", "preview.html", { id: artifactId });
    await wrap(<FileViewer uri="" name="preview.html" chatKey={chatKey} />);

    // Trigger nanobotSend through onMessage
    await act(async () => {
      await capturedWebViewProps.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: "nanobotSend",
            id: "req-1",
            text: "Ho finito la lista",
          }),
        },
      });
    });

    // Dialog opens with title and text
    expect(screen.getByText("L'artefatto vuole inviare al bot:")).toBeTruthy();
    expect(screen.getByText("Ho finito la lista")).toBeTruthy();

    // Confirm send
    await fireEvent.press(screen.getByText("Invia"));

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      mockSession,
      chatKey,
      "Ho finito la lista",
      { steer: true },
    );

    // Verify response sent to webview
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"id":"req-1"'),
    );
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"result":true'),
    );
  });

  test("send cancel -> false", async () => {
    const chatKey = "websocket:chat-send";
    const artifactId = "app-1";
    const mockSession = { client: { id: "test-client" } } as any;

    sessionStore.setState({
      session: mockSession,
      state: "open" as never,
      profile: null,
    });

    const mockSend = jest.fn(() => true);
    threadStore.setState({
      threads: {
        [chatKey]: {
          messages: [{ id: "m1", role: "assistant", content: "test" }],
        } as any,
      },
      send: mockSend as any,
    });

    artifactStore.set("<div>test</div>", "preview.html", { id: artifactId });
    await wrap(<FileViewer uri="" name="preview.html" chatKey={chatKey} />);

    await act(async () => {
      await capturedWebViewProps.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: "nanobotSend",
            id: "req-cancel",
            text: "Richiesta da annullare",
          }),
        },
      });
    });

    expect(screen.getByText("L'artefatto vuole inviare al bot:")).toBeTruthy();
    await fireEvent.press(screen.getByText("Annulla"));

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"result":false'),
    );
  });

  test("second request while open -> false", async () => {
    const chatKey = "chat-send";
    const artifactId = "app-1";
    sessionStore.setState({
      session: { client: {} } as any,
      state: "open" as never,
      profile: null,
    });
    threadStore.setState({
      threads: { [chatKey]: { messages: [{ id: "m1" }] } as any },
      send: jest.fn(() => true) as any,
    });

    artifactStore.set("<div>test</div>", "preview.html", { id: artifactId });
    await wrap(<FileViewer uri="" name="preview.html" chatKey={chatKey} />);

    // First request
    await act(async () => {
      await capturedWebViewProps.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: "nanobotSend",
            id: "req-1",
            text: "Primo messaggio",
          }),
        },
      });
    });

    mockInjectJavaScript.mockClear();

    // Second request while dialog is still open
    await act(async () => {
      await capturedWebViewProps.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: "nanobotSend",
            id: "req-2",
            text: "Secondo messaggio contemporaneo",
          }),
        },
      });
    });

    // Second request immediately receives false
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"id":"req-2"'),
    );
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"result":false'),
    );
  });

  test("> 4000 chars -> false without dialog", async () => {
    const chatKey = "chat-send";
    const artifactId = "app-1";
    sessionStore.setState({
      session: { client: {} } as any,
      state: "open" as never,
      profile: null,
    });
    threadStore.setState({
      threads: { [chatKey]: { messages: [{ id: "m1" }] } as any },
      send: jest.fn(() => true) as any,
    });

    artifactStore.set("<div>test</div>", "preview.html", { id: artifactId });
    await wrap(<FileViewer uri="" name="preview.html" chatKey={chatKey} />);

    mockInjectJavaScript.mockClear();

    const over4000 = "a".repeat(4001);
    await act(async () => {
      await capturedWebViewProps.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: "nanobotSend",
            id: "req-too-long",
            text: over4000,
          }),
        },
      });
    });

    expect(screen.queryByText("L'artefatto vuole inviare al bot:")).toBeNull();
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"id":"req-too-long"'),
    );
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"result":false'),
    );
  });

  test("no chat -> false without dialog", async () => {
    artifactStore.set("<div>test</div>", "preview.html", { id: "app-nochat" });
    // chatKey is empty
    await wrap(<FileViewer uri="" name="preview.html" chatKey="" />);

    mockInjectJavaScript.mockClear();

    await act(async () => {
      await capturedWebViewProps.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: "nanobotSend",
            id: "req-nochat",
            text: "Ciao",
          }),
        },
      });
    });

    expect(screen.queryByText("L'artefatto vuole inviare al bot:")).toBeNull();
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"id":"req-nochat"'),
    );
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"result":false'),
    );
  });

  test("artifacts opened from file (no chat or no id): state works in memory only for session", async () => {
    // Artifact without chatKey or without id
    const memState = { counter: 42 };
    await setArtifactState(undefined, undefined, memState);

    const retrieved = await getArtifactState(undefined, undefined);
    expect(retrieved).toEqual(memState);

    // Verify MMKV does not contain it
    for (const k of kv.keys()) {
      expect(k).not.toContain("artifact-state:undefined");
    }
  });
});
