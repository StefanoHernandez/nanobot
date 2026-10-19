jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => {}),
  requestPermissionsAsync: jest.fn(async () => ({})),
  setNotificationHandler: jest.fn(),
  useLastNotificationResponse: jest.fn(() => null),
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 77 },
}));
jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));
jest.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: jest.fn(),
  allowScreenCaptureAsync: jest.fn(),
}));
const mockPush = jest.fn();
const mockDismissAll = jest.fn();
const mockReplace = jest.fn();
const mockCanDismiss = jest.fn(() => true);
jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    dismissAll: (...args: unknown[]) => mockDismissAll(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    canDismiss: () => mockCanDismiss(),
  },
  useRootNavigationState: jest.fn(() => ({ key: "root-nav" })),
  useLocalSearchParams: jest.fn(() => ({})),
}));
const mockShareIntentState = {
  hasShareIntent: false,
  shareIntent: { type: "text" as const, text: "shared text" },
  resetShareIntent: jest.fn(() => {
    mockShareIntentState.hasShareIntent = false;
  }),
};
jest.mock("expo-share-intent", () => ({
  useShareIntent: () => mockShareIntentState,
}));
jest.mock("../../src/extras/share", () => ({
  handleShare: jest.fn(async () => {}),
}));
jest.mock("../../src/core/profiles", () => ({
  normalizeBaseUrl: (s: string) => (/^https?:\/\/\S+$/.test(s) ? s.replace(/\/+$/, "") : null),
  testConnection: jest.fn(async () => ({ ok: true })),
  profiles: {
    list: jest.fn(() => []),
    save: jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
    setActive: jest.fn(),
    getSecret: jest.fn(async () => ""),
    activeId: jest.fn(() => "p1"),
  },
}));

import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { ToastHost, toast } from "../../src/ui/components/ToastHost";
import { lockStore } from "../../src/extras/lock";
import { NativeIntegrations } from "../../app/NativeIntegrations";
import { handleShare } from "../../src/extras/share";
import { sessionStore } from "../../src/state/sessionStore";
import { ConnectScreen } from "../../src/screens/connect/ConnectScreen";
import { testConnection } from "../../src/core/profiles";
import { isInsecureHttpUrl, isLocalOrTailscaleHost } from "../../src/screens/connect/insecureHttp";

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe("LK-A: 1. Host check pure function", () => {
  test("local hosts are recognized as local", () => {
    expect(isLocalOrTailscaleHost("localhost")).toBe(true);
    expect(isLocalOrTailscaleHost("127.0.0.1")).toBe(true);
    expect(isLocalOrTailscaleHost("::1")).toBe(true);
    expect(isLocalOrTailscaleHost("[::1]")).toBe(true);
    expect(isLocalOrTailscaleHost("arduino.local")).toBe(true);
    expect(isLocalOrTailscaleHost("raspberrypi.LOCAL")).toBe(true);
  });

  test("private IPv4 ranges are recognized", () => {
    // 10.*
    expect(isLocalOrTailscaleHost("10.0.0.1")).toBe(true);
    expect(isLocalOrTailscaleHost("10.255.255.255")).toBe(true);
    // 192.168.*
    expect(isLocalOrTailscaleHost("192.168.1.1")).toBe(true);
    expect(isLocalOrTailscaleHost("192.168.0.254")).toBe(true);
    // 172.16-31.*
    expect(isLocalOrTailscaleHost("172.16.0.1")).toBe(true);
    expect(isLocalOrTailscaleHost("172.25.10.20")).toBe(true);
    expect(isLocalOrTailscaleHost("172.31.255.255")).toBe(true);
    expect(isLocalOrTailscaleHost("172.15.255.255")).toBe(false);
    expect(isLocalOrTailscaleHost("172.32.0.1")).toBe(false);
  });

  test("Tailscale IPv4 range (100.64.0.0/10) and *.ts.net are recognized", () => {
    expect(isLocalOrTailscaleHost("100.64.0.1")).toBe(true);
    expect(isLocalOrTailscaleHost("100.100.50.25")).toBe(true);
    expect(isLocalOrTailscaleHost("100.127.255.255")).toBe(true);
    expect(isLocalOrTailscaleHost("100.63.255.255")).toBe(false);
    expect(isLocalOrTailscaleHost("100.128.0.1")).toBe(false);
    expect(isLocalOrTailscaleHost("my-node.ts.net")).toBe(true);
    expect(isLocalOrTailscaleHost("deep.sub.tailnet.ts.net")).toBe(true);
  });

  test("external public hosts are not local or tailscale", () => {
    expect(isLocalOrTailscaleHost("example.com")).toBe(false);
    expect(isLocalOrTailscaleHost("8.8.8.8")).toBe(false);
    expect(isLocalOrTailscaleHost("1.1.1.1")).toBe(false);
    expect(isLocalOrTailscaleHost("nanobot.ai")).toBe(false);
  });

  test("isInsecureHttpUrl distinguishes plain http to public hosts from https and local hosts", () => {
    expect(isInsecureHttpUrl("http://example.com")).toBe(true);
    expect(isInsecureHttpUrl("http://8.8.8.8:8000/api")).toBe(true);
    expect(isInsecureHttpUrl("http://172.32.0.1")).toBe(true);
    expect(isInsecureHttpUrl("http://100.128.0.1")).toBe(true);

    // https is always secure
    expect(isInsecureHttpUrl("https://example.com")).toBe(false);
    expect(isInsecureHttpUrl("https://8.8.8.8")).toBe(false);

    // local or tailscale plain http is not flagged
    expect(isInsecureHttpUrl("http://localhost:8000")).toBe(false);
    expect(isInsecureHttpUrl("http://127.0.0.1:8765")).toBe(false);
    expect(isInsecureHttpUrl("http://[::1]:8080")).toBe(false);
    expect(isInsecureHttpUrl("http://192.168.1.100:8000")).toBe(false);
    expect(isInsecureHttpUrl("http://10.0.0.2:8000")).toBe(false);
    expect(isInsecureHttpUrl("http://172.20.0.5:8000")).toBe(false);
    expect(isInsecureHttpUrl("http://my-bot.local:8000")).toBe(false);
    expect(isInsecureHttpUrl("http://100.80.0.1:8000")).toBe(false);
    expect(isInsecureHttpUrl("http://my-bot.ts.net:8000")).toBe(false);
  });
});

describe("LK-A: 2. Plain HTTP warning in ConnectScreen", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage("it");
  });

  test("shows inline warning on first connect attempt with plain http to public host, then connects on 'Continua comunque'", async () => {
    await renderWithTheme(<ConnectScreen />);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("URL"), "http://vps.example.com:8000");
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Segreto"), "my-secret");
    });

    // First attempt: should show warning and NOT call testConnection
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Testa e salva" }));
    });

    expect(screen.getByText("Connessione non cifrata: il secret viaggia in chiaro. Usa https o Tailscale.")).toBeTruthy();
    expect(screen.getByText("Continua comunque")).toBeTruthy();
    expect(testConnection).not.toHaveBeenCalled();

    // Confirm: press "Continua comunque" -> connects
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Continua comunque" }));
    });

    expect(testConnection).toHaveBeenCalledWith("http://vps.example.com:8000", "my-secret");
  });

  test("does not show warning for https or tailscale/local hosts", async () => {
    await renderWithTheme(<ConnectScreen />);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("URL"), "https://vps.example.com");
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Testa e salva" }));
    });

    expect(screen.queryByText(/Connessione non cifrata/)).toBeNull();
    expect(testConnection).toHaveBeenCalledWith("https://vps.example.com", "");
  });
});

describe("LK-A: 3. Lock gate for Toast and NativeIntegrations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    toast.show("");
    sessionStore.setState({ state: "open" });
    mockShareIntentState.hasShareIntent = false;
    (Notifications.useLastNotificationResponse as jest.Mock).mockReturnValue(null);
  });

  test("with lock on and locked, a toast is not rendered and dropped, not replayed", async () => {
    lockStore.setState({ enabled: true, locked: true });

    await renderWithTheme(<ToastHost />);

    await act(async () => {
      toast.show("secret-chat-response");
    });

    expect(screen.queryByText("secret-chat-response")).toBeNull();

    // Now unlock
    await act(async () => {
      lockStore.setState({ locked: false });
    });

    // Toasts raised while locked are dropped, not replayed
    expect(screen.queryByText("secret-chat-response")).toBeNull();

    // Once unlocked, new toasts render normally
    await act(async () => {
      toast.show("unlocked-toast");
    });
    expect(screen.getByText("unlocked-toast")).toBeTruthy();
  });

  test("with lock on and locked, share intent does not call handleShare until unlock; handles once", async () => {
    lockStore.setState({ enabled: true, locked: true });
    mockShareIntentState.hasShareIntent = true;
    mockShareIntentState.shareIntent = { type: "text", text: "confidential document" };

    await renderWithTheme(<NativeIntegrations />);

    expect(handleShare).not.toHaveBeenCalled();
    expect(mockShareIntentState.resetShareIntent).not.toHaveBeenCalled();

    // Unlock
    await act(async () => {
      lockStore.setState({ locked: false });
    });

    expect(mockShareIntentState.resetShareIntent).toHaveBeenCalledTimes(1);
    expect(handleShare).toHaveBeenCalledTimes(1);
    expect(handleShare).toHaveBeenCalledWith(expect.objectContaining({ text: "confidential document" }));

    // Re-rendering or other state update does not handle share again
    await act(async () => {
      lockStore.setState({ locked: false });
    });
    expect(handleShare).toHaveBeenCalledTimes(1);
  });

  test("with lock on and locked, notification tap does not navigate until unlock; navigates once", async () => {
    lockStore.setState({ enabled: true, locked: true });
    (Notifications.useLastNotificationResponse as jest.Mock).mockReturnValue({
      notification: { request: { content: { data: { key: "websocket:chat1" } } } },
    });

    await renderWithTheme(<NativeIntegrations />);

    expect(mockPush).not.toHaveBeenCalled();

    // Unlock
    await act(async () => {
      lockStore.setState({ locked: false });
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/chat/websocket%3Achat1");

    // Re-rendering does not navigate again
    await act(async () => {
      lockStore.setState({ locked: false });
    });
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
