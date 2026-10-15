import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { threadStore } from "../../src/state/threadStore";
import { sessionStore } from "../../src/state/sessionStore";
import { fakeSession } from "../state/fake";
import { GalleryScreen, collectThreadFiles, collectThreadImages } from "../../src/screens/gallery/GalleryScreen";
import { ThreadScreen } from "../../src/screens/thread/ThreadScreen";
import { downloadMedia } from "../../src/screens/thread/media/media";
import type { UIMessage } from "@/lib/types";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
}));

jest.mock("../../src/screens/thread/media/media", () => {
  const actual = jest.requireActual("../../src/screens/thread/media/media");
  return {
    ...actual,
    downloadMedia: jest.fn(async (url: string, name: string) => `file:///cache/media/${name}`),
    shareMedia: jest.fn(async () => {}),
    openLocal: jest.fn(async () => {}),
  };
});

const wrap = async (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  jest.clearAllMocks();
  threadStore.setState({ threads: {} });
  sessionStore.setState({
    session: fakeSession().session,
    state: "open" as never,
    profile: { baseUrl: "https://example.com" } as never,
  });
});

describe("F-A: collectThreadFiles", () => {
  test("mixes user/assistant images, a PDF, an .m4a and an .mp4, checks kinds/roles, de-duplicates URL and keeps order", () => {
    const messages: UIMessage[] = [
      {
        id: "m1",
        role: "user",
        content: "here is an image",
        createdAt: 1000,
        images: [{ url: "/user-photo.png", name: "user-photo.png" }],
      } as UIMessage,
      {
        id: "m2",
        role: "assistant",
        content: "here is a pdf document",
        createdAt: 2000,
        media: [{ url: "/report.pdf", name: "report.pdf", kind: "file" }],
      } as UIMessage,
      {
        id: "m3",
        role: "user",
        content: "audio recording",
        createdAt: 3000,
        media: [{ url: "/voice.m4a", name: "voice.m4a", kind: "file" }],
      } as UIMessage,
      {
        id: "m4",
        role: "assistant",
        content: "video clip",
        createdAt: 4000,
        media: [{ url: "/clip.mp4", name: "clip.mp4", kind: "video" }],
      } as UIMessage,
      {
        id: "m5",
        role: "assistant",
        content: "duplicate pdf reference",
        createdAt: 5000,
        media: [{ url: "/report.pdf", name: "report.pdf", kind: "file" }],
      } as UIMessage,
      {
        id: "m6",
        role: "assistant",
        content: "assistant image",
        createdAt: 6000,
        media: [{ url: "/bot-photo.jpg", name: "bot-photo.jpg", kind: "image" }],
      } as UIMessage,
    ];

    const files = collectThreadFiles(messages, "https://example.com");

    // 5 unique files (m5 duplicate report.pdf dropped)
    expect(files).toHaveLength(5);

    expect(files[0]).toEqual({
      url: "https://example.com/user-photo.png",
      name: "user-photo.png",
      kind: "image",
      role: "user",
      createdAt: 1000,
    });

    expect(files[1]).toEqual({
      url: "https://example.com/report.pdf",
      name: "report.pdf",
      kind: "file",
      role: "assistant",
      createdAt: 2000,
    });

    expect(files[2]).toEqual({
      url: "https://example.com/voice.m4a",
      name: "voice.m4a",
      kind: "audio",
      role: "user",
      createdAt: 3000,
    });

    expect(files[3]).toEqual({
      url: "https://example.com/clip.mp4",
      name: "clip.mp4",
      kind: "video",
      role: "assistant",
      createdAt: 4000,
    });

    expect(files[4]).toEqual({
      url: "https://example.com/bot-photo.jpg",
      name: "bot-photo.jpg",
      kind: "image",
      role: "assistant",
      createdAt: 6000,
    });

    // collectThreadImages on top of collectThreadFiles keeps working
    const images = collectThreadImages(messages, "https://example.com");
    expect(images).toEqual([
      { url: "https://example.com/user-photo.png", name: "user-photo.png" },
      { url: "https://example.com/bot-photo.jpg", name: "bot-photo.jpg" },
    ]);
  });
});

describe("F-A: GalleryScreen with Files tab", () => {
  test("with only files it opens on the File tab and shows file info", async () => {
    const key = "websocket:chat-files";
    threadStore.setState({
      threads: {
        [key]: {
          messages: [
            {
              id: "m1",
              role: "assistant",
              content: "here is a report",
              createdAt: 100,
              media: [{ url: "/summary.pdf", name: "summary.pdf", kind: "file" }],
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
          pendingFiles: [],
          forkBoundary: null,
          temporary: false,
        },
      },
    });

    await wrap(<GalleryScreen chatKey={key} />);

    // Opened on the File tab automatically because no images
    expect(screen.getByText("summary.pdf")).toBeTruthy();
    expect(screen.getByText(/From bot|Dal bot/i)).toBeTruthy();
  });

  test("the File row tap with a .pdf calls downloadMedia, then navigates to /viewer", async () => {
    const key = "websocket:chat-pdf";
    threadStore.setState({
      threads: {
        [key]: {
          messages: [
            {
              id: "m1",
              role: "user",
              content: "sent pdf",
              createdAt: 100,
              media: [{ url: "/specs.pdf", name: "specs.pdf", kind: "file" }],
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
          pendingFiles: [],
          forkBoundary: null,
          temporary: false,
        },
      },
    });

    (downloadMedia as jest.Mock).mockResolvedValueOnce("file:///cache/media/specs.pdf");

    await wrap(<GalleryScreen chatKey={key} />);

    const row = screen.getByText("specs.pdf");
    await act(async () => {
      fireEvent.press(row);
    });

    expect(downloadMedia).toHaveBeenCalledWith("https://example.com/specs.pdf", "specs.pdf");
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/viewer",
      params: { uri: "file:///cache/media/specs.pdf", name: "specs.pdf" },
    });
  });
});

describe("F-A: ThreadScreen header gallery button", () => {
  test("shows button with icon folder-multiple-image when chat has a PDF (non-image file)", async () => {
    const key = "websocket:chat-has-pdf";
    threadStore.setState({
      threads: {
        [key]: {
          messages: [
            {
              id: "m1",
              role: "user",
              content: "document attached",
              createdAt: 100,
              media: [{ url: "/report.pdf", name: "report.pdf", kind: "file" }],
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
          pendingFiles: [],
          forkBoundary: null,
          temporary: false,
        },
      },
    });

    await wrap(<ThreadScreen chatKey={key} onBack={() => {}} />);
    expect(screen.getByLabelText(/gallery|media e file/i)).toBeTruthy();
  });

  test("hides button when chat has no media at all", async () => {
    const key = "websocket:chat-no-media";
    threadStore.setState({
      threads: {
        [key]: {
          messages: [
            {
              id: "m1",
              role: "user",
              content: "plain text message",
              createdAt: 100,
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
          pendingFiles: [],
          forkBoundary: null,
          temporary: false,
        },
      },
    });

    await wrap(<ThreadScreen chatKey={key} onBack={() => {}} />);
    expect(screen.queryByLabelText(/gallery|media e file/i)).toBeNull();
  });
});
