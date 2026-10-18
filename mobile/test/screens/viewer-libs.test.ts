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
      text: jest.fn().mockResolvedValue("/* lib content */"),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const libs = await loadViewerLibs(["pako"]);
    expect(libs.pako).toBe("/* lib content */");
  });
});
