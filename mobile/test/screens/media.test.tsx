import "../../src/platform/install";
import { i18n } from "../../src/i18n";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import { File } from "expo-file-system";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { sessionStore } from "../../src/state/sessionStore";
import { MessageRow } from "../../src/screens/thread/MessageRow";
import { absoluteMediaUrl, classify, downloadMedia, safeName } from "../../src/screens/thread/media/media";

beforeAll(() => i18n.changeLanguage("it"));

jest.mock("expo-audio", () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 10 }),
}));
const mockFs = { existing: new Set<string>(), failDownload: false, downloaded: [] as string[] };
jest.mock("expo-file-system", () => {
  const mk = (...p: any[]) => {
    const uri = p.map((x) => (typeof x === "string" ? x : x.uri)).join("/");
    return {
      uri,
      get exists() { return mockFs.existing.has(uri); },
      move: jest.fn(async (dest: any) => { mockFs.existing.delete(uri); mockFs.existing.add(dest.uri); }),
      delete: jest.fn(() => void mockFs.existing.delete(uri)),
    };
  };
  const File: any = jest.fn(mk);
  File.downloadFileAsync = jest.fn(async (_u: string, dest: any) => {
    mockFs.existing.add(dest.uri); // Android leaves a partial file even on failure
    if (mockFs.failDownload) throw new Error("UnableToDownload 500");
    return dest;
  });
  return { File, Directory: jest.fn((...p: any[]) => ({ uri: p.map((x) => (typeof x === "string" ? x : x.uri)).join("/"), create: jest.fn() })), Paths: { cache: { uri: "file:///cache" } } };
});
jest.mock("expo-file-system/legacy", () => ({ getContentUriAsync: jest.fn(async (u: string) => "content://" + u) }));
jest.mock("expo-intent-launcher", () => ({ startActivityAsync: jest.fn(async () => ({})) }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn(async () => {}) }));
jest.mock("../../src/ui/markdown/Markdown", () => {
  const { Text } = require("react-native");
  return { Markdown: ({ text }: { text: string }) => <Text>{text}</Text> };
});

const DOC = "application/msword";
const BASE = "http://h:8765";
const msg = (media: unknown[]) => ({ type: "message" as const, message: { id: "a", role: "assistant", content: "ciao", createdAt: 0, media } as never });
const mount = (media: unknown[]) => {
  sessionStore.setState({ profile: { baseUrl: BASE } as never });
  return render(<ThemeProvider><MessageRow unit={msg(media) as never} live={false} /></ThemeProvider>);
};

beforeEach(() => { jest.clearAllMocks(); mockFs.existing.clear(); mockFs.failDownload = false; });

test("classify", () => {
  expect(classify({ kind: "file", name: "voice.ogg" })).toBe("audio");
  expect(classify({ kind: "file", name: "deck.doc" })).toBe("file");
  expect(classify({ kind: "image", name: "a.png" })).toBe("image");
});

test("absoluteMediaUrl", () => {
  expect(absoluteMediaUrl(BASE + "/", "/api/media/s/a.png")).toBe(BASE + "/api/media/s/a.png");
  expect(absoluteMediaUrl(BASE, "https://x/y.png")).toBe("https://x/y.png");
  expect(absoluteMediaUrl(BASE, "data:image/png;base64,AA")).toBe("data:image/png;base64,AA");
});

test("an open image can be shared", async () => {
  await mount([{ kind: "image", url: "/api/media/s/a.png", name: "a.png" }]);
  await fireEvent.press(screen.getByLabelText("a.png"));
  await fireEvent.press(screen.getByLabelText("Condividi"));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
  const shared = (Sharing.shareAsync as jest.Mock).mock.calls[0][0] as string;
  expect(shared.startsWith("file://")).toBe(true);
  expect(shared).not.toContain("SECRET");
  expect(shared).not.toContain("http");
});

test("renders image, audio and file card", async () => {
  await mount([
    { kind: "image", url: "/api/media/s/a.png", name: "a.png" },
    { kind: "file", url: "/api/media/s/v.ogg", name: "v.ogg" },
    { kind: "file", url: "/api/media/s/d.doc", name: "deck.doc" },
  ]);
  expect(screen.getByTestId("media-image")).toBeTruthy();
  expect(screen.getByLabelText("Riproduci")).toBeTruthy();
  expect(screen.getByText("deck.doc")).toBeTruthy();
});

test("open doc downloads once then launches the viewer", async () => {
  await mount([{ kind: "file", url: "/api/media/s/d.doc", name: "deck.doc" }]);
  await fireEvent.press(screen.getByText("deck.doc"));
  await waitFor(() => expect(IntentLauncher.startActivityAsync).toHaveBeenCalled());
  expect(File.downloadFileAsync).toHaveBeenCalledTimes(1);
  expect((File.downloadFileAsync as jest.Mock).mock.calls[0][0]).toBe(BASE + "/api/media/s/d.doc");
  expect((IntentLauncher.startActivityAsync as jest.Mock).mock.calls[0][1]).toMatchObject({ type: DOC, flags: 1 });
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

test("falls back to share when no app handles the file; long-press shares directly", async () => {
  (IntentLauncher.startActivityAsync as jest.Mock).mockRejectedValueOnce(new Error("no app"));
  await mount([{ kind: "file", url: "/api/media/s/d.doc", name: "deck.doc" }]);
  await fireEvent.press(screen.getByText("deck.doc"));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
  await fireEvent(screen.getByText("deck.doc"), "longPress");
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(2));
});

test("missing url shows the placeholder", async () => {
  await mount([{ kind: "file", name: "gone.pdf" }]);
  expect(screen.getByText(/File non disponibile/)).toBeTruthy();
});

test("never logs the url", async () => {
  const spies = (["log", "info", "warn", "error"] as const).map((k) => jest.spyOn(console, k).mockImplementation(() => {}));
  await mount([{ kind: "file", url: "/api/media/SECRET/d.doc", name: "deck.doc" }]);
  await fireEvent.press(screen.getByText("deck.doc"));
  await waitFor(() => expect(IntentLauncher.startActivityAsync).toHaveBeenCalled());
  for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain("SECRET");
  spies.forEach((s) => s.mockRestore());
});

test("safeName never yields empty, . or ..", () => {
  expect(safeName("..")).toBe("file");
  expect(safeName(".")).toBe("file");
  expect(safeName("  ")).toBe("file");
  expect(safeName("../x.pdf")).toBe(".._x.pdf");
  expect(safeName("a/b.pptx")).toBe("a_b.pptx");
  expect(safeName("deck.pptx")).toBe("deck.pptx");
});

test("failed download leaves no reusable target and the next open retries", async () => {
  mockFs.failDownload = true;
  await expect(downloadMedia(BASE + "/api/media/s/d.pptx", "deck.pptx")).rejects.toThrow();
  expect([...mockFs.existing].some((u) => u.endsWith("deck.pptx") || u.endsWith(".part"))).toBe(false);
  mockFs.failDownload = false;
  const uri = await downloadMedia(BASE + "/api/media/s/d.pptx", "deck.pptx");
  expect(uri.endsWith("/deck.pptx")).toBe(true);
  expect(File.downloadFileAsync).toHaveBeenCalledTimes(2);
  await downloadMedia(BASE + "/api/media/s/d.pptx", "deck.pptx"); // complete file is reused
  expect(File.downloadFileAsync).toHaveBeenCalledTimes(2);
});
