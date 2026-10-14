import React from "react";
import { StyleSheet, Text } from "react-native";
import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SettingsScreen } from "../../src/screens/settings/SettingsScreen";
import { SettingsSection } from "../../src/screens/settings/SettingsSection";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { settingsStore } from "../../src/settings/store";
import { sessionStore } from "../../src/state/sessionStore";

const metrics = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ addListener: jest.fn(() => () => {}), dispatch: jest.fn() }),
}));

jest.mock("../../src/core/profiles", () => ({
  profiles: { getSecret: jest.fn() },
}));

describe("R-S1 Compagno redesign of settings screens", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    settingsStore.getState().reset();
    settingsStore.getState().setData({
      agent: { model: "anthropic/claude-3-5-sonnet-20241022" },
      model_presets: [
        { name: "claude", active: true, is_default: false, model: "anthropic/claude-3-5-sonnet-20241022", provider: "anthropic" },
      ],
      model_call_order: ["claude"],
      model_call_order_editable: true,
      providers: [
        { name: "anthropic", label: "Anthropic", configured: true, is_custom: false },
      ],
      models: {
        current: "anthropic/claude-3-5-sonnet-20241022",
        providers: {
          anthropic: { has_key: true, models: ["claude-3-5-sonnet-20241022"] },
        },
      },
      image_generation: {
        enabled: false, provider: "openai", provider_configured: false, model: "gpt-image", default_aspect_ratio: "1:1", default_image_size: "1K",
        max_images_per_turn: 1, save_dir: "", providers: [{ name: "openai", label: "OpenAI", configured: false, models: ["gpt-image"] }],
      },
      web_search: {
        provider: "brave", api_key_hint: null, base_url: "", max_results: 5, timeout: 30, providers: [
          { name: "brave", label: "Brave", credential: "api_key" }, { name: "olostep", label: "Olostep", credential: "api_key" }
        ],
      },
      web: { enable: true, proxy: null, user_agent: null, search: { max_results: 5, timeout: 30 }, fetch: { use_jina_reader: false } },
      runtime_config: { "tools.web.enable": true, "agents.defaults.dream.enabled": false },
      advanced: { webui_allow_local_service_access: false, webui_default_access_mode: "default" },
      requires_restart: false,
    } as never);
    sessionStore.setState({
      profile: { id: "p1", name: "Home", baseUrl: "https://x.ts.net" },
      session: { get: jest.fn().mockResolvedValue({}) },
    } as never);
  });

  test("settings root: no Text has fontWeight, every Text has fontFamily", async () => {
    const res = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    );
    const allTexts = res.container.queryAll((node) => node.type === "Text");
    const texts = allTexts.filter((t) => (StyleSheet.flatten(t.props.style) || {}).fontFamily !== "material-community");
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      const flat = StyleSheet.flatten(t.props.style) || {};
      expect(flat.fontWeight).toBeUndefined();
      expect(flat.fontFamily).toBeDefined();
    }
  });

  test("settings models section: no Text has fontWeight, every Text has fontFamily", async () => {
    const res = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>
          <SettingsSection section="models" />
        </ThemeProvider>
      </SafeAreaProvider>
    );
    const allTexts = res.container.queryAll((node) => node.type === "Text");
    const texts = allTexts.filter((t) => (StyleSheet.flatten(t.props.style) || {}).fontFamily !== "material-community");
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      const flat = StyleSheet.flatten(t.props.style) || {};
      expect(flat.fontWeight).toBeUndefined();
      expect(flat.fontFamily).toBeDefined();
    }
  });

  test.each(["overview", "appearance", "about", "system", "advanced", "capabilities"])("settings %s section: no Text has fontWeight, every Text has fontFamily", async (section) => {
    const res = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>
          <SettingsSection section={section} />
        </ThemeProvider>
      </SafeAreaProvider>
    );
    const allTexts = res.container.queryAll((node) => node.type === "Text");
    const texts = allTexts.filter((t) => (StyleSheet.flatten(t.props.style) || {}).fontFamily !== "material-community");
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      const flat = StyleSheet.flatten(t.props.style) || {};
      expect(flat.fontWeight).toBeUndefined();
      expect(flat.fontFamily).toBeDefined();
    }
  });
});
