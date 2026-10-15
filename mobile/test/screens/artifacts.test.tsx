import "../../src/platform/install";
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { viewerKind } from "../../src/screens/viewer/formats";
import { ArtifactWebView, buildShellHtml, escapeHtml } from "../../src/screens/viewer/ArtifactWebView";
import { FileViewer } from "../../src/screens/viewer/FileViewer";
import { CodeBlock } from "../../src/ui/markdown/CodeBlock";
import * as FileSystemLegacy from "expo-file-system/legacy";

beforeAll(async () => {
  await i18n.changeLanguage("en");
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

const mockFileFactory = jest.fn();
jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation((...args) => mockFileFactory(...args)),
  Directory: jest.fn(),
  Paths: { cache: { uri: "file:///cache" } },
}));

jest.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: jest.fn().mockResolvedValue("dGVzdA=="),
  EncodingType: { Base64: "base64" },
}));

jest.mock("../../src/screens/thread/media/media", () => {
  const actual = jest.requireActual("../../src/screens/thread/media/media");
  return {
    ...actual,
    downloadMedia: jest.fn(),
    openLocal: jest.fn(),
    shareMedia: jest.fn(),
  };
});

const wrap = async (ui: React.ReactElement) => {
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 640 },
        insets: { top: 24, left: 0, bottom: 24, right: 0 },
      }}
    >
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
};

describe("P5-V1 Artifacts & Document Previews", () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    capturedWebViewProps = null;
  });

  afterEach(() => {
    jest.useRealTimers();
    cleanup();
  });

  test("viewerKind: report.pdf -> pdf, a.docx -> docx, s.pptx -> pptx, x.xlsx -> xlsx, p.html -> html, d.mmd -> mermaid, old.doc -> null", () => {
    expect(viewerKind("report.pdf")).toBe("pdf");
    expect(viewerKind("a.docx")).toBe("docx");
    expect(viewerKind("s.pptx")).toBe("pptx");
    expect(viewerKind("x.xlsx")).toBe("xlsx");
    expect(viewerKind("p.html")).toBe("html");
    expect(viewerKind("d.mmd")).toBe("mermaid");
    expect(viewerKind("diagram.mermaid")).toBe("mermaid");
    expect(viewerKind("vector.svg")).toBe("svg");
    expect(viewerKind("old.doc")).toBeNull();
    expect(viewerKind("old.ppt")).toBeNull();
  });

  test("The shell HTML starts with the CSP meta before the agent content, and contains connect-src 'none'", () => {
    const html = buildShellHtml({ kind: "html", html: "<h1>User Content</h1>", isDark: false });
    const headIndex = html.indexOf("<head>");
    const cspIndex = html.indexOf("<meta http-equiv=\"Content-Security-Policy\"");
    const contentIndex = html.indexOf("<h1>User Content</h1>");

    expect(headIndex).toBeGreaterThanOrEqual(0);
    expect(cspIndex).toBeGreaterThan(headIndex);
    expect(cspIndex).toBeLessThan(contentIndex);
    expect(html).toContain("connect-src 'none'");
  });

  test("The WebView props include allowFileAccess: false, incognito: true and setSupportMultipleWindows: false", async () => {
    await wrap(<ArtifactWebView kind="html" html="<p>Test</p>" onFallback={jest.fn()} />);
    const webView = screen.getByTestId("webview");

    expect(webView.props.allowFileAccess).toBe(false);
    expect(webView.props.incognito).toBe(true);
    expect(webView.props.setSupportMultipleWindows).toBe(false);
    expect(webView.props.javaScriptEnabled).toBe(true);
    expect(webView.props.domStorageEnabled).toBe(false);
    expect(webView.props.mixedContentMode).toBe("never");
  });

  test("onShouldStartLoadWithRequest({url:'https://evil.example'}) returns false and opens the confirm dialog. Confirm calls Linking.openURL once", async () => {
    const spyLinking = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    await wrap(<ArtifactWebView kind="html" html="<p>Test</p>" onFallback={jest.fn()} />);

    let result: boolean = true;
    await act(async () => {
      result = capturedWebViewProps.onShouldStartLoadWithRequest({ url: "https://evil.example" });
    });
    expect(result).toBe(false);

    // Dialog should appear
    expect(await screen.findByText(/Open in browser\?|Aprire nel browser\?/i)).toBeTruthy();

    // Confirm dialog
    const confirmButton = screen.getByRole("button", { name: /Open|Apri/i });
    fireEvent.press(confirmButton);

    expect(spyLinking).toHaveBeenCalledTimes(1);
    expect(spyLinking).toHaveBeenCalledWith("https://evil.example");
    spyLinking.mockRestore();
  });

  test("onMessage with {'type':'error'} calls onFallback. A random message such as {'type':'navigate'} is ignored", async () => {
    const onFallback = jest.fn();
    await wrap(<ArtifactWebView kind="html" html="<p>Test</p>" onFallback={onFallback} />);

    // Random message ignored
    await act(async () => {
      await capturedWebViewProps.onMessage({ nativeEvent: { data: JSON.stringify({ type: "navigate" }) } });
    });
    expect(onFallback).not.toHaveBeenCalled();

    // Error message calls onFallback
    await act(async () => {
      await capturedWebViewProps.onMessage({ nativeEvent: { data: JSON.stringify({ type: "error" }) } });
    });
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  test("Chunk protocol: need with offset 0 and length 1048576 reads that slice and calls injectJavaScript with __chunk(0,; negative or out-of-bounds offset is ignored", async () => {
    const fileSize = 2 * 1024 * 1024; // 2 MB
    (FileSystemLegacy.readAsStringAsync as jest.Mock).mockResolvedValue("Y2h1bms=");

    await wrap(
      <ArtifactWebView
        kind="pdf"
        uri="file:///cache/media/doc.pdf"
        fileSize={fileSize}
        onFallback={jest.fn()}
      />
    );

    // Valid need: offset 0, length 1 MB
    await act(async () => {
      await capturedWebViewProps.onMessage({
        nativeEvent: { data: JSON.stringify({ type: "need", offset: 0, length: 1048576 }) },
      });
    });

    await waitFor(() => {
      expect(FileSystemLegacy.readAsStringAsync).toHaveBeenCalledWith(
        "file:///cache/media/doc.pdf",
        expect.objectContaining({ position: 0, length: 1048576, encoding: "base64" })
      );
    });
    expect(mockInjectJavaScript).toHaveBeenCalledWith(expect.stringContaining("window.__chunk(0, 'Y2h1bms=')"));

    mockInjectJavaScript.mockClear();
    (FileSystemLegacy.readAsStringAsync as jest.Mock).mockClear();

    // Negative offset ignored
    await act(async () => {
      await capturedWebViewProps.onMessage({
        nativeEvent: { data: JSON.stringify({ type: "need", offset: -1, length: 1024 }) },
      });
    });
    expect(FileSystemLegacy.readAsStringAsync).not.toHaveBeenCalled();
    expect(mockInjectJavaScript).not.toHaveBeenCalled();

    // Beyond file size results in __chunkError
    await act(async () => {
      await capturedWebViewProps.onMessage({
        nativeEvent: { data: JSON.stringify({ type: "need", offset: fileSize + 10, length: 1024 }) },
      });
    });
    expect(FileSystemLegacy.readAsStringAsync).not.toHaveBeenCalled();
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining(`window.__chunkError(${fileSize + 10})`)
    );
  });

  test("Size routing: a 60 MB docx shows the 'large file' notice first", async () => {
    mockFileFactory.mockReturnValue({
      uri: "file:///cache/media/large.docx",
      size: 60 * 1024 * 1024,
      text: jest.fn(),
    });

    await wrap(<FileViewer uri="file:///cache/media/large.docx" name="large.docx" />);

    expect(await screen.findByText(/Large file \(60 MB\)|File grande \(60 MB\)/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Open preview|Apri anteprima/i })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Open with…|Apri con…/i }).length).toBeGreaterThanOrEqual(1);
  });

  test("Size routing: a 200 MB pptx goes to the light preview", async () => {
    mockFileFactory.mockReturnValue({
      uri: "file:///cache/media/huge.pptx",
      size: 200 * 1024 * 1024,
      text: jest.fn(),
    });

    await wrap(<FileViewer uri="file:///cache/media/huge.pptx" name="huge.pptx" />);

    // Should render light preview without showing large file notice
    expect(await screen.findByTestId("light-preview")).toBeTruthy();
  });

  test("Size routing: an 11 MB html opens as code with a 'Preview anyway' button", async () => {
    mockFileFactory.mockReturnValue({
      uri: "file:///cache/media/page.html",
      size: 11 * 1024 * 1024,
      text: jest.fn().mockResolvedValue("<html><body>Large HTML</body></html>"),
    });

    await wrap(<FileViewer uri="file:///cache/media/page.html" name="page.html" />);

    expect(await screen.findByText(/Preview anyway|Anteprima comunque/i)).toBeTruthy();
  });

  test("Size routing: a 500 MB pdf still uses the streamed PDF viewer", async () => {
    mockFileFactory.mockReturnValue({
      uri: "file:///cache/media/huge.pdf",
      size: 500 * 1024 * 1024,
      text: jest.fn(),
    });

    await wrap(<FileViewer uri="file:///cache/media/huge.pdf" name="huge.pdf" />);

    expect(await screen.findByTestId("webview")).toBeTruthy();
    expect(capturedWebViewProps.source.html).toContain("pdfjs");
  });

  test("onRenderProcessGone shows the light preview", async () => {
    await wrap(<ArtifactWebView kind="pptx" uri="file:///cache/test.pptx" onFallback={jest.fn()} />);

    expect(screen.queryByTestId("light-preview")).toBeNull();

    // Trigger onRenderProcessGone
    await act(async () => {
      capturedWebViewProps.onRenderProcessGone({ nativeEvent: { didCrash: false } });
    });

    expect(await screen.findByTestId("light-preview")).toBeTruthy();
  });

  test("A chat code block with html shows the Preview button", async () => {
    await wrap(<CodeBlock code="<h1>Hello</h1>" lang="html" />);
    expect(screen.getByLabelText(/Preview|Anteprima/i)).toBeTruthy();
  });

  test("A chat code block with python does not show the Preview button", async () => {
    await wrap(<CodeBlock code="print('hello')" lang="python" />);
    expect(screen.queryByLabelText(/Preview|Anteprima/i)).toBeNull();
  });

  test("need with length 50_000_000 injects at most 1 MB", async () => {
    const fileSize = 100 * 1024 * 1024;
    (FileSystemLegacy.readAsStringAsync as jest.Mock).mockResolvedValue("Y2h1bms=");

    await wrap(
      <ArtifactWebView
        kind="pdf"
        uri="file:///cache/media/doc.pdf"
        fileSize={fileSize}
        onFallback={jest.fn()}
      />
    );

    await act(async () => {
      await capturedWebViewProps.onMessage({
        nativeEvent: { data: JSON.stringify({ type: "need", offset: 0, length: 50_000_000 }) },
      });
    });

    await waitFor(() => {
      expect(FileSystemLegacy.readAsStringAsync).toHaveBeenCalledWith(
        "file:///cache/media/doc.pdf",
        expect.objectContaining({ position: 0, length: 1048576, encoding: "base64" })
      );
    });
  });

  test("A second navigation to data:text/html,... after the first load returns false", async () => {
    await wrap(<ArtifactWebView kind="html" html="<p>Test</p>" onFallback={jest.fn()} />);

    // First load allowed
    const firstResult = capturedWebViewProps.onShouldStartLoadWithRequest({ url: "about:blank" });
    expect(firstResult).toBe(true);

    // Second navigation blocked
    const secondResult = capturedWebViewProps.onShouldStartLoadWithRequest({ url: "data:text/html,<h1>evil</h1>" });
    expect(secondResult).toBe(false);
  });

  test("An xlsx cell value <img src=x onerror=alert(1)> appears escaped in the generated HTML", () => {
    const shell = buildShellHtml({ kind: "xlsx", fileSize: 1000 });
    expect(shell).toContain("escapeHtml(val != null ? val : \"\")");
    expect(escapeHtml("<img src=x onerror=alert(1)>")).toBe("&lt;img src=x onerror=alert(1)&gt;");
  });

  test("Mermaid source </pre><script> appears escaped", () => {
    const shell = buildShellHtml({ kind: "mermaid", html: "</pre><script>" });
    expect(shell).toContain("&lt;/pre&gt;&lt;script&gt;");
    expect(shell).not.toContain("</pre><script>");
  });

  test("The PDF shell uses PDFDataRangeTransport: it contains that identifier and does not call loadAllChunks for pdf", () => {
    const shell = buildShellHtml({ kind: "pdf", fileSize: 100000 });
    expect(shell).toContain("PDFDataRangeTransport");
    expect(shell).not.toContain("loadAllChunks");
  });

  test("Fallback timer: with chunks arriving every 5 s for 60 s, onFallback is not called", async () => {
    const onFallback = jest.fn();
    (FileSystemLegacy.readAsStringAsync as jest.Mock).mockResolvedValue("Y2h1bms=");

    jest.useFakeTimers();
    try {
      await wrap(
        <ArtifactWebView
          kind="pdf"
          uri="file:///cache/media/doc.pdf"
          fileSize={100 * 1024 * 1024}
          onFallback={onFallback}
        />
      );

      // 12 chunk requests every 5 seconds = 60s total
      for (let i = 0; i < 12; i++) {
        await act(async () => {
          jest.advanceTimersByTime(5000);
        });
        await act(async () => {
          await capturedWebViewProps.onMessage({
            nativeEvent: { data: JSON.stringify({ type: "need", offset: i * 1048576, length: 1048576 }) },
          });
        });
        expect(onFallback).not.toHaveBeenCalled();
      }

      // Now wait > 20s without any chunk activity
      await act(async () => {
        jest.advanceTimersByTime(20001);
      });
      expect(onFallback).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("A pptx with no pptx-preview API posts error, not ready", () => {
    const shell = buildShellHtml({ kind: "pptx", fileSize: 1000 });
    expect(shell).toContain("if (!window.pptxPreview || typeof window.pptxPreview.init !== \"function\")");
    expect(shell).toContain("throw new Error(\"pptxPreview not available\")");
  });

  test("Changing the shell source after the first load: the new initial load is allowed (onShouldStartLoadWithRequest returns true once for it)", async () => {
    const rendered = await wrap(<ArtifactWebView kind="html" html="<p>Version 1</p>" onFallback={jest.fn()} />);

    // First load of version 1 allowed
    expect(capturedWebViewProps.onShouldStartLoadWithRequest({ url: "about:blank" })).toBe(true);
    // Second navigation blocked
    expect(capturedWebViewProps.onShouldStartLoadWithRequest({ url: "data:text/html,evil" })).toBe(false);

    // Re-render with new html/source
    await rendered.rerender(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 360, height: 640 },
          insets: { top: 24, left: 0, bottom: 24, right: 0 },
        }}
      >
        <ThemeProvider>
          <ArtifactWebView kind="html" html="<p>Version 2</p>" onFallback={jest.fn()} />
        </ThemeProvider>
      </SafeAreaProvider>
    );

    // New initial load allowed
    expect(capturedWebViewProps.onShouldStartLoadWithRequest({ url: "about:blank" })).toBe(true);
    // Subsequent navigation blocked
    expect(capturedWebViewProps.onShouldStartLoadWithRequest({ url: "data:text/html,evil2" })).toBe(false);
  });

  test("A shell zip fixture with cdSize 100 MB posts error and issues no need beyond the first tail read", () => {
    // Construct a 22-byte EOCD with cdSize = 100 MB (104857600)
    const eocd = new Uint8Array(22);
    const view = new DataView(eocd.buffer);
    view.setUint32(0, 0x06054b50, true); // EOCD signature 0x50 0x4b 0x05 0x06
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 1, true);
    view.setUint16(10, 1, true);
    view.setUint32(12, 100 * 1024 * 1024, true); // cdSize = 100 MB
    view.setUint32(16, 1000, true); // cdStartOffset
    view.setUint16(20, 0, true);

    const { parseZipCentralDirectory } = require("../../src/screens/viewer/ArtifactWebView");
    expect(() => parseZipCentralDirectory(eocd, 200 * 1024 * 1024)).toThrow(/exceeds 4 MB|cap/i);

    // Also check that the generated shell contains hard caps
    const shell = buildShellHtml({ kind: "docx", fileSize: 200 * 1024 * 1024, isLightPreview: true });
    expect(shell).toContain("4194304"); // 4 MB cap
    expect(shell).toContain("67108864"); // 64 MB cap
  });

  test("Re-rendering ArtifactWebView with a new inline onFallback after ready: after 25 s of fake timers, onFallback is not called", async () => {
    const fallbackInitial = jest.fn();
    const fallbackUpdated = jest.fn();

    jest.useFakeTimers();
    try {
      const rendered = await wrap(
        <ArtifactWebView kind="html" html="<p>Test</p>" onFallback={fallbackInitial} />
      );

      // Shell reports ready
      await act(async () => {
        await capturedWebViewProps.onMessage({
          nativeEvent: { data: JSON.stringify({ type: "ready" }) },
        });
      });

      // Re-render with new inline onFallback
      await rendered.rerender(
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 360, height: 640 },
            insets: { top: 24, left: 0, bottom: 24, right: 0 },
          }}
        >
          <ThemeProvider>
            <ArtifactWebView kind="html" html="<p>Test</p>" onFallback={fallbackUpdated} />
          </ThemeProvider>
        </SafeAreaProvider>
      );

      // Advance 25 seconds
      await act(async () => {
        jest.advanceTimersByTime(25000);
      });

      expect(fallbackInitial).not.toHaveBeenCalled();
      expect(fallbackUpdated).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test("need with offset >= size results in injectJavaScript with __chunkError", async () => {
    const fileSize = 1000;
    await wrap(
      <ArtifactWebView
        kind="pdf"
        uri="file:///cache/test.pdf"
        fileSize={fileSize}
        onFallback={jest.fn()}
      />
    );

    mockInjectJavaScript.mockClear();

    // Out of bounds offset
    await act(async () => {
      await capturedWebViewProps.onMessage({
        nativeEvent: { data: JSON.stringify({ type: "need", offset: fileSize, length: 100 }) },
      });
    });

    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining("window.__chunkError")
    );
  });
});

test("mermaid follows the app theme and svg/mermaid pages carry the zoom script", () => {
  const dark = buildShellHtml({ kind: "mermaid", html: "graph TD; A-->B", isDark: true, bg: "#1c3a34", fg: "#e8f0ed", accent: "#e4d4ec" });
  expect(dark).toContain('theme: "dark"');
  expect(dark).toContain('primaryColor: "#e4d4ec"');
  expect(dark).toContain('touchstart');
  const light = buildShellHtml({ kind: "mermaid", html: "graph TD; A-->B" });
  expect(light).toContain('theme: "default"');
  const svg = buildShellHtml({ kind: "svg", html: "<svg></svg>" });
  expect(svg).toContain("touchstart");
  const pdf = buildShellHtml({ kind: "pdf", fileSize: 1000 });
  expect(pdf).not.toContain("prefers-reduced-motion");
  // the sandbox is untouched
  expect(dark).toContain("connect-src 'none'");
});
