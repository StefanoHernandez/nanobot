import "../../src/platform/install";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { viewerKind, langOf, parseCsv, prettyJson } from "../../src/screens/viewer/formats";
import { FileViewer } from "../../src/screens/viewer/FileViewer";
import { FileCard } from "../../src/screens/thread/media/MediaViews";
import { downloadMedia, openLocal, shareMedia } from "../../src/screens/thread/media/media";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { toast } from "../../src/ui/components";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

// Mock expo-router
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    replace: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({})),
}));

// Mock expo-clipboard
jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => true),
}));

// Mock media helpers
jest.mock("../../src/screens/thread/media/media", () => {
  const actual = jest.requireActual("../../src/screens/thread/media/media");
  return {
    ...actual,
    downloadMedia: jest.fn(),
    openLocal: jest.fn(),
    shareMedia: jest.fn(),
  };
});

// Mock expo-file-system
const mockFileFactory = jest.fn();
jest.mock("expo-file-system", () => {
  return {
    File: jest.fn().mockImplementation((...args) => mockFileFactory(...args)),
    Directory: jest.fn(),
    Paths: { cache: { uri: "file:///cache" } },
  };
});

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

describe("formats helpers", () => {
  test("viewerKind: notes.md gives markdown, a.py gives code, data.json gives json, t.tsv gives csv, old.doc gives null", () => {
    expect(viewerKind("notes.md")).toBe("markdown");
    expect(viewerKind("notes.markdown")).toBe("markdown");
    expect(viewerKind("a.py")).toBe("code");
    expect(viewerKind("app.tsx")).toBe("code");
    expect(viewerKind("data.json")).toBe("json");
    expect(viewerKind("preview.vl")).toBe("chart");
    expect(viewerKind("preview.geojson")).toBe("map");
    expect(viewerKind("t.tsv")).toBe("csv");
    expect(viewerKind("table.csv")).toBe("csv");
    expect(viewerKind("log.txt")).toBe("text");
    expect(viewerKind("server.log")).toBe("text");
    expect(viewerKind("deck.pptx")).toBe("pptx");
    expect(viewerKind("doc.pdf")).toBe("pdf");
    expect(viewerKind("old.doc")).toBeNull();
    expect(viewerKind("old.ppt")).toBeNull();
    expect(viewerKind("image.png")).toBeNull();
  });

  test("langOf returns extension without dot", () => {
    expect(langOf("a.py")).toBe("py");
    expect(langOf("code.tsx")).toBe("tsx");
    expect(langOf("notes")).toBe("");
  });

  test("parseCsv: a,b\\n\"x,1\",\"he said \"\"hi\"\"\" gives [[\"a\",\"b\"],[\"x,1\",'he said \"hi\"']]", () => {
    const csv = 'a,b\n"x,1","he said ""hi"""';
    const parsed = parseCsv(csv, ",");
    expect(parsed).toEqual([
      ["a", "b"],
      ["x,1", 'he said "hi"'],
    ]);
  });

  test("parseCsv with tsv tab separator", () => {
    const tsv = "col1\tcol2\nval1\tval2";
    expect(parseCsv(tsv, "\t")).toEqual([
      ["col1", "col2"],
      ["val1", "val2"],
    ]);
  });

  test("parseCsv handles CRLF line endings", () => {
    const csv = "a,b\r\n1,2\r\n3,4";
    expect(parseCsv(csv, ",")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  test("parseCsv handles quoted field containing a newline", () => {
    const csv = 'a,"line 1\nline 2",b\nx,y,z';
    expect(parseCsv(csv, ",")).toEqual([
      ["a", "line 1\nline 2", "b"],
      ["x", "y", "z"],
    ]);
  });

  test("parseCsv strips leading BOM", () => {
    const csv = '\uFEFFa,b\n1,2';
    expect(parseCsv(csv, ",")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  test("parseCsv drops completely empty lines", () => {
    const csv = "a,b\n\n1,2\r\n\r\n3,4\n";
    expect(parseCsv(csv, ",")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  test("parseCsv keeps final empty quoted field a,\"\"", () => {
    const csv = 'a,""';
    expect(parseCsv(csv, ",")).toEqual([
      ["a", ""],
    ]);
  });

  test("prettyJson: invalid JSON is returned unchanged; valid JSON is formatted", () => {
    expect(prettyJson("not json")).toBe("not json");
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });
});

describe("FileViewer component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("a .md file renders its heading text", async () => {
    const mockText = jest.fn().mockResolvedValue("# Hello Markdown\nSome content");
    mockFileFactory.mockReturnValue({
      uri: "file:///cache/media/notes.md",
      size: 100,
      text: mockText,
    });

    await wrap(<FileViewer uri="file:///cache/media/notes.md" name="notes.md" />);

    expect(await screen.findByText("Hello Markdown")).toBeTruthy();
    expect(mockText).toHaveBeenCalled();
  });

  test("a .csv file with 3 rows shows the header cells", async () => {
    const csvContent = "Name,Age,Role\nAlice,30,Engineer\nBob,25,Designer";
    const mockText = jest.fn().mockResolvedValue(csvContent);
    mockFileFactory.mockReturnValue({
      uri: "file:///cache/media/table.csv",
      size: 200,
      text: mockText,
    });

    await wrap(<FileViewer uri="file:///cache/media/table.csv" name="table.csv" />);

    expect(await screen.findByText("Name")).toBeTruthy();
    expect(screen.getByText("Age")).toBeTruthy();
    expect(screen.getByText("Role")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  test("a file over 2 MB shows the too-large message and does not call .text()", async () => {
    const mockText = jest.fn().mockResolvedValue("huge data");
    mockFileFactory.mockReturnValue({
      uri: "file:///cache/media/large.txt",
      size: 3 * 1024 * 1024, // 3 MB > 2 MB
      text: mockText,
    });

    await wrap(<FileViewer uri="file:///cache/media/large.txt" name="large.txt" />);

    expect(await screen.findByText("File too large to preview")).toBeTruthy();
    expect(mockText).not.toHaveBeenCalled();
    // Also has Open with button
    expect(screen.getByText(/Open with/i)).toBeTruthy();
  });

  test("copy, share and open with buttons work in header", async () => {
    const mockText = jest.fn().mockResolvedValue("Some file content");
    mockFileFactory.mockReturnValue({
      uri: "file:///cache/media/notes.txt",
      size: 50,
      text: mockText,
    });
    const spyToast = jest.spyOn(toast, "show").mockImplementation(() => {});

    await wrap(<FileViewer uri="file:///cache/media/notes.txt" name="notes.txt" />);

    expect(await screen.findByText("Some file content")).toBeTruthy();

    // Copy
    const copyBtn = screen.getByLabelText(/copy/i);
    await fireEvent.press(copyBtn);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("Some file content");
    expect(spyToast).toHaveBeenCalled();

    // Share
    const shareBtn = screen.getByLabelText(/share/i);
    await fireEvent.press(shareBtn);
    expect(shareMedia).toHaveBeenCalledWith("file:///cache/media/notes.txt");

    // Open with
    const openWithBtn = screen.getByLabelText(/open with/i);
    await fireEvent.press(openWithBtn);
    expect(openLocal).toHaveBeenCalledWith("file:///cache/media/notes.txt", "txt");

    spyToast.mockRestore();
  });

  test("code file over 200 KB shows truncated content and preview truncated note", async () => {
    // 250 KB of code
    const bigCode = "const x = 1;\n".repeat(20000); // ~260 KB
    mockFileFactory.mockReturnValue({
      uri: "file:///cache/media/huge.ts",
      size: 260 * 1024,
      text: jest.fn().mockResolvedValue(bigCode),
    });

    await wrap(<FileViewer uri="file:///cache/media/huge.ts" name="huge.ts" />);

    expect(await screen.findByText(/Preview truncated — use Open with…/i)).toBeTruthy();
  });
});

describe("FileCard viewer navigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Open on notes.md pushes /viewer with local uri; remote URL never appears in params", async () => {
    (downloadMedia as jest.Mock).mockResolvedValue("file:///cache/media/notes.md");

    await wrap(
      <FileCard url="http://server.test/api/media/SECRET/notes.md" name="notes.md" ext="md" />,
    );

    const openBtn = screen.getByText("Open");
    await fireEvent.press(openBtn);

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledTimes(1);
    });

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/viewer",
      params: { uri: "file:///cache/media/notes.md", name: "notes.md" },
    });
    expect(openLocal).not.toHaveBeenCalled();

    // Remote URL never appears in params
    const pushArg = (router.push as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(pushArg)).not.toContain("http://server.test");
    expect(JSON.stringify(pushArg)).not.toContain("SECRET");
  });

  test("Open on old.doc calls openLocal", async () => {
    (downloadMedia as jest.Mock).mockResolvedValue("file:///cache/media/old.doc");

    await wrap(
      <FileCard url="http://server.test/api/media/SECRET/old.doc" name="old.doc" ext="doc" />,
    );

    const openBtn = screen.getByText("Open");
    await fireEvent.press(openBtn);

    await waitFor(() => {
      expect(openLocal).toHaveBeenCalledWith("file:///cache/media/old.doc", "doc");
    });

    expect(router.push).not.toHaveBeenCalled();
  });

  test("Open on deck.pptx pushes /viewer", async () => {
    (downloadMedia as jest.Mock).mockResolvedValue("file:///cache/media/deck.pptx");

    await wrap(
      <FileCard url="http://server.test/api/media/SECRET/deck.pptx" name="deck.pptx" ext="pptx" />,
    );

    const openBtn = screen.getByText("Open");
    await fireEvent.press(openBtn);

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith({
        pathname: "/viewer",
        params: { uri: "file:///cache/media/deck.pptx", name: "deck.pptx" },
      });
    });

    expect(openLocal).not.toHaveBeenCalled();
  });
});
