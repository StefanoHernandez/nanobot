import "../../src/platform/install";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { parseUnifiedDiff } from "../../src/screens/thread/diff";
import { FileEditList } from "../../src/screens/thread/FileEditList";
import { DiffView } from "../../src/screens/thread/DiffView";
import { GalleryScreen } from "../../src/screens/gallery/GalleryScreen";
import { ThreadScreen } from "../../src/screens/thread/ThreadScreen";
import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";
import { fakeSession } from "../state/fake";
import type { UIFileEdit, UIMessage } from "@/lib/types";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({ key: "websocket:c1" })),
}));

const wrap = async (ui: React.ReactElement) => {
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
};

describe("parseUnifiedDiff", () => {
  test("parseUnifiedDiff on a small patch gives the right kinds in order with stripped first char", () => {
    const patch = [
      "diff --git a/foo.ts b/foo.ts",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,3 +1,3 @@",
      " const a = 1;",
      "-const b = 2;",
      "+const b = 3;",
      " const c = 4;",
    ].join("\n");

    const parsed = parseUnifiedDiff(patch);
    expect(parsed).toEqual([
      { kind: "meta", text: "diff --git a/foo.ts b/foo.ts" },
      { kind: "meta", text: "--- a/foo.ts" },
      { kind: "meta", text: "+++ b/foo.ts" },
      { kind: "hunk", text: "@@ -1,3 +1,3 @@" },
      { kind: "ctx", text: "const a = 1;" },
      { kind: "del", text: "const b = 2;" },
      { kind: "add", text: "const b = 3;" },
      { kind: "ctx", text: "const c = 4;" },
    ]);
  });

  test("hunk-aware: '--- foo' inside a hunk is del, marker is meta, no trailing row", () => {
    const patch = ["@@ -1,2 +1,2 @@", "--- foo", "+++ bar", "\\ No newline at end of file", ""].join("\n");
    expect(parseUnifiedDiff(patch)).toEqual([
      { kind: "hunk", text: "@@ -1,2 +1,2 @@" },
      { kind: "del", text: "-- foo" },
      { kind: "add", text: "++ bar" },
      { kind: "meta", text: "\\ No newline at end of file" },
    ]);
  });
});

describe("FileEditList & DiffView", () => {
  test("FileEditList with a done edit shows path, +3 and −1; tapping it shows added line text; error edit shows error text", async () => {
    const edits: UIFileEdit[] = [
      {
        call_id: "c1",
        tool: "file_edit",
        path: "src/utils.ts",
        added: 3,
        deleted: 1,
        status: "done",
        operation: "edit",
        diff: {
          format: "unified",
          text: "@@ -1 +1 @@\n-old\n+new line added",
        },
      },
      {
        call_id: "c2",
        tool: "file_edit",
        path: "src/broken.ts",
        added: 0,
        deleted: 0,
        status: "error",
        error: "Permission denied",
      },
    ];

    await wrap(<FileEditList edits={edits} />);

    expect(screen.getByText("src/utils.ts")).toBeTruthy();
    expect(screen.getByText("+3")).toBeTruthy();
    expect(screen.getByText("−1")).toBeTruthy();
    expect(screen.getByText("Permission denied")).toBeTruthy();

    // Collapsed by default: "+new line added" not visible yet
    expect(screen.queryByText("new line added")).toBeNull();

    // Tap first edit row to expand DiffView
    await fireEvent.press(screen.getByText("src/utils.ts"));

    expect(await screen.findByText(/new line added/)).toBeTruthy();
    expect(screen.getByText(/old/)).toBeTruthy();
  });

  test("DiffView with 450 lines shows the 'more lines' note", async () => {
    const lines = ["@@ -1,450 +1,450 @@"];
    for (let i = 0; i < 450; i++) {
      lines.push(`+line ${i}`);
    }
    const bigDiff = {
      format: "unified",
      text: lines.join("\n"),
    };

    await wrap(<DiffView diff={bigDiff} />);

    // Shows 400 lines capped plus note: 451 total - 400 = 51 lines
    expect(screen.getByText(/51 more lines/i)).toBeTruthy();
  });
});

describe("GalleryScreen & ThreadScreen gallery button", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GalleryScreen with 2 messages and 3 images total renders 3 thumbnails; file-kind media item is excluded", async () => {
    const key = "websocket:c1";
    sessionStore.setState({
      profile: { baseUrl: "http://example.com" } as never,
    });

    const messages: UIMessage[] = [
      {
        id: "m1",
        role: "assistant",
        content: "Here are some images",
        createdAt: 100,
        media: [
          { kind: "image", url: "/img1.png", name: "one.png" },
          { kind: "file", url: "/doc.pdf", name: "doc.pdf" },
        ],
      } as never,
      {
        id: "m2",
        role: "user",
        content: "More images",
        createdAt: 200,
        images: [
          { url: "/img2.png", name: "two.png" },
          { url: "/img3.png", name: "three.png" },
        ],
      } as never,
    ];

    threadStore.setState({
      threads: {
        [key]: {
          messages,
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

    expect(screen.getByText("Images")).toBeTruthy();
    const thumbs = screen.getAllByTestId("gallery-thumbnail");
    expect(thumbs).toHaveLength(3);
    await fireEvent.press(thumbs[0]);
    expect(screen.getByLabelText("Share")).toBeTruthy();
  });

  test("switching to files lists the file instead of reusing the image grid", async () => {
    const key = "websocket:c1";
    sessionStore.setState({
      profile: { baseUrl: "http://example.com" } as never,
      session: null,
      state: "none" as never,
    });
    threadStore.setState({
      threads: {
        [key]: {
          messages: [
            {
              id: "m1",
              role: "assistant",
              content: "both",
              createdAt: 100,
              images: [{ url: "/img.png", name: "one.png" }],
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
    await wrap(<GalleryScreen chatKey={key} />);
    await fireEvent.press(screen.getByRole("tab", { name: "Files" }));
    expect(screen.getByText("doc.pdf")).toBeTruthy();
    expect(screen.queryByTestId("gallery-thumbnail")).toBeNull();
  });

  test("The gallery button in ThreadScreen is absent when thread has no images, and present when thread has images", async () => {
    const key = "websocket:c1";
    const fake = fakeSession();
    sessionStore.setState({
      profile: { baseUrl: "http://example.com" } as never,
      session: fake.session,
      state: "open" as never,
    });

    // 1. Thread without images
    threadStore.setState({
      threads: {
        [key]: {
          messages: [
            {
              id: "m1",
              role: "user",
              content: "hello",
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

    const { rerender } = await wrap(<ThreadScreen chatKey={key} onBack={() => {}} />);
    expect(screen.queryByLabelText(/gallery/i)).toBeNull();

    // 2. Thread with an image
    await act(async () => {
      threadStore.setState({
        threads: {
          [key]: {
            messages: [
              {
                id: "m1",
                role: "assistant",
                content: "see image",
                createdAt: 100,
                images: [{ url: "/photo.png", name: "photo.png" }],
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
    });

    await rerender(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 360, height: 640 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <ThemeProvider>
          <ThreadScreen chatKey={key} onBack={() => {}} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    await fireEvent.press(screen.getByLabelText(/more actions/i));
    expect(screen.getByLabelText(/gallery|media and files/i)).toBeTruthy();
  });
});
