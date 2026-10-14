import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { Sheet, Dialog, toast } from "../../src/ui/components";
import { goBackOr } from "../../src/ui/navigation";
import { settingsStore, refreshSettings, SettingsError } from "../../src/settings/store";
import { sessionStore } from "../../src/state/sessionStore";
import { workspaceStore, setWorkspaceScope } from "../../src/state/workspace";
import { chatsStore } from "../../src/state/chatsStore";
import { clearCatalogCache, loadProviderModels } from "../../src/settings/models";
import { SettingsShell } from "../../src/screens/settings/SettingsShell";
import { NetworkSafetyCard } from "../../src/screens/settings/NetworkSafetyCard";
import { ProvidersPanel } from "../../src/screens/settings/ProvidersPanel";
import { SettingsSection } from "../../src/screens/settings/SettingsSection";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useNavigation: () => ({ addListener: jest.fn(() => () => {}), dispatch: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));

const renderWithTheme = (ui: React.ReactElement) => {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
};

const baseData = (o = {}) => ({
  agent: { model: "m" },
  requires_restart: false,
  runtime_config: { "tools.web.enable": true, "agents.defaults.dream.enabled": false },
  image_generation: {
    enabled: false,
    provider: "openai",
    provider_configured: false,
    model: "gpt-image",
    default_aspect_ratio: "1:1",
    default_image_size: "1K",
    max_images_per_turn: 1,
    save_dir: "",
    providers: [{ name: "openai", label: "OpenAI", configured: false, models: ["gpt-image"] }],
  },
  web_search: {
    provider: "brave",
    api_key_hint: null,
    base_url: "",
    max_results: 5,
    timeout: 30,
    providers: [
      { name: "brave", label: "Brave", credential: "optional_api_key" },
      { name: "olostep", label: "Olostep", credential: "api_key" },
    ],
  },
  web: { enable: true, proxy: null, user_agent: null, search: { max_results: 5, timeout: 30 }, fetch: { use_jina_reader: false } },
  advanced: { webui_allow_local_service_access: false, webui_default_access_mode: "default" },
  providers: [
    {
      name: "openai",
      label: "OpenAI",
      configured: true,
      auth_type: "api_key",
      api_key_hint: "sk-•••",
      api_base: "https://api.openai.com",
      advanced_fields: [],
    },
  ],
  ...o,
});

describe("FIX-A-fix1 tests", () => {
  let mockGet: jest.Mock;
  let mockMutate: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGet = jest.fn(async (url: string) => {
      if (url.includes("/api/settings/nanobot-features")) return { features: [] };
      if (url.includes("/api/settings")) return baseData();
      return {};
    });
    mockMutate = jest.fn().mockResolvedValue({});

    await i18n.changeLanguage("en");
    settingsStore.getState().reset();
    settingsStore.getState().setData(baseData() as any);
    workspaceStore.setState({ scopes: {}, errors: {}, info: null });
    sessionStore.setState({
      profile: { id: "p1", name: "Home", baseUrl: "https://x.ts.net" } as any,
      session: { get: mockGet, mutate: mockMutate, stop: jest.fn() } as any,
    });
  });

  describe("M25: goBackOr helper", () => {
    test("calls back() when canGoBack() is true", () => {
      const mockRouter = {
        canGoBack: jest.fn(() => true),
        back: jest.fn(),
        replace: jest.fn(),
      };
      goBackOr(mockRouter as any);
      expect(mockRouter.back).toHaveBeenCalled();
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    test("calls replace(fallback) when canGoBack() is false", () => {
      const mockRouter = {
        canGoBack: jest.fn(() => false),
        back: jest.fn(),
        replace: jest.fn(),
      };
      goBackOr(mockRouter as any, "/custom");
      expect(mockRouter.back).not.toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalledWith("/custom");
    });

    test("defaults fallback to '/' when not provided", () => {
      const mockRouter = {
        canGoBack: jest.fn(() => false),
        back: jest.fn(),
        replace: jest.fn(),
      };
      goBackOr(mockRouter as any);
      expect(mockRouter.replace).toHaveBeenCalledWith("/");
    });
  });

  describe("M4 and M7: guard strength (cur === session)", () => {
    test("M7: refreshSettings does not set error if session became null", async () => {
      const mockSession = {
        get: jest.fn().mockRejectedValue(new Error("network error")),
      } as any;
      sessionStore.setState({ session: null });
      await refreshSettings(mockSession);
      expect(settingsStore.getState().error).toBeNull();
    });

    test("M4: workspace scope timeout does not set error if session became null", async () => {
      jest.useFakeTimers();
      try {
        const mockClient = {
          setWorkspaceScope: jest.fn(),
          onSessionUpdate: jest.fn(() => () => {}),
          onError: jest.fn(() => () => {}),
        };
        const mockSession = { client: mockClient, stop: jest.fn() } as any;

        chatsStore.setState({ session: mockSession });
        const promise = setWorkspaceScope(mockSession, "websocket:chat1", {
          project_path: "/test",
          access_mode: "restricted",
        } as any);

        // Session becomes null before timeout
        chatsStore.setState({ session: null });

        jest.advanceTimersByTime(8000);
        await expect(promise).rejects.toThrow("workspace_scope_timeout");
        expect(workspaceStore.getState().errors["websocket:chat1"]).toBeUndefined();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("M24: clear catalog cache on sessionStore close", () => {
    test("sessionStore.close clears provider catalog cache", async () => {
      const getter = jest.fn().mockResolvedValue({ provider: "openai", models: [{ id: "gpt-4" }] });
      await loadProviderModels(getter, "openai");
      expect(getter).toHaveBeenCalledTimes(1);

      // Cached now
      await loadProviderModels(getter, "openai");
      expect(getter).toHaveBeenCalledTimes(1);

      // Calling close on sessionStore should clear catalogCache
      sessionStore.getState().close();

      // Next load must fetch again
      await loadProviderModels(getter, "openai");
      expect(getter).toHaveBeenCalledTimes(2);
    });
  });

  describe("I15: toast visible while Sheet or Dialog is open", () => {
    test("toast rendered inside open Sheet", async () => {
      const { findByText } = await renderWithTheme(
        <Sheet open={true} onClose={jest.fn()} title="My Sheet">
          <></>
        </Sheet>
      );
      await act(async () => {
        toast.show("Toast in Sheet");
      });
      expect(await findByText("Toast in Sheet")).toBeTruthy();
    });

    test("toast rendered inside open Dialog", async () => {
      const { findByText } = await renderWithTheme(
        <Dialog
          open={true}
          title="My Dialog"
          confirmLabel="OK"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      await act(async () => {
        toast.show("Toast in Dialog");
      });
      expect(await findByText("Toast in Dialog")).toBeTruthy();
    });
  });

  describe("M19: settings screen renders error with Retry", () => {
    test("renders error banner and Retry button when settings error is set", async () => {
      mockGet.mockRejectedValue(new Error("Failed to load settings from server"));
      settingsStore.setState({ error: "Failed to load settings from server", data: null });
      const { findByText, getByText } = await renderWithTheme(
        <SettingsShell title="Settings" onBack={jest.fn()}>
          <></>
        </SettingsShell>
      );
      expect(await findByText("Failed to load settings from server")).toBeTruthy();
      expect(getByText("Retry")).toBeTruthy();
    });
  });

  describe("M21: local service access confirm with risk text", () => {
    test("toggling local service access opens confirmation Dialog before saving", async () => {
      const { getByLabelText, findByText, getByText } = await renderWithTheme(<NetworkSafetyCard />);
      const toggle = getByLabelText("Local service access");
      await fireEvent(toggle, "valueChange", true);

      // Confirm dialog must appear
      expect(await findByText("Allow local service access?")).toBeTruthy();
      expect(getByText(/services on 127.0.0.1 and localhost/)).toBeTruthy();
      expect(mockMutate).not.toHaveBeenCalled();

      // Confirming saves
      await fireEvent.press(getByText("Allow access"));
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          "settings.network_safety.update",
          expect.objectContaining({ webui_allow_local_service_access: true }),
          undefined
        );
      });
    });
  });

  describe("I14: Add custom provider sentinel does not collide with built-in custom", () => {
    test("choosing 'add custom' does not open the built-in custom provider sheet", async () => {
      settingsStore.getState().setData(
        baseData({
          providers: [
            {
              name: "custom",
              label: "Built-in Custom Provider",
              configured: false,
              is_custom: false,
              auth_type: "api_key",
              api_key_hint: null,
              api_base: "",
              advanced_fields: [],
            },
          ],
        }) as any
      );

      const { getByText, queryByText } = await renderWithTheme(<ProvidersPanel />);
      // Open add sheet
      await fireEvent.press(getByText("Add provider"));
      // Press "Custom provider"
      await fireEvent.press(getByText("Custom provider"));

      // It should open CustomProviderSheet (with label "Custom provider" title and Create button),
      // and NOT open ProviderSheet for "Built-in Custom Provider"
      expect(queryByText("Built-in Custom Provider")).toBeNull();
      expect(getByText("Create")).toBeTruthy();
    });
  });

  describe("I13: keep current key and confirm on clear", () => {
    test("keep-current omits the key from the payload", async () => {
      settingsStore.getState().setData(
        baseData({
          web_search: {
            provider: "brave",
            api_key_hint: "br••••",
            base_url: "",
            max_results: 5,
            timeout: 30,
            providers: [{ name: "brave", label: "Brave", credential: "optional_api_key" }],
          },
        }) as any
      );

      const { getByLabelText, getByText } = await renderWithTheme(<SettingsSection section="capabilities" />);
      // Tap pencil / edit key
      await fireEvent.press(getByLabelText("Edit API key"));
      // Tap "Keep current key"
      await fireEvent.press(getByText("Keep current key"));
      // Save web
      await fireEvent.press(getByText("Save web"));

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled();
      });
      // Payload must NOT contain api_key: ""
      const call = mockMutate.mock.calls.find((c) => c[0] === "settings.web_search.update");
      expect(call).toBeDefined();
      expect(call[1].api_key).toBeUndefined();
    });

    test("saving with cleared key shows confirmation dialog before sending empty api_key", async () => {
      settingsStore.getState().setData(
        baseData({
          web_search: {
            provider: "brave",
            api_key_hint: "br••••",
            base_url: "",
            max_results: 5,
            timeout: 30,
            providers: [{ name: "brave", label: "Brave", credential: "optional_api_key" }],
          },
        }) as any
      );

      const { getByLabelText, getByText, findByText } = await renderWithTheme(<SettingsSection section="capabilities" />);
      await fireEvent.press(getByLabelText("Edit API key"));
      await fireEvent.press(getByText("Save web"));

      // Confirm dialog must appear
      expect(await findByText("Remove saved API key?")).toBeTruthy();
      expect(mockMutate).not.toHaveBeenCalled();

      // Confirm
      await fireEvent.press(getByText("Remove key"));
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          "settings.web_search.update",
          expect.objectContaining({ provider: "brave", api_key: "" }),
          undefined
        );
      });
    });
  });

  describe("M23: unrendered field errors show a toast", () => {
    test("server field error for unrendered field appears as toast", async () => {
      mockMutate.mockImplementation(async (action: string) => {
        if (action === "settings.provider.update") {
          throw new SettingsError(400, "api: unsupported API mode", "api");
        }
        return {};
      });

      const { getByText, findByText } = await renderWithTheme(<ProvidersPanel />);
      await fireEvent.press(getByText("OpenAI"));
      await fireEvent.press(getByText("Save"));

      expect(await findByText("Invalid value")).toBeTruthy();
    });
  });
});
