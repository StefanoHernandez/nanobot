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
import { downloadMedia, openLocal, shareMedia } from "../../src/screens/thread/media/media";
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
  jest.spyOn(threadStore.getState(), "load").mockImplementation(async () => {});
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

  test("dedupe edge case: does not lose an image whose URL was first seen as a non-image file", () => {
    const messages: UIMessage[] = [
      {
        id: "m1",
        role: "assistant",
        content: "file first",
        createdAt: 1000,
        media: [{ url: "/shared.png", name: "shared.png", kind: "file" }],
      } as UIMessage,
      {
        id: "m2",
        role: "user",
        content: "image later",
        createdAt: 2000,
        images: [{ url: "/shared.png", name: "shared.png" }],
      } as UIMessage,
    ];

    const files = collectThreadFiles(messages, "https://example.com");
    const images = collectThreadImages(messages, "https://example.com");
    expect(images).toEqual([
      { url: "https://example.com/shared.png", name: "shared.png" },
    ]);
    expect(files.some((f) => f.kind === "file" && f.url === "https://example.com/shared.png")).toBe(true);
    expect(files.some((f) => f.kind === "image" && f.url === "https://example.com/shared.png")).toBe(true);
  });

  test("roles: only user maps to user, assistant, tool and system all map to assistant", () => {
    const messages: UIMessage[] = [
      {
        id: "m1",
        role: "user",
        content: "user file",
        createdAt: 1000,
        media: [{ url: "/f1.pdf", name: "f1.pdf", kind: "file" }],
      } as UIMessage,
      {
        id: "m2",
        role: "assistant",
        content: "assistant file",
        createdAt: 2000,
        media: [{ url: "/f2.pdf", name: "f2.pdf", kind: "file" }],
      } as UIMessage,
      {
        id: "m3",
        role: "tool" as never,
        content: "tool file",
        createdAt: 3000,
        media: [{ url: "/f3.pdf", name: "f3.pdf", kind: "file" }],
      } as UIMessage,
      {
        id: "m4",
        role: "system" as never,
        content: "system file",
        createdAt: 4000,
        media: [{ url: "/f4.pdf", name: "f4.pdf", kind: "file" }],
      } as UIMessage,
    ];

    const files = collectThreadFiles(messages, "https://example.com");
    expect(files[0].role).toBe("user");
    expect(files[1].role).toBe("assistant");
    expect(files[2].role).toBe("assistant");
    expect(files[3].role).toBe("assistant");
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

  test("two quick presses on the same PDF row: downloadMedia called once, progress feedback shown, router.push called once", async () => {
    const key = "websocket:chat-double-press";
    threadStore.setState({
      threads: {
        [key]: {
          messages: [
            {
              id: "m1",
              role: "assistant",
              content: "file",
              createdAt: 100,
              media: [{ url: "/doc.pdf", name: "doc.pdf", kind: "file" }],
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

    let finishDownload: (uri: string) => void = () => {};
    (downloadMedia as jest.Mock).mockReturnValue(
      new Promise<string>((resolve) => {
        finishDownload = resolve;
      }),
    );

    await wrap(<GalleryScreen chatKey={key} />);
    const row = screen.getByLabelText(/doc\.pdf/i);

    // Press twice quickly while download is in progress
    await act(async () => {
      fireEvent.press(row);
      fireEvent.press(row);
    });

    // Progress feedback: shows ActivityIndicator in place of icon with label media.opening
    expect(screen.getByLabelText(/opening/i)).toBeTruthy();

    // Complete the download
    await act(async () => {
      finishDownload("file:///cache/media/doc.pdf");
    });

    expect(downloadMedia).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  test("openLocal branch: file that viewer cannot show (.zip) calls openLocal and does not navigate", async () => {
    const key = "websocket:chat-zip";
    threadStore.setState({
      threads: {
        [key]: {
          messages: [
            {
              id: "m1",
              role: "assistant",
              content: "archive",
              createdAt: 100,
              media: [{ url: "/archive.zip", name: "archive.zip", kind: "file" }],
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

    (downloadMedia as jest.Mock).mockResolvedValueOnce("file:///cache/media/archive.zip");

    await wrap(<GalleryScreen chatKey={key} />);
    const row = screen.getByLabelText(/archive\.zip/i);

    await act(async () => {
      fireEvent.press(row);
    });

    expect(downloadMedia).toHaveBeenCalledWith("https://example.com/archive.zip", "archive.zip");
    expect(openLocal).toHaveBeenCalledWith("file:///cache/media/archive.zip", "zip");
    expect(router.push).not.toHaveBeenCalled();
  });

  test("share button calls shareMedia once and does not navigate", async () => {
    const key = "websocket:chat-share";
    threadStore.setState({
      threads: {
        [key]: {
          messages: [
            {
              id: "m1",
              role: "assistant",
              content: "file",
              createdAt: 100,
              media: [{ url: "/shared.pdf", name: "shared.pdf", kind: "file" }],
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

    (downloadMedia as jest.Mock).mockResolvedValueOnce("file:///cache/media/shared.pdf");

    await wrap(<GalleryScreen chatKey={key} />);
    const shareBtns = screen.getAllByLabelText(/share|condividi/i);
    const shareBtn = shareBtns[shareBtns.length - 1];

    await act(async () => {
      fireEvent.press(shareBtn);
    });

    expect(downloadMedia).toHaveBeenCalledWith("https://example.com/shared.pdf", "shared.pdf");
    expect(shareMedia).toHaveBeenCalledWith("file:///cache/media/shared.pdf");
    expect(router.push).not.toHaveBeenCalled();
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
    await fireEvent.press(screen.getByLabelText(/more actions|altre azioni/i));
    expect(screen.getByLabelText(/gallery|media and files|media e file/i)).toBeTruthy();
    expect(screen.getByTestId("gallery-menu-icon")).toBeTruthy();
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
    expect(screen.queryByLabelText(/gallery|media and files|media e file/i)).toBeNull();
  });
});
