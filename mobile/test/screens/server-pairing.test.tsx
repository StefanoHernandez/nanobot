import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Platform } from "react-native";
import "../../src/i18n";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { AboutSection } from "../../src/screens/settings/AboutSection";
import * as pairingModule from "../../src/core/pairing";
import { toast } from "../../src/ui/components";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn(), canDismiss: jest.fn(() => true), dismissAll: jest.fn() },
}));

jest.mock("../../src/ui/components/Toast", () => {
  const actual = jest.requireActual("../../src/ui/components/Toast");
  return {
    ...actual,
    toast: {
      show: jest.fn(),
      setLift: jest.fn(),
    },
  };
});

jest.mock("../../src/state/sessionStore", () => ({
  useSession: () => ({
    session: {
      baseUrl: "http://127.0.0.1:8765",
      apiToken: () => "mock-token",
      get: jest.fn(async () => ({ updateAvailable: false })),
    },
    profile: { id: "p-server", name: "Local Server", baseUrl: "http://127.0.0.1:8765", auth: "cookie" },
  }),
}));

describe("Server Mode Pairing (AboutSection)", () => {
  const originalOS = Platform.OS;
  const originalWindow = global.window;
  let mintMock: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage("en");
    mintMock = jest.spyOn(pairingModule, "mintPairingCode");
  });

  afterEach(() => {
    Platform.OS = originalOS;
    if (originalWindow !== undefined) {
      global.window = originalWindow;
    }
    mintMock.mockRestore();
  });

  const renderScreen = async () => {
    return render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <AboutSection />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  };

  test("in server mode: pairing button is enabled, url is sent in body, persisted, and invalid_url toasts", async () => {
    Platform.OS = "web";
    const storage: Record<string, string> = {};
    (global as any).window = {
      location: { hostname: "127.0.0.1" },
      localStorage: {
        getItem: (k: string) => storage[k] ?? null,
        setItem: (k: string, v: string) => { storage[k] = v; },
      },
    };

    await renderScreen();

    // 1. Text field "Phone address" is present with placeholder
    const phoneInput = screen.getByPlaceholderText("https://arduino.tuo-tailnet.ts.net:8765");
    expect(phoneInput).toBeTruthy();

    // When empty, hint is shown
    expect(screen.getByText(i18n.t("devices.phoneUrlHint"))).toBeTruthy();

    // 2. Button "Link a device" is enabled
    const pairBtn = screen.getByRole("button", { name: i18n.t("about.pairDevice") });
    expect(pairBtn.props.accessibilityState?.disabled ?? pairBtn.props.disabled).toBeFalsy();

    // 3. Type an address -> persists to storage
    await act(async () => {
      fireEvent.changeText(phoneInput, "https://arduino.tailnet.ts.net:8765");
    });
    expect(storage["nanobot.pairing.phoneUrl"]).toBe("https://arduino.tailnet.ts.net:8765");

    // 4. Press pair -> calls mintPairingCode with url
    mintMock.mockResolvedValueOnce({
      code: "1234-5678",
      qr: JSON.stringify({ v: 1, url: "https://arduino.tailnet.ts.net:8765", code: "1234-5678" }),
    });

    await act(async () => {
      fireEvent.press(pairBtn);
    });

    expect(mintMock).toHaveBeenCalledWith(
      expect.anything(),
      "https://arduino.tailnet.ts.net:8765",
    );

    // Dialog with QR code appears
    expect(screen.getByText("1234-5678")).toBeTruthy();

    // Close dialog
    const closeBtn = screen.getByText(i18n.t("common.close"));
    await act(async () => {
      fireEvent.press(closeBtn);
    });

    // 5. invalid_url toast on server error
    mintMock.mockRejectedValueOnce(Object.assign(new Error("invalid_url"), { error: "invalid_url", status: 400 }));

    await act(async () => {
      fireEvent.press(pairBtn);
    });

    expect(toast.show).toHaveBeenCalledWith(i18n.t("devices.phoneUrlInvalid"));
  });

  test("outside server mode on web (e.g. remote hostname): button is disabled with pairFromServer hint", async () => {
    Platform.OS = "web";
    (global as any).window = {
      location: { hostname: "arduino.tailnet.ts.net" },
    };

    await renderScreen();

    // No phone address input
    expect(screen.queryByPlaceholderText("https://arduino.tuo-tailnet.ts.net:8765")).toBeNull();

    // Hint is shown
    expect(screen.getByText(i18n.t("devices.pairFromServer"))).toBeTruthy();

    // Button is disabled
    const pairBtn = screen.getByRole("button", { name: i18n.t("about.pairDevice") });
    expect(pairBtn.props.accessibilityState?.disabled ?? pairBtn.props.disabled).toBe(true);
  });
});
