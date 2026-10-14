import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { toast } from "../../src/ui/components/Toast";
import { ChatDrawer } from "../../src/screens/chats/ChatDrawer";
import { ChannelsScreen } from "../../src/screens/ecosystem/channels/ChannelsScreen";
import { ChannelSheet } from "../../src/screens/ecosystem/channels/ChannelSheet";
import EcosystemIndex from "../../app/ecosystem/index";
import * as channelsModule from "../../src/ecosystem/channels";
import type { NanobotFeatureInfo } from "@/lib/types";

jest.mock("../../src/ui/components/Toast", () => ({
  toast: { show: jest.fn() },
}));

let focusListeners: Array<() => void> = [];
const mockAddListener = jest.fn((event: string, cb: () => void) => {
  if (event === "focus") focusListeners.push(cb);
  return () => {
    focusListeners = focusListeners.filter((l) => l !== cb);
  };
});

const mockMutate = jest.fn();
const mockRunRestart = jest.fn();

jest.mock("../../src/settings/store", () => ({
  useSettings: () => ({ mutate: mockMutate, data: { requires_restart: false }, refresh: jest.fn() }),
  useRestart: () => ({ pending: false, sections: [], state: "idle", run: mockRunRestart }),
}));

jest.mock("react-native-qrcode-svg", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: function MockQRCode(props: any) {
      return <View testID="qr" {...props} />;
    },
  };
});

const mockChatsState = {
  chats: [],
  loading: false,
  refresh: jest.fn(),
  newChat: jest.fn(),
  newTemporaryChat: jest.fn(),
  rename: jest.fn(),
  remove: jest.fn(),
  search: jest.fn(() => []),
};

jest.mock("../../src/state/chatsStore", () => ({
  useChats: (sel?: (s: unknown) => unknown) => (sel ? sel(mockChatsState) : mockChatsState),
  isWritable: () => true,
}));

jest.mock("../../src/state/sessionStore", () => ({
  useSession: () => ({
    session: null,
    state: "none",
    profile: { id: "p1", name: "User", baseUrl: "https://x", hasSecret: false },
  }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
  useNavigation: () => ({ addListener: mockAddListener, dispatch: jest.fn() }),
  usePathname: () => "/ecosystem/channels",
}));

// Mock channels logic
const actualChannels = jest.requireActual("../../src/ecosystem/channels");
const mockUseChannels = jest.fn();
const mockUseChannelConnect = jest.fn();
const mockUsePairing = jest.fn();
const mockChannelEnable = jest.fn();
const mockChannelDisable = jest.fn();
const mockConfigureChannel = jest.fn();
const mockSetSecretCleared = jest.fn(actualChannels.setSecretCleared);

jest.mock("../../src/ecosystem/channels", () => {
  const actual = jest.requireActual("../../src/ecosystem/channels");
  return {
    ...actual,
    useChannels: () => mockUseChannels(),
    useChannelConnect: (channel: string, instanceId?: string, onFeatures?: any) =>
      mockUseChannelConnect(channel, instanceId, onFeatures),
    usePairing: () => mockUsePairing(),
    channelEnable: (...args: any[]) => mockChannelEnable(...args),
    channelDisable: (...args: any[]) => mockChannelDisable(...args),
    configureChannel: (...args: any[]) => mockConfigureChannel(...args),
    setSecretCleared: (...args: any[]) => mockSetSecretCleared(...args),
  };
});

const sampleChannel: NanobotFeatureInfo = {
  name: "telegram",
  display_name: "Telegram",
  type: "channel",
  enabled: false,
  installed: true,
  ready: true,
  status: "not_enabled",
  install_supported: true,
  requires_restart: false,
  runtime_status: "stopped",
  configured: true,
  configured_fields: ["channels.telegram.token"],
  config_values: { "channels.telegram.port": "8080" },
  setup: {
    fields: [
      { key: "channels.telegram.token", field: "token", kind: "secret", choices: [], required: true },
      { key: "channels.telegram.port", field: "port", kind: "int", choices: [], required: false },
      { key: "channels.telegram.allow", field: "allow", kind: "list", choices: [], required: false },
    ],
  },
};

const renderWithTheme = async (ui: React.ReactElement) => {
  return await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
};

beforeEach(async () => {
  jest.clearAllMocks();
  focusListeners = [];
  await i18n.changeLanguage("en");
  mockUseChannels.mockReturnValue({
    channels: [sampleChannel],
    requiresRestart: false,
    loading: false,
    error: null,
    refresh: jest.fn(),
    apply: jest.fn(),
  });
  mockUseChannelConnect.mockReturnValue({
    state: "idle",
    error: null,
    verificationFailed: false,
    message: undefined,
    qrUrl: undefined,
    linkUrl: undefined,
    start: jest.fn(),
    cancel: jest.fn(),
    submitVerifyCode: jest.fn(),
  });
  mockUsePairing.mockReturnValue({
    requests: [],
    lastAction: undefined,
    error: null,
    refresh: jest.fn(),
    approve: jest.fn(),
    deny: jest.fn(),
  });
});

describe("P4-U1 Ecosystem & Channels UI", () => {
  test("drawer button navigates to /ecosystem", async () => {
    await renderWithTheme(<ChatDrawer onClose={jest.fn()} />);
    const ecoBtn = screen.getByLabelText("Ecosystem");
    expect(ecoBtn).toBeTruthy();
    await fireEvent.press(ecoBtn);
    expect(router.push).toHaveBeenCalledWith("/ecosystem");
  });

  test("ecosystem index shows 4 rows, all items navigate", async () => {
    await renderWithTheme(<EcosystemIndex />);
    expect(screen.getByText("Channels")).toBeTruthy();
    expect(screen.getByText("Apps")).toBeTruthy();
    expect(screen.getByText("Skills")).toBeTruthy();
    expect(screen.getByText("Automations")).toBeTruthy();
    const comingSoons = screen.queryAllByText("Coming soon");
    expect(comingSoons).toHaveLength(0);

    await fireEvent.press(screen.getByText("Channels"));
    expect(router.push).toHaveBeenCalledWith("/ecosystem/channels");

    await fireEvent.press(screen.getByText("Apps"));
    expect(router.push).toHaveBeenCalledWith("/ecosystem/apps");

    await fireEvent.press(screen.getByText("Skills"));
    expect(router.push).toHaveBeenCalledWith("/ecosystem/skills");

    await fireEvent.press(screen.getByText("Automations"));
    expect(router.push).toHaveBeenCalledWith("/ecosystem/automations");
  });

  test("the enable switch calls channelEnable with the name after confirmation", async () => {
    await renderWithTheme(<ChannelsScreen />);
    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThan(0);
    await fireEvent(switches[0], "valueChange", true);
    const confirmBtn = screen.getByText("Confirm");
    await fireEvent.press(confirmBtn);
    expect(mockChannelEnable).toHaveBeenCalledWith(mockMutate, "telegram");
  });

  test("save with an untouched secret: configureChannel is called without touched secret", async () => {
    const onSave = jest.fn();
    await renderWithTheme(
      <ChannelSheet
        open={true}
        channel={sampleChannel}
        onClose={jest.fn()}
        onSaved={onSave}
      />,
    );

    // Change an integer field
    const portInput = screen.getByLabelText("port");
    await fireEvent.changeText(portInput, "9000");

    // Click Save
    const saveBtn = screen.getByText("Save");
    await fireEvent.press(saveBtn);

    expect(mockConfigureChannel).toHaveBeenCalled();
    const calledValues = mockConfigureChannel.mock.calls[0][2];
    // The untouched secret "channels.telegram.token" must NOT be in the values object
    expect(calledValues["channels.telegram.token"]).toBeUndefined();
    expect(calledValues["channels.telegram.port"]).toBe(9000);
  });

  test("clearing a secret opens a confirm, and only after confirm is setSecretCleared(form, key, true) applied", async () => {
    await renderWithTheme(
      <ChannelSheet
        open={true}
        channel={sampleChannel}
        onClose={jest.fn()}
      />,
    );

    // Secret is configured ("Saved" is shown)
    expect(screen.getByText("Saved")).toBeTruthy();

    // Click Clear on the field
    const clearBtn = screen.getByText("Clear");
    await fireEvent.press(clearBtn);

    // Confirm dialog should be open, setSecretCleared not yet called
    expect(mockSetSecretCleared).not.toHaveBeenCalled();
    expect(screen.getByText("Clear secret?")).toBeTruthy();

    // Confirm dialog has the confirm button (second Clear button)
    const clearBtns = screen.getAllByText("Clear");
    expect(clearBtns.length).toBe(2);
    await fireEvent.press(clearBtns[1]);

    expect(mockSetSecretCleared).toHaveBeenCalledWith(expect.anything(), "channels.telegram.token", true);
  });

  test("connect with state: 'waiting', qrUrl: 'x' renders a QR", async () => {
    mockUseChannelConnect.mockReturnValue({
      state: "waiting",
      qrUrl: "https://qr.example.com/scan",
      linkUrl: "https://qr.example.com/scan",
      start: jest.fn(),
      cancel: jest.fn(),
      submitVerifyCode: jest.fn(),
    });

    await renderWithTheme(
      <ChannelSheet
        open={true}
        channel={{ ...sampleChannel, name: "weixin" }}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId("qr")).toBeTruthy();
    expect(screen.getByText("Open link")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  test("connect state: 'expired' shows the expired text and Retry calls start", async () => {
    const mockStart = jest.fn();
    mockUseChannelConnect.mockReturnValue({
      state: "expired",
      qrUrl: undefined,
      linkUrl: undefined,
      start: mockStart,
      cancel: jest.fn(),
      submitVerifyCode: jest.fn(),
    });

    await renderWithTheme(
      <ChannelSheet
        open={true}
        channel={{ ...sampleChannel, name: "weixin" }}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText("QR expired")).toBeTruthy();
    const retryBtn = screen.getByText("Retry");
    await fireEvent.press(retryBtn);
    expect(mockStart).toHaveBeenCalled();
  });

  test("pairing Approve opens a confirm, and confirm calls approve('ABC') exactly once. Deny calls deny", async () => {
    const mockApprove = jest.fn().mockResolvedValue({});
    const mockDeny = jest.fn().mockResolvedValue({});
    mockUsePairing.mockReturnValue({
      requests: [{ code: "ABC", channel: "telegram", sender_id: "user42" }],
      approve: mockApprove,
      deny: mockDeny,
      refresh: jest.fn(),
      error: null,
    });

    await renderWithTheme(<ChannelsScreen />);

    expect(screen.getByText("ABC")).toBeTruthy();
    expect(screen.getByText(/user42/)).toBeTruthy();

    // Press Approve
    const approveBtn = screen.getByText("Approve");
    await fireEvent.press(approveBtn);

    // Confirm dialog is open with warning message
    expect(screen.getByText("Grants this sender access to the agent")).toBeTruthy();
    expect(mockApprove).not.toHaveBeenCalled();

    // Confirm the dialog
    const confirmApproveBtn = screen.getByText("Confirm");
    await fireEvent.press(confirmApproveBtn);

    expect(mockApprove).toHaveBeenCalledTimes(1);
    expect(mockApprove).toHaveBeenCalledWith("ABC");

    // Press Deny
    const denyBtn = screen.getByText("Deny");
    await fireEvent.press(denyBtn);
    expect(mockDeny).toHaveBeenCalledWith("ABC");
  });

  test("I5: ChannelRow toggle enable shows confirm dialog; cancel dismisses without enabling", async () => {
    await renderWithTheme(<ChannelsScreen />);
    const switches = screen.getAllByRole("switch");
    await fireEvent(switches[0], "valueChange", true);
    const cancelBtn = screen.getByText("Cancel");
    await fireEvent.press(cancelBtn);
    expect(mockChannelEnable).not.toHaveBeenCalled();
  });

  test("I5: ChannelRow toggle enable shows policy toast on 403 error", async () => {
    mockChannelEnable.mockRejectedValueOnce({ status: 403 });
    await renderWithTheme(<ChannelsScreen />);
    const switches = screen.getAllByRole("switch");
    await fireEvent(switches[0], "valueChange", true);
    const confirmBtn = screen.getByText("Confirm");
    await fireEvent.press(confirmBtn);
    expect(toast.show).toHaveBeenCalledWith(expect.stringMatching(/PC|host|remote/i));
  });

  test("I5: ChannelRow toggle enable shows timeout toast when timedOut is true", async () => {
    mockChannelEnable.mockResolvedValueOnce({ timedOut: true });
    await renderWithTheme(<ChannelsScreen />);
    const switches = screen.getAllByRole("switch");
    await fireEvent(switches[0], "valueChange", true);
    const confirmBtn = screen.getByText("Confirm");
    await fireEvent.press(confirmBtn);
    expect(toast.show).toHaveBeenCalledWith("Still running, refreshing the list");
  });

  test("I10: ChannelsScreen refreshes channels and pairing on focus and pull-to-refresh", async () => {
    const mockChannelsRefresh = jest.fn();
    const mockPairingRefresh = jest.fn();
    mockUseChannels.mockReturnValue({
      channels: [sampleChannel],
      requiresRestart: false,
      loading: false,
      error: null,
      refresh: mockChannelsRefresh,
      apply: jest.fn(),
    });
    mockUsePairing.mockReturnValue({
      requests: [],
      error: null,
      refresh: mockPairingRefresh,
      approve: jest.fn(),
      deny: jest.fn(),
    });

    await renderWithTheme(<ChannelsScreen />);

    // Trigger focus listener
    focusListeners.forEach((fn) => fn());
    expect(mockChannelsRefresh).toHaveBeenCalled();
    expect(mockPairingRefresh).toHaveBeenCalled();

    mockChannelsRefresh.mockClear();
    mockPairingRefresh.mockClear();

    // Pull to refresh
    const list = screen.getByTestId("channels-scroll");
    const { refreshControl } = list.props;
    await act(async () => {
      refreshControl.props.onRefresh();
    });
    expect(mockChannelsRefresh).toHaveBeenCalled();
    expect(mockPairingRefresh).toHaveBeenCalled();
  });

  test("I10 & M8: PairingSection approve and deny catch errors and show toast", async () => {
    const mockApprove = jest.fn().mockRejectedValueOnce(new Error("500 internal server error db crashed"));
    const mockDeny = jest.fn().mockRejectedValueOnce(new Error("500 internal server error network drop"));
    mockUsePairing.mockReturnValue({
      requests: [{ code: "XYZ", sender_id: "user99", channel: "telegram" }],
      approve: mockApprove,
      deny: mockDeny,
      refresh: jest.fn(),
      error: null,
    });

    await renderWithTheme(<ChannelsScreen />);

    // Press Approve and confirm
    await fireEvent.press(screen.getByText("Approve"));
    const confirmBtn = screen.getByText("Confirm");
    await fireEvent.press(confirmBtn);

    expect(mockApprove).toHaveBeenCalledWith("XYZ");
    expect(toast.show).toHaveBeenCalledWith("Operation failed");
    expect(toast.show).not.toHaveBeenCalledWith("500 internal server error db crashed");

    // Press Deny
    await fireEvent.press(screen.getByText("Deny"));
    expect(mockDeny).toHaveBeenCalledWith("XYZ");
    expect(toast.show).toHaveBeenCalledWith("Operation failed");
    expect(toast.show).not.toHaveBeenCalledWith("500 internal server error network drop");
  });

  test("M8: ChannelRow toggle disable error shows generic toast, not raw server error", async () => {
    mockChannelDisable.mockRejectedValueOnce(new Error("Database connection closed"));
    mockUseChannels.mockReturnValue({
      channels: [{ ...sampleChannel, enabled: true }],
      requiresRestart: false,
      loading: false,
      error: null,
      refresh: jest.fn(),
      apply: jest.fn(),
    });

    await renderWithTheme(<ChannelsScreen />);
    const switches = screen.getAllByRole("switch");
    await fireEvent(switches[0], "valueChange", false);

    expect(mockChannelDisable).toHaveBeenCalledWith(mockMutate, "telegram");
    expect(toast.show).toHaveBeenCalledWith("Operation failed");
    expect(toast.show).not.toHaveBeenCalledWith("Database connection closed");
  });
});
