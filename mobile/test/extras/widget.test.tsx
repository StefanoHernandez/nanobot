import "../../src/platform/install";
import React from "react";
import { act, render } from "@testing-library/react-native";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { kv } from "../../src/platform/storage";
import { sessionStore } from "../../src/state/sessionStore";
import { chatsStore } from "../../src/state/chatsStore";
import { profiles } from "../../src/core/profiles";
import { router } from "expo-router";
import { startWidgetStatusSync } from "../../src/extras/widget";
import NewChatScreen from "../../app/new-chat";
const { modifyAndroidManifest } = require("../../plugins/withNanobotWidget");

jest.mock("expo-router", () => ({
  router: {
    replace: jest.fn(),
    navigate: jest.fn(),
  },
}));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of kv.keys()) {
    kv.del(k);
  }
  sessionStore.setState({ session: null, state: "none", profile: null });
});

afterEach(() => {
  sessionStore.getState().close();
});

describe("P5-W1: Android home widget and quick-settings tile", () => {
  test("1. Status sync (no secrets leaked): startWidgetStatusSync writes profileName and state, never baseUrl or secrets", async () => {
    const unsub = startWidgetStatusSync();

    // Trigger session update with full profile details
    await act(async () => {
      sessionStore.setState({
        profile: {
          id: "p1",
          name: "Home",
          baseUrl: "https://secret-host.ts.net:8765",
          hasSecret: true,
        },
        state: "open",
      });
    });

    const raw = kv.get("widget.status");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.profileName).toBe("Home");
    expect(parsed.state).toBe("open");
    expect(typeof parsed.updatedAt).toBe("number");

    // Strictly ensure no secrets, token, or baseUrl leaked
    expect(parsed.baseUrl).toBeUndefined();
    expect(parsed.secret).toBeUndefined();
    expect(parsed.hasSecret).toBeUndefined();
    expect(raw).not.toContain("secret-host");
    expect(raw).not.toContain("https://");

    unsub();
  });

  test("2. /new-chat route with open session: calls chatsStore.newChat() once and redirects to chat", async () => {
    kv.set("profiles.active", "p1");
    const mockNewChat = jest.fn(async () => "websocket:chat-123");
    jest.spyOn(chatsStore.getState(), "newChat").mockImplementation(mockNewChat);

    sessionStore.setState({
      profile: { id: "p1", name: "Home", baseUrl: "https://example.com", hasSecret: true },
      state: "open",
    });

    await render(
      <ThemeProvider>
        <NewChatScreen />
      </ThemeProvider>,
    );

    await act(async () => {});

    expect(mockNewChat).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/chat/websocket%3Achat-123");
  });

  test("3. /new-chat route with no profile: redirects to /connect without calling newChat()", async () => {
    // No active profile in kv
    const mockNewChat = jest.fn(async () => "websocket:chat-123");
    jest.spyOn(chatsStore.getState(), "newChat").mockImplementation(mockNewChat);

    await render(
      <ThemeProvider>
        <NewChatScreen />
      </ThemeProvider>,
    );

    await act(async () => {});

    expect(mockNewChat).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/connect");
  });

  test("4. Config plugin unit test: manifest modifier adds .NanobotWidgetProvider and is idempotent", () => {
    const mockManifest: any = {
      manifest: {
        application: [
          {
            receiver: [],
            service: [],
          },
        ],
      },
    };

    // First run
    modifyAndroidManifest(mockManifest);
    const app = mockManifest.manifest.application[0];
    const providers = app.receiver.filter(
      (r: { $: { "android:name": string } }) => r.$["android:name"] === ".NanobotWidgetProvider",
    );
    expect(providers).toHaveLength(1);
    expect(providers[0].$["android:exported"]).toBe("true");

    // Second run should be idempotent
    modifyAndroidManifest(mockManifest);
    const providersAfter = app.receiver.filter(
      (r: { $: { "android:name": string } }) => r.$["android:name"] === ".NanobotWidgetProvider",
    );
    expect(providersAfter).toHaveLength(1);

    // Also check quick tile service if added
    const tiles = app.service.filter(
      (s: { $: { "android:name": string } }) => s.$["android:name"] === ".NanobotTileService",
    );
    expect(tiles).toHaveLength(1);
  });
});
