import React from "react";
import { StyleSheet, Text } from "react-native";
import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import EcosystemIndex from "../../app/ecosystem/index";
import { ChannelsScreen } from "../../src/screens/ecosystem/channels/ChannelsScreen";
import type { NanobotFeatureInfo } from "@/lib/types";

let focusListeners: Array<() => void> = [];
const mockAddListener = jest.fn((event: string, cb: () => void) => {
  if (event === "focus") focusListeners.push(cb);
  return () => {
    focusListeners = focusListeners.filter((l) => l !== cb);
  };
});

const mockMutate = jest.fn();
const mockRunRestart = jest.fn();

let mockSettingsData: any = {
  requires_restart: false,
  runtime_config: { "tools.webui_allow_remote_package_install": true },
};

jest.mock("../../src/settings/store", () => ({
  useSettings: () => ({ mutate: mockMutate, data: mockSettingsData, refresh: jest.fn() }),
  useRestart: () => ({ pending: false, sections: [], state: "idle", run: mockRunRestart }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
  useNavigation: () => ({ addListener: mockAddListener, dispatch: jest.fn() }),
  usePathname: () => "/ecosystem",
}));

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: false })),
}));
jest.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: jest.fn(),
  allowScreenCaptureAsync: jest.fn(),
}));

import { LockGate, lockStore } from "../../src/extras/lock";

const mockUseChannels = jest.fn();
const mockUsePairing = jest.fn();

jest.mock("../../src/ecosystem/channels", () => {
  const actual = jest.requireActual("../../src/ecosystem/channels");
  return {
    ...actual,
    useChannels: () => mockUseChannels(),
    usePairing: () => mockUsePairing(),
    channelEnable: jest.fn(),
    channelDisable: jest.fn(),
    configureChannel: jest.fn(),
  };
});

const sampleChannel: NanobotFeatureInfo = {
  name: "telegram",
  display_name: "Telegram",
  type: "channel",
  enabled: true,
  installed: true,
  ready: true,
  status: "enabled",
  install_supported: true,
  requires_restart: false,
  runtime_status: "running",
  configured: true,
  configured_fields: ["channels.telegram.token"],
  config_values: { "channels.telegram.port": "8080" },
};

function getAllTextElements(res: any) {
  if (typeof res.UNSAFE_getAllByType === "function") {
    return res.UNSAFE_getAllByType(Text);
  }
  const toJSON = res.toJSON();
  const list: any[] = [];
  function walk(node: any) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.type === "Text") {
      list.push(node);
    }
    if (node.children) {
      node.children.forEach((c: any) => {
        if (typeof c === "object") walk(c);
      });
    }
  }
  walk(toJSON);
  return list;
}

describe("R-E1: Compagno redesign of ecosystem and channels", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseChannels.mockReturnValue({
      channels: [sampleChannel],
      requiresRestart: false,
      loading: false,
      refresh: jest.fn(),
      apply: jest.fn(),
    });
    mockUsePairing.mockReturnValue({
      requests: [{ code: "123456", sender_id: "user1", channel: "telegram" }],
      refresh: jest.fn(),
      approve: jest.fn(),
      deny: jest.fn(),
    });
  });

  test("ecosystem home: no Text has fontWeight, every Text has fontFamily", async () => {
    const res = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <EcosystemIndex />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    const texts = getAllTextElements(res);
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      const flat = StyleSheet.flatten(t.props.style) || {};
      if (flat.fontFamily === "material-community") continue;
      expect(flat.fontWeight).toBeUndefined();
      expect(flat.fontFamily).toBeDefined();
    }
  });

  test("channels screen: no Text has fontWeight, every Text has fontFamily", async () => {
    const res = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <ChannelsScreen />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    const texts = getAllTextElements(res);
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      const flat = StyleSheet.flatten(t.props.style) || {};
      if (flat.fontFamily === "material-community") continue;
      expect(flat.fontWeight).toBeUndefined();
      expect(flat.fontFamily).toBeDefined();
    }
  });

  test("lock gate: no Text has fontWeight, every Text has fontFamily", async () => {
    lockStore.setState({ enabled: true, locked: true });
    const res = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <LockGate>
            <Text style={{ fontFamily: "Inter-Regular" }}>Unlocked Content</Text>
          </LockGate>
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    const texts = getAllTextElements(res);
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      const flat = StyleSheet.flatten(t.props.style) || {};
      if (flat.fontFamily === "material-community") continue;
      expect(flat.fontWeight).toBeUndefined();
      expect(flat.fontFamily).toBeDefined();
    }
  });
});
