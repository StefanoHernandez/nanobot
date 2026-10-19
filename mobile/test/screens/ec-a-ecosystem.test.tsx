import "../../src/platform/install";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { filterEcosystemItems } from "../../src/screens/ecosystem/apps/search";
import { CliAppsTab } from "../../src/screens/ecosystem/apps/CliAppsTab";
import { McpTab } from "../../src/screens/ecosystem/apps/McpTab";
import { McpSheet } from "../../src/screens/ecosystem/apps/McpSheet";
import { PluginsTab } from "../../src/screens/ecosystem/apps/PluginsTab";
import type { CliAppInfo, McpPresetInfo, NanobotFeatureInfo } from "@/lib/types";

jest.mock("../../src/ui/components/Toast", () => ({
  toast: { show: jest.fn() },
}));

const mockMutate = jest.fn();
let mockPrivileged = false;
jest.mock("../../src/ecosystem/privilege", () => ({
  usePrivileged: () => mockPrivileged,
}));

const mockUseCliApps = jest.fn();
const mockUseFeatures = jest.fn();
const mockUseMcp = jest.fn();

jest.mock("../../src/ecosystem/apps", () => ({
  useCliApps: () => mockUseCliApps(),
  useFeatures: () => mockUseFeatures(),
}));

jest.mock("../../src/ecosystem/mcp", () => ({
  useMcp: () => mockUseMcp(),
  useMcpOAuth: () => ({ status: "idle" }),
}));

jest.mock("../../src/settings/store", () => ({
  useSettings: () => ({ mutate: mockMutate, data: {}, refresh: jest.fn() }),
  useRestart: () => ({ pending: false, sections: [], state: "idle", run: jest.fn() }),
}));

async function renderWithTheme(ui: React.ReactElement) {
  return await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

describe("EC-A Search & Ecosystem Features", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage("it");
    mockPrivileged = false;
  });

  describe("filterEcosystemItems helper", () => {
    const items = [
      { name: "git-tool", display_name: "Git Tool", description: "Version control", category: "dev", installed: false },
      { name: "caffe-app", display_name: "Caffè Maker", description: "Brews espresso", category: "utilities", installed: true },
      { name: "db-tool", display_name: "Database Manager", description: "SQL helper", category: "data", installed: false },
    ];

    test("matches description and is accent-insensitive and case-insensitive", () => {
      // Searching 'caffe' should match 'Caffè Maker' (accent insensitive)
      const res1 = filterEcosystemItems(items, "caffe");
      expect(res1.map((i) => i.name)).toEqual(["caffe-app"]);

      // Searching 'sql' should match 'Database Manager' via description
      const res2 = filterEcosystemItems(items, "sql");
      expect(res2.map((i) => i.name)).toEqual(["db-tool"]);

      // Searching 'DEV' should match 'Git Tool' via category
      const res3 = filterEcosystemItems(items, "DEV");
      expect(res3.map((i) => i.name)).toEqual(["git-tool"]);
    });

    test("places installed items first in results", () => {
      const moreItems = [
        { name: "b-uninstalled", display_name: "Alpha Tool", description: "Test", category: "test", installed: false },
        { name: "a-installed", display_name: "Beta Tool", description: "Test", category: "test", installed: true },
        { name: "c-installed", display_name: "Gamma Tool", description: "Test", category: "test", installed: true },
        { name: "d-uninstalled", display_name: "Delta Tool", description: "Test", category: "test", installed: false },
      ];

      const res = filterEcosystemItems(moreItems, "tool");
      expect(res.map((i) => i.name)).toEqual([
        "a-installed",
        "c-installed",
        "b-uninstalled",
        "d-uninstalled",
      ]);
    });
  });

  describe("UI Search & Empty States", () => {
    test("CliAppsTab filters by search and shows empty state for unmatched query", async () => {
      mockUseCliApps.mockReturnValue({
        apps: [
          { name: "curl", display_name: "cURL", description: "Command line HTTP tool", status: "installed", installed: true },
          { name: "jq", display_name: "JQ Processor", description: "JSON filter tool", status: "not_installed", installed: false },
        ] as CliAppInfo[],
        loading: false,
        refresh: jest.fn(),
        install: jest.fn(),
        update: jest.fn(),
        uninstall: jest.fn(),
        test: jest.fn(),
      });

      await renderWithTheme(<CliAppsTab gateAllowed={true} />);

      // Initially both apps visible
      expect(screen.getByText("cURL")).toBeTruthy();
      expect(screen.getByText("JQ Processor")).toBeTruthy();

      // Search matching description "JSON"
      const searchInput = screen.getByPlaceholderText("Cerca...");
      await fireEvent.changeText(searchInput, "json");

      expect(screen.queryByText("cURL")).toBeNull();
      expect(screen.getByText("JQ Processor")).toBeTruthy();

      // Search with non-matching query shows empty state "Nessun risultato per «{q}»"
      await fireEvent.changeText(searchInput, "nonexistentxyz");
      expect(screen.queryByText("cURL")).toBeNull();
      expect(screen.queryByText("JQ Processor")).toBeNull();
      expect(screen.getByText("Nessun risultato per «nonexistentxyz»")).toBeTruthy();
    });

    test("PluginsTab filters accent-insensitively and shows empty state", async () => {
      mockUseFeatures.mockReturnValue({
        features: [
          { name: "feishu", display_name: "Feishu", description: "Integrazione con messaggi caffè", enabled: false },
        ] as unknown as NanobotFeatureInfo[],
        requiresRestart: false,
        loading: false,
        refresh: jest.fn(),
        enable: jest.fn(),
        disable: jest.fn(),
      });

      await renderWithTheme(<PluginsTab gateAllowed={true} />);
      expect(screen.getByText("Feishu")).toBeTruthy();

      const searchInput = screen.getByPlaceholderText("Cerca...");
      await fireEvent.changeText(searchInput, "caffe");
      expect(screen.getByText("Feishu")).toBeTruthy();

      await fireEvent.changeText(searchInput, "nomatch");
      expect(screen.getByText("Nessun risultato per «nomatch»")).toBeTruthy();
    });
  });

  describe("Refusal codes and lock indicators", () => {
    test("PluginsTab shows full power lock explanation when not privileged", async () => {
      mockPrivileged = false;
      mockUseFeatures.mockReturnValue({
        features: [{ name: "feishu", display_name: "Feishu", enabled: false }] as NanobotFeatureInfo[],
        requiresRestart: false,
        loading: false,
        refresh: jest.fn(),
        enable: jest.fn(),
        disable: jest.fn(),
      });

      await renderWithTheme(<PluginsTab gateAllowed={false} />);
      expect(screen.getByText("Serve un dispositivo con pieno controllo")).toBeTruthy();
    });

    test("PluginsTab shows remote install disabled lock explanation when gate is off but privileged", async () => {
      mockPrivileged = true;
      mockUseFeatures.mockReturnValue({
        features: [{ name: "feishu", display_name: "Feishu", enabled: false }] as NanobotFeatureInfo[],
        requiresRestart: false,
        loading: false,
        refresh: jest.fn(),
        enable: jest.fn(),
        disable: jest.fn(),
      });

      await renderWithTheme(<PluginsTab gateAllowed={false} />);
      expect(screen.getByText("Installazione da remoto disattivata: attivala dal browser sul server, in Impostazioni")).toBeTruthy();
    });

    test("PluginsTab shows unsupported_install_env manual command after failed enable", async () => {
      mockPrivileged = true;
      const mockEnable = jest.fn().mockRejectedValue({
        status: 500,
        code: "unsupported_install_env",
        message: "Automatic package install is not supported: Install manually: `pip install 'nanobot-ai[feishu]'`",
      });

      mockUseFeatures.mockReturnValue({
        features: [{ name: "feishu", display_name: "Feishu", enabled: false }] as NanobotFeatureInfo[],
        requiresRestart: false,
        loading: false,
        refresh: jest.fn(),
        enable: mockEnable,
        disable: jest.fn(),
      });

      await renderWithTheme(<PluginsTab gateAllowed={true} />);

      // Switch to enable opens confirm dialog
      const switchEl = screen.getByRole("switch");
      await fireEvent(switchEl, "valueChange", true);

      // Confirm enable
      const confirmBtn = screen.getByText("Conferma");
      await fireEvent.press(confirmBtn);

      expect(mockEnable).toHaveBeenCalledWith("feishu");
      expect(
        await screen.findByText(
          "Installazione automatica non supportata in questo ambiente. Installa manualmente: pip install 'nanobot-ai[feishu]'"
        )
      ).toBeTruthy();
    });
  });

  describe("MCP Presets Error Surface & npx cache broken hint", () => {
    test("McpTab shows failure reason and npx cache broken hint under failed server", async () => {
      mockUseMcp.mockReturnValue({
        presets: [
          {
            name: "context7",
            display_name: "Context7",
            category: "dev",
            description: "Context7 MCP",
            transport: "stdio",
            status: "configured",
            runtime_status: "failed",
            error: "Process exited: ERR_MODULE_NOT_FOUND",
            failure_reason: "Process exited: ERR_MODULE_NOT_FOUND",
            error_hint: "npx_cache_broken",
            enabled: true,
          } as unknown as McpPresetInfo,
        ],
        loading: false,
        refresh: jest.fn(),
        enable: jest.fn(),
        disable: jest.fn(),
        remove: jest.fn(),
        test: jest.fn(),
        reconnect: jest.fn(),
        tools: jest.fn(),
      });

      await renderWithTheme(<McpTab gateAllowed={true} />);

      expect(screen.getByText("Errore: Process exited: ERR_MODULE_NOT_FOUND")).toBeTruthy();
      expect(
        screen.getByText("La cache di npx è corrotta: sul server esegui `npm cache clean --force` e riprova.")
      ).toBeTruthy();
    });

    test("McpSheet shows reason and npx hint after failed test in sheet", async () => {
      const mockTest = jest.fn().mockResolvedValue({
        last_action: {
          ok: false,
          error: "Process exited with npm ERR!",
          failure_reason: "Process exited with npm ERR!",
          error_hint: "npx_cache_broken",
        },
      });

      const preset: McpPresetInfo = {
        name: "test-mcp",
        display_name: "Test MCP",
        category: "dev",
        description: "Test description",
        transport: "stdio",
        status: "configured",
        required_fields: [],
        enabled: true,
      } as unknown as McpPresetInfo;

      await renderWithTheme(
        <McpSheet
          open={true}
          preset={preset}
          gateAllowed={true}
          test={mockTest}
          onClose={jest.fn()}
        />
      );

      const testBtn = screen.getByText("Test");
      await fireEvent.press(testBtn);

      expect(mockTest).toHaveBeenCalledWith("test-mcp");
      expect(await screen.findByText("Errore: Process exited with npm ERR!")).toBeTruthy();
      expect(
        screen.getByText("La cache di npx è corrotta: sul server esegui `npm cache clean --force` e riprova.")
      ).toBeTruthy();
    });
  });
});
