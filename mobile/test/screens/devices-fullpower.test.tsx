import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Platform } from "react-native";
import "../../src/i18n";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { DevicesCard } from "../../src/screens/settings/DevicesCard";
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
  sessionStore: {
    getState: () => ({
      close: jest.fn(),
      profile: { id: "p-test", name: "Profile", baseUrl: "http://127.0.0.1:8765", auth: "cookie" },
    }),
  },
  useSession: () => ({
    session: {
      baseUrl: "http://127.0.0.1:8765",
      apiToken: () => "mock-token",
    },
    profile: { id: "p-test", name: "Profile", baseUrl: "http://127.0.0.1:8765", auth: "cookie" },
  }),
}));

describe("DevicesCard Full Power", () => {
  const originalOS = Platform.OS;
  const originalWindow = global.window;
  let listDevicesMock: jest.SpyInstance;
  let setFullPowerMock: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage("en");
    listDevicesMock = jest.spyOn(pairingModule, "listDevices");
    setFullPowerMock = jest.spyOn(pairingModule, "setFullPower");
  });

  afterEach(() => {
    Platform.OS = originalOS;
    if (originalWindow !== undefined) {
      global.window = originalWindow;
    }
    listDevicesMock.mockRestore();
    setFullPowerMock.mockRestore();
  });

  const session = {
    baseUrl: "http://127.0.0.1:8765",
    apiToken: () => "mock-token",
  } as any;

  const renderCard = async () => {
    return render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <DevicesCard session={session} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  };

  test("in server mode: switch shows; turning ON asks confirmation dialog, calls setFullPower(id, true) and reloads", async () => {
    Platform.OS = "web";
    (global as any).window = { location: { hostname: "localhost" } };

    listDevicesMock.mockResolvedValue([
      { id: "dev-phone", name: "Pixel 7", created: 1000, last_seen: 2000, revoked: false, full_power: false },
    ]);
    setFullPowerMock.mockResolvedValue(undefined);

    await renderCard();

    await waitFor(() => {
      expect(screen.getByText("Pixel 7")).toBeTruthy();
    });

    // Switch for full power exists
    const switchElem = screen.getByRole("switch");
    expect(switchElem).toBeTruthy();
    expect(switchElem.props.value).toBe(false);

    // Toggle ON -> confirmation dialog opens
    await act(async () => {
      fireEvent(switchElem, "valueChange", true);
    });

    expect(screen.getByText(i18n.t("devices.fullPowerConfirm"))).toBeTruthy();

    // Confirm dialog
    const confirmBtn = screen.getByRole("button", { name: i18n.t("common.ok") });
    await act(async () => {
      fireEvent.press(confirmBtn);
    });

    expect(setFullPowerMock).toHaveBeenCalledWith(session, "dev-phone", true);
    // Reloads list
    expect(listDevicesMock).toHaveBeenCalledTimes(2);
  });

  test("in server mode: turning OFF calls setFullPower(id, false) without dialog and reloads", async () => {
    Platform.OS = "web";
    (global as any).window = { location: { hostname: "127.0.0.1" } };

    listDevicesMock.mockResolvedValue([
      { id: "dev-phone", name: "Pixel 7", created: 1000, last_seen: 2000, revoked: false, full_power: true },
    ]);
    setFullPowerMock.mockResolvedValue(undefined);

    await renderCard();

    await waitFor(() => {
      expect(screen.getByText("Pixel 7")).toBeTruthy();
    });

    const switchElem = screen.getByRole("switch");
    expect(switchElem.props.value).toBe(true);

    // Toggle OFF -> immediately calls setFullPower without dialog
    await act(async () => {
      fireEvent(switchElem, "valueChange", false);
    });

    expect(screen.queryByText(i18n.t("devices.fullPowerConfirm"))).toBeNull();
    expect(setFullPowerMock).toHaveBeenCalledWith(session, "dev-phone", false);
    expect(listDevicesMock).toHaveBeenCalledTimes(2);
  });

  test("in server mode: 403 local_browser_only shows toast devices.fullPowerLocalOnly", async () => {
    Platform.OS = "web";
    (global as any).window = { location: { hostname: "127.0.0.1" } };

    listDevicesMock.mockResolvedValue([
      { id: "dev-phone", name: "Pixel 7", created: 1000, last_seen: 2000, revoked: false, full_power: false },
    ]);
    setFullPowerMock.mockRejectedValueOnce(Object.assign(new Error("local_browser_only"), { error: "local_browser_only", status: 403 }));

    await renderCard();

    await waitFor(() => {
      expect(screen.getByText("Pixel 7")).toBeTruthy();
    });

    const switchElem = screen.getByRole("switch");
    await act(async () => {
      fireEvent(switchElem, "valueChange", true);
    });

    const confirmBtn = screen.getByRole("button", { name: i18n.t("common.ok") });
    await act(async () => {
      fireEvent.press(confirmBtn);
    });

    expect(toast.show).toHaveBeenCalledWith(i18n.t("devices.fullPowerLocalOnly"));
  });

  test("on phone / remote web: shows small badge for full_power devices, NO switch", async () => {
    Platform.OS = "android";

    listDevicesMock.mockResolvedValue([
      { id: "dev-phone", name: "Pixel 7", created: 1000, last_seen: 2000, revoked: false, full_power: true },
      { id: "dev-tablet", name: "Tablet", created: 1000, last_seen: 2000, revoked: false, full_power: false },
    ]);

    await renderCard();

    await waitFor(() => {
      expect(screen.getByText("Pixel 7")).toBeTruthy();
    });

    // No switch rendered
    expect(screen.queryByRole("switch")).toBeNull();

    // Badge text "Full power" shown for Pixel 7
    expect(screen.getByText(i18n.t("devices.fullPower"))).toBeTruthy();
  });
});
