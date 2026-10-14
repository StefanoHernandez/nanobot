import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { isViewerUriAllowed, FileViewer } from "../../src/screens/viewer/FileViewer";
import { absoluteMediaUrl } from "../../src/screens/thread/media/media";
import { threadStore } from "../../src/state/threadStore";
import { chatsStore } from "../../src/state/chatsStore";
import { subagentsStore, cancelSubagent } from "../../src/state/subagentsStore";
import { refreshSettings, settingsStore } from "../../src/settings/store";
import { sessionStore } from "../../src/state/sessionStore";
import { uploadFiles, LocalFile } from "../../src/core/upload";
import { pruneMentions } from "../../src/screens/thread/mentions";
import GalleryRoute from "../../app/gallery/[key]";
import ChatRoute from "../../app/(main)/chat/[key]";

let mockRouteParams: { key?: string } = {};
let mockFocusEffectCleanup: (() => void) | null = null;

const mockUseLocalSearchParams = jest.fn(() => mockRouteParams);
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useFocusEffect: (cb: any) => {
    const React = require("react");
    React.useEffect(() => {
      mockFocusEffectCleanup = cb?.();
      return () => {
        mockFocusEffectCleanup?.();
      };
    }, [cb]);
  },
}));

jest.mock("../../src/screens/gallery/GalleryScreen", () => ({
  GalleryScreen: ({ chatKey }: { chatKey: string }) => {
    const { Text } = require("react-native");
    return <Text testID="gallery-key">{chatKey}</Text>;
  },
}));

jest.mock("../../src/screens/thread/ThreadScreen", () => ({
  ThreadScreen: ({ chatKey, onBack }: { chatKey: string; onBack: () => void }) => {
    const { TouchableOpacity, Text } = require("react-native");
    return (
      <TouchableOpacity testID="thread-back-btn" onPress={onBack}>
        <Text testID="thread-key">{chatKey}</Text>
      </TouchableOpacity>
    );
  },
}));

const mockFileFactory = jest.fn();
jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation((...args) => mockFileFactory(...args)),
  Directory: jest.fn(),
  Paths: { cache: { uri: "file:///cache" } },
}));

const renderWithTheme = (ui: React.ReactElement) => {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
};

describe("FIX-A review fixes", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage("en");
  });

  // M2
  test("M2: absoluteMediaUrl passes file:, content: and data: URIs through unchanged", () => {
    const base = "https://agent.host.net";
    expect(absoluteMediaUrl(base, "file:///cache/media/photo.jpg")).toBe("file:///cache/media/photo.jpg");
    expect(absoluteMediaUrl(base, "content://media/external/images/media/42")).toBe("content://media/external/images/media/42");
    expect(absoluteMediaUrl(base, "data:image/png;base64,ABC")).toBe("data:image/png;base64,ABC");
    expect(absoluteMediaUrl(base, "/api/media/avatar.png")).toBe("https://agent.host.net/api/media/avatar.png");
  });

  // M1 (security / I12)
  test("M1: isViewerUriAllowed validates paths and prevents directory traversal", () => {
    expect(isViewerUriAllowed("file:///cache/media/doc.pdf")).toBe(true);
    expect(isViewerUriAllowed("file:///cache/media/sub/doc.pdf")).toBe(true);
    expect(isViewerUriAllowed("file:///cache/artifacts/output.txt")).toBe(true);
    expect(isViewerUriAllowed("file:///cache/temp/preview.py")).toBe(true);

    // Traversal attempts
    expect(isViewerUriAllowed("file:///cache/media/../secret.txt")).toBe(false);
    expect(isViewerUriAllowed("file:///cache/media/%2e%2e/secret.txt")).toBe(false);
    expect(isViewerUriAllowed("file:///cache/media/%252e%252e/secret.txt")).toBe(false);
    expect(isViewerUriAllowed("file:///cache/media/..")).toBe(false);
    expect(isViewerUriAllowed("file:///cache/media/%2e%2e")).toBe(false);

    // Disallowed schemes and root access
    expect(isViewerUriAllowed("file:///etc/passwd")).toBe(false);
    expect(isViewerUriAllowed("file:///data/data/com.nanobot/databases/app.db")).toBe(false);
    expect(isViewerUriAllowed("content://media/external/file")).toBe(false);
    expect(isViewerUriAllowed("https://malicious.com/file.txt")).toBe(false);
    expect(isViewerUriAllowed("")).toBe(false);
  });

  test("M1: FileViewer with a disallowed URI displays error and does not read the file", async () => {
    const mockText = jest.fn().mockResolvedValue("secret content");
    mockFileFactory.mockReturnValue({
      uri: "file:///etc/passwd",
      size: 50,
      text: mockText,
    });

    const { findByText } = await renderWithTheme(<FileViewer uri="file:///etc/passwd" name="passwd" />);

    expect(await findByText(/File not available/i)).toBeTruthy();
    expect(mockText).not.toHaveBeenCalled();
  });

  // I3
  test("I3: a stalled upload times out and sets sendError and uploading becomes false", async () => {
    const cap1 = { path: "/api/upload", token: "t1" };
    const file: LocalFile = {
      uri: "file:///test.png",
      name: "test.png",
      size: 100,
      mime: "image/png",
    };

    // upload_unavailable when cap is null
    await expect(uploadFiles({ uploadCapability: null } as any, [file])).rejects.toThrow("upload_unavailable");

    // Timeout throws upload_timed_out
    const abortSession = {
      uploadCapability: cap1,
      baseUrl: "https://agent.test",
    } as any;
    const originalFetch = global.fetch;
    global.fetch = jest.fn((_url: any, opts: any) => {
      return new Promise((_, reject) => {
        opts?.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    try {
      await expect(uploadFiles(abortSession, [file], 10)).rejects.toThrow("upload_timed_out");
    } finally {
      global.fetch = originalFetch;
    }
  });

  // M3
  test("M3: upload IIFE in threadStore drops operations if rt changed", async () => {
    const key = "test-chat-m3";
    const session = {
      uploadCapability: { path: "/upload", token: "tok" },
      baseUrl: "https://agent.test",
      client: {
        sendMessage: jest.fn(async () => "msg-1"),
      },
    } as any;

    const file: LocalFile = { uri: "file:///f.txt", name: "f.txt", size: 10, mime: "text/plain" };
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "att-1" }),
    });

    try {
      // Start send with files
      threadStore.getState().send(session, key, "hello", { files: [file] });
      // Reset threadStore (which clears rts or resets rt)
      threadStore.getState().reset();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      // The sendMessage should not have been called because rt was discarded
      expect(session.client.sendMessage).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  // M6
  test("M6: threadStore clearSendError clears the error", () => {
    const key = "test-chat-m6";
    threadStore.setState((s) => ({
      threads: {
        ...s.threads,
        [key]: {
          messages: [],
          running: false,
          model: null,
          preset: null,
          notices: [],
          draft: "",
          loaded: false,
          stopped: false,
          sendError: "upload_failed",
          uploading: false,
          pendingFiles: [],
          forkBoundary: null,
          temporary: false,
        },
      },
    }));
    expect(threadStore.getState().threads[key]?.sendError).toBe("upload_failed");

    threadStore.getState().clearSendError(key);
    expect(threadStore.getState().threads[key]?.sendError).toBeNull();
  });

  // M5
  test("M5: subagentsStore cancelSubagent drops snapshot if gen changed", async () => {
    const session = {
      mutate: jest.fn(async () => {
        // Increment gen while mutation is in flight by calling reset()
        subagentsStore.getState().reset();
        return {
          task_id: "task-1",
          revision: 1,
          label: "t",
          task_description: "d",
          phase: "p",
          state: "cancelled",
          elapsed_seconds: 1,
          iteration: 0,
          created_at: 1,
          completed_at: null,
          origin_turn_id: null,
          origin_message_id: null,
          result: null,
          error: null,
          stop_reason: null,
          partial: false,
          tool_events: [],
          receipts: {},
          usage: null,
        };
      }),
    } as any;

    await cancelSubagent(session, "key-1", "task-1");
    // After reset during cancel, tasks for key-1 should remain empty (not ingested)
    expect(subagentsStore.getState().tasks["key-1"]).toBeUndefined();
  });

  // M7
  test("M7: refreshSettings ignores error from previous session", async () => {
    const oldSession = {
      get: jest.fn(async () => {
        throw new Error("old session failed");
      }),
    } as any;
    const newSession = {
      get: jest.fn(async () => ({ agent: { model: "gpt-4" } })),
    } as any;

    sessionStore.setState({ session: newSession });
    settingsStore.setState({ error: null });

    await refreshSettings(oldSession);
    // Error from oldSession was dropped because active session is newSession
    expect(settingsStore.getState().error).toBeNull();
  });

  // M18
  test("M18: GalleryRoute preserves percent character without double decode", async () => {
    mockUseLocalSearchParams.mockReturnValue({ key: "chat%25special" });
    const { getByTestId } = await renderWithTheme(<GalleryRoute />);
    expect(getByTestId("gallery-key").props.children).toBe("chat%25special");
  });

  // I4
  test("I4: ChatRoute schedules leave for temporary chats on back and blur", async () => {
    const fakeSession = {
      id: "sess-1",
      client: {
        newTemporaryChat: jest.fn().mockResolvedValue("temp-42"),
        discardTemporaryChat: jest.fn(),
        onSessionUpdate: jest.fn(() => () => {}),
        onSidebarStateUpdate: jest.fn(() => () => {}),
        onError: jest.fn(() => () => {}),
      },
    } as any;

    chatsStore.getState().bind(fakeSession);
    const tempKey = await chatsStore.getState().newTemporaryChat();
    sessionStore.setState({ session: fakeSession });
    mockUseLocalSearchParams.mockReturnValue({ key: tempKey });

    const origSchedule = threadStore.getState().scheduleLeave;
    const origCancel = threadStore.getState().cancelLeave;
    const scheduleLeaveSpy = jest.fn();
    const cancelLeaveSpy = jest.fn();
    (threadStore.getState() as any).scheduleLeave = scheduleLeaveSpy;
    (threadStore.getState() as any).cancelLeave = cancelLeaveSpy;

    try {
      const { getByTestId } = await renderWithTheme(<ChatRoute />);
      expect(cancelLeaveSpy).toHaveBeenCalledWith(tempKey);

      // 1. Back button schedules leave
      const backBtn = getByTestId("thread-back-btn");
      fireEvent.press(backBtn);
      expect(scheduleLeaveSpy).toHaveBeenCalledWith(fakeSession, tempKey);

      // 2. Blur schedules leave
      scheduleLeaveSpy.mockClear();
      mockFocusEffectCleanup?.();
      expect(scheduleLeaveSpy).toHaveBeenCalledWith(fakeSession, tempKey);
    } finally {
      (threadStore.getState() as any).scheduleLeave = origSchedule;
      (threadStore.getState() as any).cancelLeave = origCancel;
    }
  });

  // I1
  test("I1: pruneMentions drops mentions not present in text", () => {
    const mentions = [
      { name: "coder", session_key: "s-1" },
      { name: "reviewer", session_key: "s-2" },
    ];
    // Text contains @coder only
    const result1 = pruneMentions("hello @coder check this out", mentions);
    expect(result1).toHaveLength(1);
    expect(result1[0].name).toBe("coder");

    // Text contains neither
    const result2 = pruneMentions("hello everyone", mentions);
    expect(result2).toHaveLength(0);
  });

  // I2
  test("I2: threadStore send keeps draft and pendingFiles on upload failure and marks row failed", async () => {
    const key = "websocket:test-i2";
    const session = {
      uploadCapability: { path: "/api/upload", token: "tok" },
      limits: { max_file_bytes: 1000, max_total_bytes: 5000, max_file_count: 5 },
      baseUrl: "https://agent.test",
      client: {
        sendMessage: jest.fn(),
      },
    } as any;

    const file: LocalFile = {
      uri: "file:///doc.pdf",
      name: "doc.pdf",
      size: 100,
      mime: "application/pdf",
    };

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("network error"));

    try {
      threadStore.getState().setDraft(key, "my draft text");
      threadStore.getState().setPendingFiles(key, [file]);

      const sent = threadStore.getState().send(session, key, "my draft text", { files: [file] });
      expect(sent).toBe(true);

      // Wait for async upload to reject and handle failure
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const thread = threadStore.getState().threads[key];
      expect(thread).toBeDefined();
      expect(thread.uploading).toBe(false);
      expect(thread.sendError).toBe("network error");
      // Draft and pendingFiles are preserved on failure
      expect(thread.draft).toBe("my draft text");
      expect(thread.pendingFiles).toHaveLength(1);
      // Row is marked deliveryStatus: "failed"
      const lastMsg = thread.messages[thread.messages.length - 1];
      expect(lastMsg.deliveryStatus).toBe("failed");
      expect(session.client.sendMessage).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
