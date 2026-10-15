import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../../src/i18n";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { ConnectScreen } from "../../src/screens/connect/ConnectScreen";
import { profiles, testConnection } from "../../src/core/profiles";
import { router } from "expo-router";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), canDismiss: jest.fn(() => true), dismissAll: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false, canAskAgain: false }, jest.fn()],
}));
const mockOpen = jest.fn(async () => {});
jest.mock("../../src/state/sessionStore", () => ({ sessionStore: { getState: () => ({ open: mockOpen, close: jest.fn() }) } }));
jest.mock("../../src/core/profiles", () => ({
  normalizeBaseUrl: (s: string) => (/^https?:\/\/\S+$/.test(s) ? s.replace(/\/+$/, "") : null),
  testConnection: jest.fn(),
  profiles: {
    list: jest.fn(() => []),
    save: jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
    setActive: jest.fn(),
    getSecret: jest.fn(async () => ""),
    activeId: jest.fn(() => null),
  },
}));

const mockTest = testConnection as jest.Mock;
const fetchMock = jest.fn();

beforeEach(async () => {
  jest.clearAllMocks();
  global.fetch = fetchMock as typeof fetch;
  await i18n.changeLanguage("en");
});

const show = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <ThemeProvider>
        <ConnectScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

test("paste pairing JSON claims without Authorization and saves device token", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ device_token: "nbdev_secret", id: "d1", name: "Telefono" }),
  });
  mockTest.mockResolvedValue({ ok: true });

  await show();
  await fireEvent.press(screen.getByText("Scan code"));
  const qr = JSON.stringify({ v: 1, url: "https://a.ts.net", code: "PAIR-CODE" });
  await fireEvent.changeText(screen.getByLabelText("Paste the code"), qr);
  const scanButtons = screen.getAllByRole("button", { name: "Scan code" });
  await act(async () => {
    fireEvent.press(scanButtons[scanButtons.length - 1]!);
  });

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());

  expect(fetchMock).toHaveBeenCalledWith(
    "https://a.ts.net/api/ext/devices/claim",
    expect.objectContaining({
      credentials: "omit",
      headers: expect.not.objectContaining({ Authorization: expect.anything() }),
    }),
  );
  expect(profiles.save).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: "https://a.ts.net" }), "nbdev_secret");
  expect(mockOpen).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith("/");
});
