import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { Asset } from "expo-asset";
import { readViewerLib, clearViewerLibsForTest, loadViewerLibs } from "../../src/screens/viewer/viewerLibs";

jest.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: jest.fn(),
}));

jest.mock("expo-asset", () => ({
  Asset: {
    fromModule: jest.fn(() => ({
      uri: "http://localhost:8081/assets/vendor/pako.vendorjs",
      localUri: "file:///data/user/0/host.exp.exponent/cache/pako.vendorjs",
      downloadAsync: jest.fn(async () => {}),
    })),
  },
}));

describe("viewerLibs", () => {
  const originalPlatform = Platform.OS;
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearViewerLibsForTest();
    jest.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: originalPlatform, configurable: true });
    global.fetch = originalFetch;
  });

  test("reads library using FileSystem on native platforms", async () => {
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue("/* pako native source */");

    const result = await readViewerLib("pako");
    expect(result).toBe("/* pako native source */");
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
      "file:///data/user/0/host.exp.exponent/cache/pako.vendorjs"
    );
  });

  test("reads library using fetch on web platform", async () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue("/* pako web source */"),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await readViewerLib("pako");
    expect(result).toBe("/* pako web source */");
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:8081/assets/vendor/pako.vendorjs");
    expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
  });

  test("loadViewerLibs loads multiple libraries on web", async () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue("/* lib content */"),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const libs = await loadViewerLibs(["pako"]);
    expect(libs.pako).toBe("/* lib content */");
  });

  test("LRU: keeps at most 3 most recently used libraries in memory; others are re-read", async () => {
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    (FileSystem.readAsStringAsync as jest.Mock)
      .mockResolvedValueOnce("/* pako */")
      .mockResolvedValueOnce("/* pdfjs */")
      .mockResolvedValueOnce("/* jszip */")
      .mockResolvedValueOnce("/* mermaid */")
      .mockResolvedValueOnce("/* pako re-read */");

    // Read 1: pako
    await readViewerLib("pako");
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(1);

    // Read 2: pdfjs
    await readViewerLib("pdfjs");
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(2);

    await readViewerLib("jszip");
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(3);

    // Read 4: mermaid -> evicts pako (oldest), keeping pdfjs, jszip, mermaid
    await readViewerLib("mermaid");
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(4);

    // pdfjs is still cached
    const pdfjsAgain = await readViewerLib("pdfjs");
    expect(pdfjsAgain).toBe("/* pdfjs */");
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(4);

    // pako was evicted: re-read from the asset
    const pakoAgain = await readViewerLib("pako");
    expect(pakoAgain).toBe("/* pako re-read */");
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(5);
  });
});
