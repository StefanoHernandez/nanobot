import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../../src/i18n";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { ConnectScreen as WebConnectScreen } from "../../src/screens/connect/ConnectScreen.web";
import { profiles } from "../../src/core/profiles";
import { pairedDevice } from "../../src/core/pairing";
import { router, useLocalSearchParams } from "expo-router";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), canDismiss: jest.fn(() => true), dismissAll: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

const mockOpen = jest.fn(async () => {});
const mockClose = jest.fn();
jest.mock("../../src/state/sessionStore", () => ({
  sessionStore: {
    getState: () => ({
      open: mockOpen,
      close: mockClose,
      profile: { id: "p1", name: "Browser", baseUrl: "http://localhost:8765", auth: "cookie" },
    }),
  },
}));

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("Web Login Screen (ConnectScreen.web)", () => {
  let fetchMock: jest.Mock;
  let storage: Storage;

  beforeEach(async () => {
    jest.clearAllMocks();
    fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    storage = fakeStorage();
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "location", {
      value: { origin: "http://localhost:8765", host: "localhost:8765", pathname: "/", search: "" },
      configurable: true,
      writable: true,
    });
    await i18n.changeLanguage("en");
  });

  const show = () =>
    render(
      <SafeAreaProvider
        initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
      >
        <ThemeProvider>
          <WebConnectScreen />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

  test("web login with code: posts same-origin, saves cookie profile and paired device id, no secret in localStorage", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: "device-123", name: "Browser – Chrome on Linux" }),
    });

    await show();

    // Default tab is pairing code
    const codeInput = screen.getByLabelText(i18n.t("connect.pairingCode"));
    await fireEvent.changeText(codeInput, "PAIR-CODE-123");

    const submitBtn = screen.getByRole("button", { name: i18n.t("connect.submit") });
    await act(async () => {
      fireEvent.press(submitBtn);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8765/api/ext/devices/web-login",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify({ code: "PAIR-CODE-123", name: "Browser – Chrome on Linux" }),
      }),
    );

    // Profile saved with auth: cookie and baseUrl: location.origin
    const savedProfiles = profiles.list();
    expect(savedProfiles.length).toBeGreaterThan(0);
    const active = savedProfiles.find((p) => p.id === profiles.activeId());
    expect(active).toBeDefined();
    expect(active?.auth).toBe("cookie");
    expect(active?.baseUrl).toBe("http://localhost:8765");
    expect(active?.hasSecret).toBe(false);

    // Paired device id saved
    expect(pairedDevice.get(active!.id)).toBe("device-123");

    // Scan every key and value in localStorage - no secret or token
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)!;
      const v = storage.getItem(k)!;
      expect(k).not.toContain("secret");
      expect(v).not.toContain("PAIR-CODE-123");
      expect(v).not.toContain("device_token");
    }

    expect(mockOpen).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/");
  });

  test("web login with secret: posts same-origin, clears secret from state, no secret in localStorage", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: "device-sec-456", name: "Browser – Chrome on Linux" }),
    });

    await show();

    // Switch to Server Secret tab
    const secretTab = screen.getByText(i18n.t("connect.serverSecretTab"));
    await fireEvent.press(secretTab);

    const secretInput = screen.getByLabelText(i18n.t("connect.secret"));
    await fireEvent.changeText(secretInput, "my-super-secret-password");

    const submitBtn = screen.getByRole("button", { name: i18n.t("connect.submit") });
    await act(async () => {
      fireEvent.press(submitBtn);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8765/api/ext/devices/web-login",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ secret: "my-super-secret-password", name: "Browser – Chrome on Linux" }),
      }),
    );

    // Scan every key and value in localStorage: NO secret stored
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)!;
      const v = storage.getItem(k)!;
      expect(k).not.toContain("secret");
      expect(v).not.toContain("my-super-secret-password");
    }

    expect(mockOpen).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/");
  });

  test("error mapping: 401 on code tab maps to connect.badCode", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "unauthorized" }),
    });

    await show();
    const codeInput = screen.getByLabelText(i18n.t("connect.pairingCode"));
    await fireEvent.changeText(codeInput, "EXPIRED-CODE");
    const submitBtn = screen.getByRole("button", { name: i18n.t("connect.submit") });
    await act(async () => {
      fireEvent.press(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(i18n.t("connect.badCode"))).toBeTruthy();
    });
  });

  test("error mapping: 401 on secret tab maps to connect.badSecret", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "unauthorized" }),
    });

    await show();
    await fireEvent.press(screen.getByText(i18n.t("connect.serverSecretTab")));
    const secretInput = screen.getByLabelText(i18n.t("connect.secret"));
    await fireEvent.changeText(secretInput, "wrong-password");
    const submitBtn = screen.getByRole("button", { name: i18n.t("connect.submit") });
    await act(async () => {
      fireEvent.press(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(i18n.t("connect.badSecret"))).toBeTruthy();
    });
  });

  test("error mapping: 429 maps to connect.tooManyAttempts", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: "too_many_attempts" }),
    });

    await show();
    const codeInput = screen.getByLabelText(i18n.t("connect.pairingCode"));
    await fireEvent.changeText(codeInput, "SOME-CODE");
    const submitBtn = screen.getByRole("button", { name: i18n.t("connect.submit") });
    await act(async () => {
      fireEvent.press(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(i18n.t("connect.tooManyAttempts"))).toBeTruthy();
    });
  });

  test("error mapping: network failure maps to common.operationFailed", async () => {
    fetchMock.mockRejectedValueOnce(new Error("NetworkError"));

    await show();
    const codeInput = screen.getByLabelText(i18n.t("connect.pairingCode"));
    await fireEvent.changeText(codeInput, "SOME-CODE");
    const submitBtn = screen.getByRole("button", { name: i18n.t("connect.submit") });
    await act(async () => {
      fireEvent.press(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(i18n.t("common.operationFailed"))).toBeTruthy();
    });
  });

  test("reason=web_session_ended shows connect.webSessionEnded banner", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ reason: "web_session_ended" });

    await show();

    expect(screen.getByText(i18n.t("connect.webSessionEnded"))).toBeTruthy();
  });
});
