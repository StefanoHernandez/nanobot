import "../../src/platform/install";
import fs from "fs";
import path from "path";
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";
import { kv } from "../../src/platform/storage";
import { artifactStore } from "../../src/screens/viewer/artifactStore";
import { printDocument } from "../../src/screens/viewer/exportArtifact";
import { markdownToPrintHtml } from "../../src/screens/viewer/readingPages";
import { viewerCsp, buildShellHtml } from "../../src/screens/viewer/ArtifactWebView";
import { FileViewer } from "../../src/screens/viewer/FileViewer";
import { ProjectDetailScreen } from "../../src/screens/projects/ProjectDetailScreen";
import { KanbanScreen } from "../../src/screens/ecosystem/kanban/KanbanScreen";
import { DevicesCard } from "../../src/screens/settings/DevicesCard";
import { GalleryScreen } from "../../src/screens/gallery/GalleryScreen";
import * as projectsApi from "../../src/projects/api";
import * as kanbanApi from "../../src/ecosystem/kanban";
import * as pairingApi from "../../src/core/pairing";
import { setViewerLibForTest, clearViewerLibsForTest } from "../../src/screens/viewer/viewerLibs";
import type { NanobotSession } from "../../src/core/session";
import type { UIMessage } from "@/lib/types";

Object.defineProperty(global, "IS_REACT_ACT_ENVIRONMENT", {
  get: () => true,
  set: () => {},
  configurable: true,
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function renderWithTheme(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

// Mock BotFace
jest.mock("../../src/ui/BotFace", () => {
  const { View } = require("react-native");
  return {
    BotFace: ({ state }: { state?: string }) => <View testID={`botface-${state}`} />,
  };
});

// Mock expo-screen-orientation
jest.mock("expo-screen-orientation", () => ({
  OrientationLock: { LANDSCAPE: "LANDSCAPE", PORTRAIT_UP: "PORTRAIT_UP" },
  lockAsync: jest.fn(async () => {}),
}));

// Mock expo-print
jest.mock("expo-print", () => ({
  printToFileAsync: jest.fn(async () => ({ uri: "file:///cache/artifacts/preview.pdf" })),
}));

// Mock Toast
jest.mock("../../src/ui/components/Toast", () => ({
  toast: { show: jest.fn() },
}));

// Mock expo-router
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    push: (...args: any[]) => mockPush(...args),
    replace: (...args: any[]) => mockReplace(...args),
    navigate: jest.fn(),
    canGoBack: () => true,
  },
  usePathname: () => "/viewer",
  useLocalSearchParams: () => ({ key: "websocket:c1" }),
  useNavigation: () => ({
    addListener: jest.fn(() => () => {}),
  }),
}));

// Mock react-native-webview
let capturedWebViewProps: any = null;
jest.mock("react-native-webview", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    WebView: React.forwardRef((props: any, ref: any) => {
      capturedWebViewProps = props;
      React.useImperativeHandle(ref, () => ({
        injectJavaScript: jest.fn(),
      }));
      return <View testID="webview" {...props} />;
    }),
  };
});

// Mock expo-file-system
const writtenFiles: { name: string; content: any }[] = [];
jest.mock("expo-file-system", () => ({
  Directory: jest.fn(() => ({ create: jest.fn() })),
  File: jest.fn(function FileMock(_dir: unknown, name: string) {
    return {
      write: (content: any) => {
        writtenFiles.push({ name, content });
      },
      uri: `file:///cache/artifacts/${name}`,
    };
  }),
  Paths: { cache: { uri: "file:///cache" } },
}));

function fakeSession(profileId = "p1"): NanobotSession {
  return {
    baseUrl: "https://srv.test",
    apiToken: () => "secret-token",
    get: jest.fn(),
    client: { sendMessage: jest.fn() } as any,
  } as unknown as NanobotSession;
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  jest.clearAllMocks();
  writtenFiles.length = 0;
  artifactStore.clear();
  clearViewerLibsForTest();
  sessionStore.setState({
    profile: { id: "p1", name: "P1", baseUrl: "https://srv.test" } as any,
    session: fakeSession("p1"),
    state: "open",
  });
});

afterEach(() => {
  cleanup();
});

describe("O-A Task 1: Network permission is per version & fixError cleared", () => {
  test("allowing network on v1, tapping next version resets network and clears fixError", async () => {
    const session = fakeSession("p1");
    sessionStore.setState({
      profile: { id: "p1", name: "P1", baseUrl: "https://srv.test" } as any,
      session,
      state: "open",
    });

    const threadKey = "websocket:c1";
    threadStore.setState({
      threads: {
        [threadKey]: {
          messages: [],
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

    artifactStore.set("<h1>Version 1</h1>", "preview.html", {
      id: "art-1",
      title: "Doc",
      versions: [
        { kind: "html", code: "<h1>Version 1</h1>", title: "v1" },
        { kind: "html", code: "<h1>Version 2</h1>", title: "v2" },
      ],
      index: 0,
    });

    const { unmount } = await renderWithTheme(<FileViewer uri="" name="preview.html" chatKey={threadKey} />);

    // Initial state: network switch is off
    const switchOff = screen.getByRole("switch", { name: "Allow network" });
    expect(switchOff.props.value).toBe(false);
    expect(capturedWebViewProps.source.html).toContain("connect-src 'none'");

    // Simulate an error on v1
    await act(async () => {
      capturedWebViewProps.onError?.({ message: "V1 syntax error", line: 10 });
    });

    // Turn network on: flips askNetwork dialog
    await act(async () => {
      fireEvent(switchOff, "valueChange", true);
    });
    // Confirm in dialog
    const allowBtn = screen.getByRole("button", { name: "Allow" });
    await act(async () => {
      fireEvent.press(allowBtn);
    });

    // Network is now on
    expect(screen.getByRole("switch", { name: "Network allowed" }).props.value).toBe(true);
    expect(capturedWebViewProps.source.html).toContain("connect-src https:");

    // Tap "Next version"
    const nextBtn = screen.getByLabelText("Next version");
    await act(async () => {
      fireEvent.press(nextBtn);
    });

    // Version 2 should have network switch back to off
    const switchV2 = screen.getByRole("switch", { name: "Allow network" });
    expect(switchV2.props.value).toBe(false);
    expect(capturedWebViewProps.source.html).toContain("connect-src 'none'");
    expect(capturedWebViewProps.source.html).not.toContain("connect-src https:");
    // V1 error prompt should not persist as v2 error
    expect(screen.queryByText(/V1 syntax error/)).toBeNull();
    unmount();
  });
});

describe("O-A Task 2: PDF export & Markdown print sanitization", () => {
  test("markdown print: CSP contains script-src 'none'", () => {
    const res = markdownToPrintHtml("# Simple Title\n\nSome body text");
    expect(res).toContain("script-src 'none'");
    expect(res).toContain("connect-src 'none'");
  });

  test("a fenced code block containing <script> and onclick= survives in the printed HTML (escaped by marked)", () => {
    const raw = "```html\n<script>alert(1)</script>\n<button onclick=\"doSomething()\">Click</button>\n```";
    const res = markdownToPrintHtml(raw);
    expect(res).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(res).toContain("onclick=");
    expect(res).toContain("&lt;button onclick=");
  });

  test("an HTML artifact print keeps its <script> and has connect-src 'none'", () => {
    const fullDoc = "<!DOCTYPE html><html><head><title>Vega Chart</title></head><body><script>const x = 1;</script></body></html>";
    const printed = printDocument(fullDoc, { scripts: true });
    expect(printed).toContain("<script>const x = 1;</script>");
    expect(printed).toContain("connect-src 'none'");
    expect(printed).toContain("script-src 'unsafe-inline' 'unsafe-eval'");
  });

  test("injects CSP into the first real <head> only (parse before <body), otherwise wraps", () => {
    // 1. First real head before body
    const docWithHead = "<html><head><title>Doc</title></head><body><p>Text with fake <head> tag</p></body></html>";
    const printed1 = printDocument(docWithHead);
    // CSP should be injected right after <head>
    expect(printed1).toContain("<head><meta http-equiv=\"Content-Security-Policy\"");
    // And should not be duplicated after fake <head>
    expect(printed1.indexOf("<meta http-equiv=\"Content-Security-Policy\"")).toBeLessThan(printed1.indexOf("<body>"));

    // 2. Head after body is ignored and document is wrapped/injected before body
    const docHeadAfterBody = "<html><body><p>First <head> is inside body</p></body></html>";
    const printed2 = printDocument(docHeadAfterBody);
    expect(printed2).toContain("<head><meta http-equiv=\"Content-Security-Policy\"");
    expect(printed2.indexOf("<meta http-equiv=\"Content-Security-Policy\"")).toBeLessThan(printed2.indexOf("<body>"));

    // 3. Raw fragment without html/head is wrapped
    const fragment = "<h1>Fragment</h1>";
    const printed3 = printDocument(fragment);
    expect(printed3).toContain("<!DOCTYPE html><html><head><meta http-equiv=\"Content-Security-Policy\"");
    expect(printed3).toContain("<body><h1>Fragment</h1></body></html>");
  });

  test("markdownToPrintHtml strips <svg/onload=...> and <img/src=x/onerror=...>", () => {
    const raw = `
# Dangerous

<svg/onload=alert(1)>
<img/src=x/onerror=alert(2)>
<script>alert(3)</script>
`;
    const result = markdownToPrintHtml(raw);
    expect(result).not.toContain("onload");
    expect(result).not.toContain("onerror");
    expect(result).not.toMatch(/<script\b/i);
    expect(result).toContain("script-src 'none'");
  });
});

describe("O-A Task 3: Profile switch guards against stale server responses", () => {
  test("ProjectDetailScreen drops response if profile switched during load", async () => {
    let resolveOld: (val: any) => void = () => {};
    let calls = 0;
    jest.spyOn(projectsApi, "getProject").mockImplementation(
      () => {
        calls++;
        if (calls === 1) {
          return new Promise((resolve) => {
            resolveOld = resolve;
          });
        }
        return new Promise(() => {});
      }
    );

    const session = fakeSession("p1");
    sessionStore.setState({
      profile: { id: "p1", name: "Profile 1", baseUrl: "https://p1" } as any,
      session,
      state: "open",
    });

    const { unmount } = await renderWithTheme(<ProjectDetailScreen id="proj-1" />);

    // Switch profile while getProject is in flight
    await act(async () => {
      sessionStore.setState({
        profile: { id: "p2", name: "Profile 2", baseUrl: "https://p2" } as any,
        session: fakeSession("p2"),
        state: "open",
      });
    });

    // Resolve old request
    await act(async () => {
      resolveOld({
        project: {
          id: "proj-1",
          name: "Old Project From P1",
          path: "/p1",
          created_at: 1,
          updated_at: 1,
          file_count: 0,
          size_bytes: 0,
        },
        instructions: "Old instructions",
        files: [],
        truncated: false,
      });
    });

    // Old project data must NOT be rendered
    expect(screen.queryByText("Old Project From P1")).toBeNull();
    unmount();
  });

  test("KanbanScreen drops snapshot if profile switched during load", async () => {
    let resolveOld: (val: any) => void = () => {};
    let calls = 0;
    jest.spyOn(kanbanApi, "fetchKanban").mockImplementation(
      () => {
        calls++;
        if (calls === 1) {
          return new Promise((resolve) => {
            resolveOld = resolve;
          });
        }
        return new Promise(() => {});
      }
    );

    const session = fakeSession("p1");
    sessionStore.setState({
      profile: { id: "p1", name: "Profile 1", baseUrl: "https://p1" } as any,
      session,
      state: "open",
    });

    const { unmount } = await renderWithTheme(<KanbanScreen session={session} />);

    // Switch profile while fetchKanban is in flight
    await act(async () => {
      sessionStore.setState({
        profile: { id: "p2", name: "Profile 2", baseUrl: "https://p2" } as any,
        session: fakeSession("p2"),
        state: "open",
      });
    });

    // Resolve old request
    await act(async () => {
      resolveOld({
        boards: [{ id: "b1", title: "P1 Board" }],
        active_board: { id: "b1", title: "P1 Board" },
        tasks: [{ id: "t1", title: "Old P1 Task", status: "todo" }],
        bots: [],
      });
    });

    expect(screen.queryByText("Old P1 Task")).toBeNull();
    unmount();
  });

  test("DevicesCard drops device list if profile switched during load", async () => {
    let resolveOld: (val: any) => void = () => {};
    let calls = 0;
    const mockGet = jest.fn().mockImplementation(
      () => {
        calls++;
        if (calls === 1) {
          return new Promise((resolve) => {
            resolveOld = resolve;
          });
        }
        return new Promise(() => {});
      }
    );
    const session = {
      ...fakeSession("p1"),
      get: mockGet,
    } as unknown as NanobotSession;

    sessionStore.setState({
      profile: { id: "p1", name: "Profile 1", baseUrl: "https://p1" } as any,
      session,
      state: "open",
    });

    const { unmount } = await renderWithTheme(<DevicesCard session={session} />);

    // Switch profile while listDevices is in flight
    await act(async () => {
      sessionStore.setState({
        profile: { id: "p2", name: "Profile 2", baseUrl: "https://p2" } as any,
        session: fakeSession("p2"),
        state: "open",
      });
    });

    // Resolve old request
    await act(async () => {
      resolveOld({
        devices: [{ id: "d1", name: "Old Device From P1", created: 1, last_seen: null, revoked: false }],
      });
    });

    expect(screen.queryByText("Old Device From P1")).toBeNull();
    unmount();
  });
});

describe("O-A Task 4: Saving viewed version & conflict overwrite dialog", () => {
  test("saves viewed version (not latest), handles file_exists with confirm dialog and retry with overwrite", async () => {
    const key = "websocket:c1";
    const session = fakeSession("p1");
    sessionStore.setState({
      profile: { id: "p1", baseUrl: "https://srv.test" } as any,
      session,
      state: "open",
    });

    const v1Code = "<h1>Version One Code</h1>";
    const v2Code = "<h1>Version Two Code</h1>";

    threadStore.setState({
      threads: {
        [key]: {
          messages: [
            {
              id: "m1",
              role: "assistant",
              content: `\`\`\`html id=report title="Report"\n${v1Code}\n\`\`\``,
              createdAt: 100,
            } as never,
            {
              id: "m2",
              role: "assistant",
              content: `\`\`\`html id=report title="Report"\n${v2Code}\n\`\`\``,
              createdAt: 200,
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

    // User was viewing version 0 (v1) in viewer
    artifactStore.set(v1Code, "preview.html", {
      id: "report",
      title: "Report",
      versions: [
        { kind: "html", code: v1Code, title: "v1" },
        { kind: "html", code: v2Code, title: "v2" },
      ],
      index: 0,
    });

    jest.spyOn(projectsApi, "listProjects").mockResolvedValue({
      projects: [
        { id: "proj-1", name: "Demo", path: "/demo", created_at: 1, updated_at: 1, file_count: 0, size_bytes: 0 },
      ],
    });

    const uploadSpy = jest.spyOn(projectsApi, "uploadProjectFile")
      // First attempt fails with file_exists
      .mockRejectedValueOnce(new Error("file_exists"))
      // Second attempt (after overwrite confirm) succeeds
      .mockResolvedValueOnce({ file: { path: "report.html", size: 10, modified_at: 1 } });

    const { unmount } = await renderWithTheme(<GalleryScreen chatKey={key} />);

    // Go to Artifacts tab
    await act(async () => {
      fireEvent.press(screen.getByRole("tab", { name: "Artifacts" }));
    });

    // Tap save button
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Save to project"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("gallery-save-project-row")).toBeTruthy();
    });

    // Select project
    await act(async () => {
      fireEvent.press(screen.getByTestId("gallery-save-project-row"));
    });

    // First upload call happened without overwrite
    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledTimes(1);
    });
    expect(uploadSpy.mock.calls[0][4]).toBeFalsy();

    // Confirm dialog should appear
    expect(screen.getByText(/already exists|esiste già/i)).toBeTruthy();

    // Tap confirm overwrite
    const overwriteBtn = screen.getByRole("button", { name: /Sovrascrivi|Overwrite/i });
    await act(async () => {
      fireEvent.press(overwriteBtn);
    });

    // Second upload call happened with overwrite = true
    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledTimes(2);
    });
    expect(uploadSpy.mock.calls[1][4]).toBe(true);

    // Verify the saved file was version 1 (the viewed version)
    const writtenFile = writtenFiles.find((f) => f.name === "report.html");
    expect(writtenFile).toBeTruthy();
    expect(writtenFile?.content).toContain(v1Code);
    expect(writtenFile?.content).not.toContain(v2Code);
    unmount();
  });

  test("view artifact A at v1, then save gallery item B -> B's latest version is uploaded", async () => {
    const key = "websocket:c2";
    const session = fakeSession("p1");
    sessionStore.setState({
      profile: { id: "p1", baseUrl: "https://srv.test" } as any,
      session,
      state: "open",
    });

    const bV1Code = "<h1>B Version 1</h1>";
    const bV2Code = "<h1>B Version 2</h1>";

    threadStore.setState({
      threads: {
        [key]: {
          messages: [
            {
              id: "m1",
              role: "assistant",
              content: `\`\`\`html id=artB title="Artifact B"\n${bV1Code}\n\`\`\``,
              createdAt: 100,
            } as never,
            {
              id: "m2",
              role: "assistant",
              content: `\`\`\`html id=artB title="Artifact B"\n${bV2Code}\n\`\`\``,
              createdAt: 200,
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

    // Currently viewed artifact in store is artA at version 0 (v1)
    artifactStore.set("<h1>Artifact A</h1>", "preview.html", {
      id: "artA",
      title: "Artifact A",
      versions: [{ kind: "html", code: "<h1>Artifact A</h1>", title: "v1" }],
      index: 0,
    });

    jest.spyOn(projectsApi, "listProjects").mockResolvedValue({
      projects: [{ id: "proj-1", name: "Demo", path: "/demo", created_at: 1, updated_at: 1, file_count: 0, size_bytes: 0 }],
    });

    const uploadSpy = jest.spyOn(projectsApi, "uploadProjectFile").mockResolvedValueOnce({
      file: { path: "artifact-b.html", size: 10, modified_at: 1 },
    });

    const { unmount } = await renderWithTheme(<GalleryScreen chatKey={key} />);

    await act(async () => {
      fireEvent.press(screen.getByRole("tab", { name: "Artifacts" }));
    });

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Save to project"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("gallery-save-project-row")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("gallery-save-project-row"));
    });

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledTimes(1);
    });

    // The written file should contain artifact B's latest version (bV2Code), NOT bV1Code
    const uploadedName = uploadSpy.mock.calls[0][2];
    const writtenFile = writtenFiles.find((f) => f.name === uploadedName);
    expect(writtenFile).toBeTruthy();
    expect(writtenFile?.content).toContain(bV2Code);
    expect(writtenFile?.content).not.toContain(bV1Code);
    unmount();
  });
});

describe("O-A Task 5: Revoking this phone warning", () => {
  test("shows devices.revokeSelf warning when revoking this phone (matching stored id via pairedDevice.get)", async () => {
    pairingApi.pairedDevice.set("p1", "dev-this-phone");

    const session = {
      ...fakeSession("p1"),
      get: jest.fn().mockResolvedValue({
        devices: [
          { id: "dev-this-phone", name: "Pixel 9", created: 1, last_seen: 100, revoked: false },
        ],
      }),
    } as unknown as NanobotSession;

    const { unmount } = await renderWithTheme(<DevicesCard session={session} />);

    await waitFor(() => {
      expect(screen.getByText("Pixel 9")).toBeTruthy();
    });

    const revokeBtn = screen.getByRole("button", { name: "Revoke" });
    await act(async () => {
      fireEvent.press(revokeBtn);
    });

    // Warning must be present
    expect(screen.getByText(/È questo telefono: verrai disconnesso|This is this phone: you will be disconnected/i)).toBeTruthy();
    unmount();
  });

  test("skips warning if device id does not match or pairedDevice.get has no id", async () => {
    pairingApi.pairedDevice.clear("p1");

    const session = {
      ...fakeSession("p1"),
      get: jest.fn().mockResolvedValue({
        devices: [
          { id: "dev-other-phone", name: "Other Phone", created: 1, last_seen: 100, revoked: false },
        ],
      }),
    } as unknown as NanobotSession;

    const { unmount } = await renderWithTheme(<DevicesCard session={session} />);

    await waitFor(() => {
      expect(screen.getByText("Other Phone")).toBeTruthy();
    });

    const revokeBtn = screen.getByRole("button", { name: "Revoke" });
    await act(async () => {
      fireEvent.press(revokeBtn);
    });

    // Warning must NOT be present
    expect(screen.queryByText(/È questo telefono|This is this phone/i)).toBeNull();
    unmount();
  });

  test("ConnectScreen confirmDelete calls pairedDevice.clear(id)", async () => {
    pairingApi.pairedDevice.set("p-to-delete", "dev-123");
    expect(pairingApi.pairedDevice.get("p-to-delete")).toBe("dev-123");

    const profilesModule = require("../../src/core/profiles");
    jest.spyOn(profilesModule.profiles, "list").mockReturnValue([
      { id: "p-to-delete", name: "Server to delete", baseUrl: "https://del.test" },
    ]);
    const removeSpy = jest.spyOn(profilesModule.profiles, "remove").mockResolvedValue(undefined);

    const { ConnectScreen } = require("../../src/screens/connect/ConnectScreen");
    const { unmount } = await renderWithTheme(<ConnectScreen />);

    // Long press on profile item to open delete dialog
    const item = screen.getByText("Server to delete");
    await act(async () => {
      fireEvent(item, "longPress");
    });

    // Confirm delete
    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    await act(async () => {
      fireEvent.press(deleteBtn);
    });

    expect(removeSpy).toHaveBeenCalledWith("p-to-delete");
    expect(pairingApi.pairedDevice.get("p-to-delete")).toBeNull();
    unmount();
  });
});

describe("O-A Task 6: Viewer libraries bundle verification and test hooks", () => {
  test("setViewerLibForTest and clearViewerLibsForTest work correctly", () => {
    setViewerLibForTest("vega", "const vegaCustom = 1;");
    clearViewerLibsForTest();
  });

  test("Vega-Lite real bundle is non-empty, defines vegaLite, and chart shell embeds it", () => {
    const bundlePath = path.resolve(__dirname, "../../assets/viewers/vega-lite.min.vendorjs");
    expect(fs.existsSync(bundlePath)).toBe(true);
    const text = fs.readFileSync(bundlePath, "utf8");
    expect(text.length).toBeGreaterThan(1000);
    expect(text).toContain("vegaLite");

    const shell = buildShellHtml({
      kind: "chart",
      html: JSON.stringify({ $schema: "https://vega.github.io/schema/vega-lite/v5.json" }),
      libs: { vegaLite: text },
    });
    expect(shell).toContain("<script>");
    expect(shell).toContain(text.slice(0, 100));
  });

  test("Leaflet real bundle is non-empty, defines global L, and map shell embeds it", () => {
    const bundlePath = path.resolve(__dirname, "../../assets/viewers/leaflet.vendorjs");
    expect(fs.existsSync(bundlePath)).toBe(true);
    const text = fs.readFileSync(bundlePath, "utf8");
    expect(text.length).toBeGreaterThan(1000);
    expect(text).toMatch(/\bL\b/);

    const shell = buildShellHtml({
      kind: "map",
      html: JSON.stringify({ type: "FeatureCollection", features: [] }),
      libs: { leaflet: text },
    });
    expect(shell).toContain("<script>");
    expect(shell).toContain(text.slice(0, 100));
  });
});
