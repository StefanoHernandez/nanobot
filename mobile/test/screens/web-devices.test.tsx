import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Platform } from "react-native";
import "../../src/i18n";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { DevicesCard } from "../../src/screens/settings/DevicesCard";
import { AboutSection } from "../../src/screens/settings/AboutSection";
import { pairedDevice } from "../../src/core/pairing";
import { profiles } from "../../src/core/profiles";
import { sessionStore } from "../../src/state/sessionStore";
import { toast } from "../../src/ui/components";
import { router } from "expo-router";

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

const mockClose = jest.fn();
jest.mock("../../src/state/sessionStore", () => ({
  sessionStore: {
    getState: () => ({
      close: mockClose,
      profile: { id: "p-web", name: "Browser Profile", baseUrl: "http://localhost:8765", auth: "cookie" },
    }),
  },
  useSession: () => ({
    session: {
      baseUrl: "http://localhost:8765",
      apiToken: () => "mock-token",
      get: jest.fn(async (path: string) => {
        if (path === "/api/ext/devices") {
          return {
            devices: [
              { id: "dev-web", name: "Chrome su Linux", created: 1000, last_seen: 2000, revoked: false },
              { id: "dev-phone", name: "Pixel 7", created: 500, last_seen: 1500, revoked: false },
            ],
          };
        }
        if (path === "/api/settings/version-check") return { updateAvailable: false };
        return {};
      }),
    },
    profile: { id: "p-web", name: "Browser Profile", baseUrl: "http://localhost:8765", auth: "cookie" },
  }),
}));

describe("Web Devices & Logout", () => {
  let fetchMock: jest.Mock;
  const originalOS = Platform.OS;

  beforeEach(async () => {
    jest.clearAllMocks();
    fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    await i18n.changeLanguage("en");
    // Set active profile and paired device
    await profiles.save({ id: "p-web", name: "Browser Profile", baseUrl: "http://localhost:8765", auth: "cookie" });
    pairedDevice.set("p-web", "dev-web");
    profiles.setActive("p-web");
    Platform.OS = "web";
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  test("DevicesCard on web: shows current device as 'this browser' and logout button", async () => {
    const session = {
      baseUrl: "http://localhost:8765",
      apiToken: () => "mock-token",
      get: jest.fn(async () => ({
        devices: [
          { id: "dev-web", name: "Chrome su Linux", created: 1000, last_seen: 2000, revoked: false },
          { id: "dev-phone", name: "Pixel 7", created: 500, last_seen: 1500, revoked: false },
        ],
      })),
    } as any;

    render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <DevicesCard session={session} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(new RegExp(`Chrome su Linux.*${i18n.t("devices.thisBrowser")}`, "i"))).toBeTruthy();
    });

    const logoutBtn = screen.getByText(i18n.t("devices.logoutBrowser"));
    expect(logoutBtn).toBeTruthy();

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    await act(async () => {
      fireEvent.press(logoutBtn);
    });

    const confirmBtn = screen.getAllByRole("button", { name: new RegExp(i18n.t("devices.logoutBrowser"), "i") });
    await act(async () => {
      fireEvent.press(confirmBtn[confirmBtn.length - 1]!);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8765/api/ext/devices/web-logout",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: {
          "X-Nanobot-Cookie-Auth": "1",
        },
      }),
    );

    expect(pairedDevice.get("p-web")).toBeNull();
    expect(mockClose).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/connect");
  });

  test("DevicesCard on web: uses about.devicesAll ('Linked devices') for card header", async () => {
    const session = {
      baseUrl: "http://localhost:8765",
      apiToken: () => "mock-token",
      get: jest.fn(async () => ({ devices: [] })),
    } as any;

    render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <DevicesCard session={session} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t("about.devicesAll"))).toBeTruthy();
    });
  });

  test("AboutSection on web: shows about.pairDevice ('Link a device') disabled with hint devices.pairFromServer", async () => {
    render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <AboutSection />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t("devices.pairFromServer"))).toBeTruthy();
    });

    const pairBtn = screen.getByRole("button", { name: i18n.t("about.pairDevice") });
    expect(pairBtn.props.accessibilityState?.disabled ?? pairBtn.props.disabled).toBe(true);
  });

  test("DevicesCard on web without device id: shows logout button, calls webLogout and removes profile", async () => {
    // pairedDevice.get has no id (e.g. site data cleared)
    pairedDevice.clear("p-web");

    const session = {
      baseUrl: "http://localhost:8765",
      apiToken: () => "mock-token",
      get: jest.fn(async () => ({
        devices: [{ id: "dev-other", name: "Other Phone", created: 100, last_seen: 200, revoked: false }],
      })),
    } as any;

    render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <DevicesCard session={session} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Other Phone")).toBeTruthy();
    });

    // Logout button must still be present
    const logoutBtn = screen.getByText(i18n.t("devices.logoutBrowser"));
    expect(logoutBtn).toBeTruthy();

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    await act(async () => {
      fireEvent.press(logoutBtn);
    });

    // Confirm dialog
    const confirmBtn = screen.getAllByRole("button", { name: new RegExp(i18n.t("devices.logoutBrowser"), "i") });
    await act(async () => {
      fireEvent.press(confirmBtn[confirmBtn.length - 1]!);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8765/api/ext/devices/web-logout",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: {
          "X-Nanobot-Cookie-Auth": "1",
        },
      }),
    );

    expect(profiles.list().find((p) => p.id === "p-web")).toBeUndefined();
    expect(mockClose).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/connect");
  });

  test("DevicesCard on web: when webLogout fails with network error, shows common.operationFailed and keeps profile", async () => {
    pairedDevice.clear("p-web");

    const session = {
      baseUrl: "http://localhost:8765",
      apiToken: () => "mock-token",
      get: jest.fn(async () => ({ devices: [] })),
    } as any;

    render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <DevicesCard session={session} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t("devices.logoutBrowser"))).toBeTruthy();
    });

    // Network error on webLogout
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await act(async () => {
      fireEvent.press(screen.getByText(i18n.t("devices.logoutBrowser")));
    });

    const confirmBtn = screen.getAllByRole("button", { name: new RegExp(i18n.t("devices.logoutBrowser"), "i") });
    await act(async () => {
      fireEvent.press(confirmBtn[confirmBtn.length - 1]!);
    });

    await waitFor(() => {
      expect(toast.show).toHaveBeenCalledWith(i18n.t("common.operationFailed"));
    });

    // Profile is KEPT so user can try again
    expect(profiles.list().find((p) => p.id === "p-web")).toBeDefined();
    expect(mockClose).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalledWith("/connect");
  });
});
