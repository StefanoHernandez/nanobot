import { Platform } from "react-native";
import { isServerBrowser } from "../../src/platform/serverMode";

describe("isServerBrowser", () => {
  const originalOS = Platform.OS;
  const originalWindow = global.window;

  afterEach(() => {
    Platform.OS = originalOS;
    // restore window
    if (originalWindow !== undefined) {
      global.window = originalWindow;
    }
  });

  test("true for localhost, 127.0.0.1 and [::1] on web", () => {
    Platform.OS = "web";

    // localhost
    (global as any).window = { location: { hostname: "localhost" } };
    expect(isServerBrowser()).toBe(true);

    // 127.0.0.1
    (global as any).window = { location: { hostname: "127.0.0.1" } };
    expect(isServerBrowser()).toBe(true);

    // [::1]
    (global as any).window = { location: { hostname: "[::1]" } };
    expect(isServerBrowser()).toBe(true);
  });

  test("false for other hosts on web", () => {
    Platform.OS = "web";

    (global as any).window = { location: { hostname: "nanobot.local" } };
    expect(isServerBrowser()).toBe(false);

    (global as any).window = { location: { hostname: "arduino.tailnet.ts.net" } };
    expect(isServerBrowser()).toBe(false);

    (global as any).window = { location: { hostname: "192.168.1.10" } };
    expect(isServerBrowser()).toBe(false);
  });

  test("false on android even if hostname is localhost", () => {
    Platform.OS = "android";
    (global as any).window = { location: { hostname: "localhost" } };
    expect(isServerBrowser()).toBe(false);
  });

  test("false when window or window.location is undefined", () => {
    Platform.OS = "web";
    (global as any).window = undefined;
    expect(isServerBrowser()).toBe(false);
  });
});
