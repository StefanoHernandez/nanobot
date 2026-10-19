import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SECTIONS, SECTION_GROUPS, SETTINGS_REDIRECTS, resolveSettingsSection, SettingsScreen } from "../../src/screens/settings/SettingsScreen";
import { SettingsSection } from "../../src/screens/settings/SettingsSection";
import { SecuritySection } from "../../src/screens/settings/SecuritySection";
import { AppearanceSection } from "../../src/screens/settings/AppearanceSection";
import { AboutSection } from "../../src/screens/settings/AboutSection";
import { Features } from "../../src/screens/settings/Features";
import { PACKAGE_PLACE, getPackagePlace, isSettingsFeatureVisible } from "../../src/screens/settings/packagePlace";
import { RAW, GROUPS, FieldPage } from "../../src/settings/runtimeFields";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { settingsStore } from "../../src/settings/store";
import { sessionStore } from "../../src/state/sessionStore";
import { i18n } from "../../src/i18n";

const metrics = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useNavigation: () => ({ addListener: jest.fn(() => () => {}), dispatch: jest.fn() }),
}));

jest.mock("../../src/core/profiles", () => ({
  profiles: { getSecret: jest.fn() },
}));

const mockSession = {
  get: jest.fn().mockResolvedValue({}),
  post: jest.fn().mockResolvedValue({}),
  put: jest.fn().mockResolvedValue({}),
  delete: jest.fn().mockResolvedValue({}),
};

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

describe("NV-A comprehensive settings redesign suite", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage("it");
    settingsStore.getState().reset();
    settingsStore.getState().setData({
      agent: { model: "anthropic/claude-3-5-sonnet" },
      model_presets: [],
      model_call_order: [],
      model_call_order_editable: true,
      providers: [],
      models: { current: "anthropic/claude-3-5-sonnet", providers: {} },
      image_generation: { enabled: false, provider: "openai", provider_configured: false, model: "gpt-image", default_aspect_ratio: "1:1", default_image_size: "1K", max_images_per_turn: 1, save_dir: "", providers: [] },
      web_search: { provider: "brave", api_key_hint: null, base_url: "", max_results: 5, timeout: 30, providers: [] },
      web: { enable: true, proxy: null, user_agent: null, search: { max_results: 5, timeout: 30 }, fetch: { use_jina_reader: false } },
      runtime_config: {
        "tools.web.enable": true,
        "tools.exec.enable": true,
        "tools.cli_apps.enable": true,
      },
      advanced: { webui_allow_local_service_access: false, webui_default_access_mode: "default" },
      requires_restart: false,
    } as never);

    sessionStore.setState({
      profile: { id: "p1", name: "Home", baseUrl: "https://test.server" },
      session: mockSession as never,
    } as never);
  });

  describe("1. Section list order, groups, subtitles, and redirects", () => {
    test("SECTIONS contains exactly 12 sections in spec order", () => {
      expect(SECTIONS).toEqual([
        "overview",
        "models",
        "features",
        "prompts",
        "behavior",
        "security",
        "costs",
        "server",
        "backup",
        "advanced",
        "app",
        "about",
      ]);
    });

    test("SECTION_GROUPS groups sections under the required group titles", () => {
      expect(SECTION_GROUPS).toEqual([
        { sections: ["overview"] },
        { groupKey: "bot", sections: ["models", "features", "prompts", "behavior"] },
        { groupKey: "security", sections: ["security"] },
        { groupKey: "costs", sections: ["costs"] },
        { groupKey: "server", sections: ["server", "backup", "advanced"] },
        { groupKey: "thisPhone", sections: ["app", "about"] },
      ]);

      // Check group titles in Italian
      expect(i18n.t("settings.groups.bot")).toBe("BOT");
      expect(i18n.t("settings.groups.security")).toBe("SICUREZZA");
      expect(i18n.t("settings.groups.costs")).toBe("SPESA");
      expect(i18n.t("settings.groups.server")).toBe("SERVER");
      expect(i18n.t("settings.groups.thisPhone")).toBe("QUESTO TELEFONO");
    });

    test("Every section has a defined subtitle in i18n", () => {
      for (const s of SECTIONS) {
        const sub = i18n.t(`settings.sectionSubtitles.${s}`);
        expect(sub).toBeDefined();
        expect(sub).not.toBe(`settings.sectionSubtitles.${s}`);
        expect(sub.length).toBeGreaterThan(0);
      }
    });

    test("Old section IDs redirect to their new counterparts", () => {
      expect(SETTINGS_REDIRECTS.capabilities).toBe("features");
      expect(SETTINGS_REDIRECTS.system).toBe("server");
      expect(SETTINGS_REDIRECTS.machine).toBe("server");
      expect(SETTINGS_REDIRECTS.appearance).toBe("app");

      expect(resolveSettingsSection("capabilities")).toBe("features");
      expect(resolveSettingsSection("system")).toBe("server");
      expect(resolveSettingsSection("machine")).toBe("server");
      expect(resolveSettingsSection("appearance")).toBe("app");
      expect(resolveSettingsSection("security")).toBe("security");
      expect(resolveSettingsSection("behavior")).toBe("behavior");
    });

    test("SettingsScreen renders all section titles and group headers", async () => {
      await renderWithTheme(<SettingsScreen />);
      expect(screen.getByText("BOT")).toBeTruthy();
      expect(screen.getByText("SICUREZZA")).toBeTruthy();
      expect(screen.getByText("SPESA")).toBeTruthy();
      expect(screen.getByText("SERVER")).toBeTruthy();
      expect(screen.getByText("QUESTO TELEFONO")).toBeTruthy();

      // Check key section titles
      expect(screen.getByText(i18n.t("settings.sections.overview"))).toBeTruthy();
      expect(screen.getByText(i18n.t("settings.sections.models"))).toBeTruthy();
      expect(screen.getByText(i18n.t("settings.sections.features"))).toBeTruthy();
      expect(screen.getByText(i18n.t("settings.sections.behavior"))).toBeTruthy();
      expect(screen.getByText(i18n.t("settings.sections.security"))).toBeTruthy();
      expect(screen.getByText(i18n.t("settings.sections.server"))).toBeTruthy();
      expect(screen.getByText(i18n.t("settings.sections.app"))).toBeTruthy();
    });
  });

  describe("2. RAW runtime fields coverage across pages", () => {
    test("Every field in RAW belongs to a group with a valid FieldPage rendered by a section", () => {
      const validPages = new Set<FieldPage>(["behavior", "security", "advanced", "browser", "network", "image", "memory"]);

      for (const [groupName, groupDef] of Object.entries(GROUPS)) {
        expect(validPages.has(groupDef.page)).toBe(true);
      }

      expect(RAW.length).toBeGreaterThan(0);

      // Verify specific brief ownership mappings
      expect(GROUPS.identity.page).toBe("behavior");
      expect(GROUPS.sessions.page).toBe("behavior");
      expect(GROUPS.tools.page).toBe("behavior");
      expect(GROUPS.execution.page).toBe("behavior");
      expect(GROUPS.chat.page).toBe("behavior");

      expect(GROUPS.shell.page).toBe("security");
      expect(GROUPS.safety.page).toBe("security");

      expect(GROUPS.gateway.page).toBe("advanced");
      expect(GROUPS.api.page).toBe("advanced");
      expect(GROUPS.cli.page).toBe("advanced");

      for (const field of RAW) {
        expect(GROUPS[field.group]).toBeDefined();
        const page = GROUPS[field.group].page;
        expect(validPages.has(page)).toBe(true);
      }
    });

    test("Behavior, security, and advanced sections each render their respective runtime fields", async () => {
      // Behavior section renders identity/tools/chat etc.
      await renderWithTheme(<SettingsSection section="behavior" />);
      expect(screen.getByText(i18n.t("system.groups.identity"))).toBeTruthy();
      expect(screen.getByText(i18n.t("system.groups.tools"))).toBeTruthy();

      // Security section renders shell/safety
      await renderWithTheme(<SettingsSection section="security" />);
      expect(screen.getByText(i18n.t("system.groups.shell"))).toBeTruthy();
      expect(screen.getAllByText(i18n.t("system.groups.safety")).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(i18n.t("netsafe.title"))).toBeTruthy();

      // Advanced section renders gateway/api/cli
      mockSession.get.mockImplementation(async (path: string) => {
        if (path === "/api/settings/nanobot-features") {
          return {
            features: [
              { name: "api", display_name: "API Gateway", installed: true, enabled: false, type: "feature" },
            ],
          };
        }
        return {};
      });
      await renderWithTheme(<SettingsSection section="advanced" />);
      expect(screen.getByText(i18n.t("system.groups.gateway"))).toBeTruthy();
      expect(screen.getByText(i18n.t("system.groups.api"))).toBeTruthy();
      expect(screen.getByText(i18n.t("system.groups.cli"))).toBeTruthy();
      expect(await screen.findByText(i18n.t("system.otherComponents"))).toBeTruthy();
    });
  });

  describe("3. Approvals and Devices placement", () => {
    test("SecuritySection renders ApprovalsCard and DevicesCard", async () => {
      await renderWithTheme(<SecuritySection />);
      expect(screen.getAllByText(i18n.t("approvals.security")).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(i18n.t("approvals.enable"))).toBeTruthy();
      expect(screen.getByText(i18n.t("settings.devices"))).toBeTruthy();
    });

    test("AppearanceSection (App) does NOT render ApprovalsCard or DevicesCard", async () => {
      await renderWithTheme(<AppearanceSection />);
      expect(screen.queryByText(i18n.t("approvals.enable"))).toBeNull();
      expect(screen.queryByText(i18n.t("settings.devices"))).toBeNull();
      expect(screen.queryByText(i18n.t("settings.devicesAll"))).toBeNull();
    });

    test("AboutSection does NOT render ApprovalsCard or DevicesCard", async () => {
      await renderWithTheme(<AboutSection />);
      expect(screen.queryByText(i18n.t("approvals.enable"))).toBeNull();
      expect(screen.queryByText(i18n.t("settings.devices"))).toBeNull();
      expect(screen.queryByText(i18n.t("settings.devicesAll"))).toBeNull();
    });
  });

  describe("4. Package placement and filtering (Features)", () => {
    test("PACKAGE_PLACE correctly categorizes known and unknown packages", () => {
      expect(getPackagePlace("azure")).toBe("models");
      expect(getPackagePlace("bedrock")).toBe("models");
      expect(getPackagePlace("olostep")).toBe("features");
      expect(getPackagePlace("documents")).toBe("features");
      expect(getPackagePlace("pdf")).toBe("features");
      expect(getPackagePlace("api")).toBe("advanced");
      expect(getPackagePlace("langfuse")).toBe("advanced");

      // Unknown packages fall back to advanced
      expect(getPackagePlace("custom-community-tool")).toBe("advanced");
      expect(getPackagePlace("unmapped-feature")).toBe("advanced");

      // Dev is hidden (null)
      expect(getPackagePlace("dev")).toBeNull();
    });

    test("isSettingsFeatureVisible hides dev, channels, and hidden packages", () => {
      expect(isSettingsFeatureVisible({ name: "azure", type: "feature" })).toBe(true);
      expect(isSettingsFeatureVisible({ name: "dev" })).toBe(false);
      expect(isSettingsFeatureVisible({ name: "telegram", type: "channel" })).toBe(false);
      expect(isSettingsFeatureVisible({ name: "custom-channel", type: "channel" })).toBe(false);
      expect(isSettingsFeatureVisible({ name: "hidden", settings_visible: false })).toBe(false);
    });

    test("Features component renders only matching packages for place='advanced'", async () => {
      mockSession.get.mockImplementation(async (path: string) => {
        if (path === "/api/settings/nanobot-features") {
          return {
            features: [
              { name: "azure", display_name: "Azure OpenAI", installed: true, enabled: true, type: "feature" },
              { name: "dev", display_name: "Development", installed: true, enabled: false, type: "feature" },
              { name: "api", display_name: "API Gateway", installed: true, enabled: false, type: "feature" },
              { name: "langfuse", display_name: "Langfuse Tracing", installed: false, enabled: false, type: "feature" },
              { name: "custom-plugin", display_name: "Custom Plugin", installed: false, enabled: false, type: "feature" },
            ],
          };
        }
        return {};
      });

      await renderWithTheme(<Features place="advanced" />);

      await waitFor(() => {
        expect(screen.getByText("API Gateway")).toBeTruthy();
        expect(screen.getByText("Langfuse Tracing")).toBeTruthy();
        expect(screen.getByText("Custom Plugin")).toBeTruthy();
      });

      // azure belongs to models, not advanced
      expect(screen.queryByText("Azure OpenAI")).toBeNull();
      // dev is hidden
      expect(screen.queryByText("Development")).toBeNull();
    });

    test("Features component renders specific names when provided", async () => {
      mockSession.get.mockImplementation(async (path: string) => {
        if (path === "/api/settings/nanobot-features") {
          return {
            features: [
              { name: "azure", display_name: "Azure OpenAI", installed: true, enabled: true, type: "feature" },
              { name: "bedrock", display_name: "AWS Bedrock", installed: false, enabled: false, type: "feature" },
              { name: "olostep", display_name: "Olostep Search", installed: false, enabled: false, type: "feature" },
            ],
          };
        }
        return {};
      });

      await renderWithTheme(<Features names={["azure", "bedrock"]} />);

      await waitFor(() => {
        expect(screen.getByText("Azure OpenAI")).toBeTruthy();
        expect(screen.getByText("AWS Bedrock")).toBeTruthy();
      });

      expect(screen.queryByText("Olostep Search")).toBeNull();
    });
  });
});
