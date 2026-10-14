import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Linking } from "react-native";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { toast } from "../../src/ui/components/Toast";
import { AppsScreen } from "../../src/screens/ecosystem/apps/AppsScreen";
import type { CliAppInfo, McpPresetInfo, NanobotFeatureInfo } from "@/lib/types";

jest.mock("../../src/ui/components/Toast", () => ({
  toast: { show: jest.fn() },
}));

const mockMutate = jest.fn();
let mockSettingsData: any = {
  runtime_config: {
    "tools.webui_allow_remote_package_install": false,
  },
};

const mockRefreshSettings = jest.fn();

let appFocusListeners: Array<() => void> = [];
const mockAddListener = jest.fn((event: string, cb: () => void) => {
  if (event === "focus") appFocusListeners.push(cb);
  return () => {
    appFocusListeners = appFocusListeners.filter((l) => l !== cb);
  };
});

jest.mock("../../src/settings/store", () => ({
  useSettings: () => ({ mutate: mockMutate, data: mockSettingsData, refresh: mockRefreshSettings }),
  useRestart: () => ({ pending: false, sections: [], state: "idle", run: jest.fn() }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ addListener: mockAddListener }),
}));

const mockInstall = jest.fn();
const mockUpdate = jest.fn();
const mockUninstall = jest.fn();
const mockTestApp = jest.fn();
const mockCliAppsRefresh = jest.fn();

const mockUseCliApps = jest.fn();
const mockUseFeatures = jest.fn();
const mockUseMcp = jest.fn();
const mockUseMcpOAuth = jest.fn();

jest.mock("../../src/ecosystem/apps", () => ({
  useCliApps: () => mockUseCliApps(),
  useFeatures: () => mockUseFeatures(),
}));

jest.mock("../../src/ecosystem/mcp", () => ({
  useMcp: () => mockUseMcp(),
  useMcpOAuth: (name: string) => mockUseMcpOAuth(name),
}));

const sampleCliApp: CliAppInfo = {
  name: "ffmpeg",
  display_name: "FFmpeg",
  category: "media",
  description: "Media processing tool",
  requires: "system",
  source: "apt",
  entry_point: "ffmpeg",
  install_supported: true,
  installed: false,
  available: true,
  status: "not_installed",
  skill_installed: false,
  manifest: {
    schema: "agent-app.v1",
    id: "ffmpeg",
    display_name: "FFmpeg",
    version: "6.0",
    description: "Media processing tool",
    category: "media",
    source: "apt",
    capabilities: [],
    install: { apt: "ffmpeg" } as any,
    remove: { apt: "ffmpeg" } as any,
    trust: { registry: "system", level: "trusted", review_status: "verified" },
  },
};

const samplePreset: McpPresetInfo = {
  name: "github",
  display_name: "GitHub",
  category: "dev",
  description: "GitHub API MCP server",
  docs_url: "https://github.com",
  transport: "oauth",
  auth: "oauth",
  requires: "token",
  note: "",
  install_supported: true,
  installed: true,
  configured: true,
  enabled: true,
  available: true,
  status: "configured",
  required_fields: [
    {
      name: "token",
      label: "Personal Access Token",
      secret: true,
      required: true,
      configured: true,
    },
  ],
  connection_summary: "Connected",
  tool_count: 5,
  tool_names: ["create_issue", "list_repos"],
  enabled_tools: ["create_issue"],
};

const sampleFeature: NanobotFeatureInfo = {
  name: "code_interpreter",
  display_name: "Code Interpreter",
  type: "tool",
  enabled: false,
  installed: true,
  ready: true,
  status: "available",
  install_supported: true,
  requires_restart: false,
  runtime_status: "stopped",
  configured: true,
};

const renderWithTheme = async (ui: React.ReactElement) => {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        {ui}
      </ThemeProvider>
    </SafeAreaProvider>,
  );
};

describe("P4-U2 Apps UI (CLI apps, MCP, plugins)", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage("en");
    mockSettingsData = {
      runtime_config: {
        "tools.webui_allow_remote_package_install": false,
      },
    };
    mockUseCliApps.mockReturnValue({
      apps: [sampleCliApp],
      loading: false,
      error: null,
      refresh: mockCliAppsRefresh,
      install: mockInstall,
      update: mockUpdate,
      uninstall: mockUninstall,
      test: mockTestApp,
    });
    mockUseFeatures.mockReturnValue({
      features: [sampleFeature],
      requiresRestart: false,
      loading: false,
      error: null,
      refresh: jest.fn(),
      enable: jest.fn(),
      disable: jest.fn(),
    });
    mockUseMcp.mockReturnValue({
      presets: [samplePreset],
      loading: false,
      error: null,
      refresh: jest.fn(),
      enable: jest.fn(),
      disable: jest.fn(),
      remove: jest.fn(),
      test: jest.fn(),
      reconnect: jest.fn(),
      tools: jest.fn(),
    });
    mockUseMcpOAuth.mockReturnValue({
      state: "idle",
      error: null,
      authUrl: undefined,
      completionInput: undefined,
      start: jest.fn(),
      submit: jest.fn(),
      cancel: jest.fn(),
    });
  });

  test("Gate off: the banner is visible and the Install button is disabled", async () => {
    mockSettingsData.runtime_config["tools.webui_allow_remote_package_install"] = false;
    await renderWithTheme(<AppsScreen />);

    // Gate banner visible
    expect(screen.getByText(/Enable remote installs on your computer/i)).toBeTruthy();

    // Install button is disabled
    const installBtn = screen.getByText("Install");
    expect(installBtn).toBeTruthy();
    // Pressing disabled button should not open dialog
    await fireEvent.press(installBtn);
    expect(screen.queryByText(/Install FFmpeg on host computer/i)).toBeNull();
  });

  test("Install opens a confirm, and confirm calls install(name) once", async () => {
    mockSettingsData.runtime_config["tools.webui_allow_remote_package_install"] = true;
    mockInstall.mockResolvedValueOnce({ timedOut: false, result: {} });

    await renderWithTheme(<AppsScreen />);

    // Gate banner not visible
    expect(screen.queryByText(/Enable remote installs on your computer/i)).toBeNull();

    const installBtn = screen.getByText("Install");
    await fireEvent.press(installBtn);

    // Confirm dialog is shown
    expect(screen.getByText(/Install FFmpeg on host computer/i)).toBeTruthy();

    // Confirm action
    const confirmBtn = screen.getByText("Confirm");
    await fireEvent.press(confirmBtn);

    expect(mockInstall).toHaveBeenCalledTimes(1);
    expect(mockInstall).toHaveBeenCalledWith("ffmpeg");
  });

  test("An install rejecting with {status:403} shows the policy toast", async () => {
    mockSettingsData.runtime_config["tools.webui_allow_remote_package_install"] = true;
    mockInstall.mockRejectedValueOnce({ status: 403, message: "Policy error" });

    await renderWithTheme(<AppsScreen />);

    const installBtn = screen.getByText("Install");
    await fireEvent.press(installBtn);

    const confirmBtn = screen.getByText("Confirm");
    await fireEvent.press(confirmBtn);

    expect(mockInstall).toHaveBeenCalledWith("ffmpeg");
    expect(toast.show).toHaveBeenCalledWith(expect.stringMatching(/Enable remote installs on your computer/i));
  });

  test("MCP Remove opens a confirm, and confirm calls remove once", async () => {
    const mockRemove = jest.fn().mockResolvedValueOnce({});
    mockUseMcp.mockReturnValue({
      presets: [samplePreset],
      loading: false,
      error: null,
      refresh: jest.fn(),
      enable: jest.fn(),
      disable: jest.fn(),
      remove: mockRemove,
      test: jest.fn(),
      reconnect: jest.fn(),
      tools: jest.fn(),
    });

    await renderWithTheme(<AppsScreen />);

    // Switch to MCP tab
    await fireEvent.press(screen.getByText("MCP"));

    const removeBtn = screen.getByText("Remove");
    await fireEvent.press(removeBtn);

    // Confirm dialog is shown
    expect(screen.getByText(/Remove MCP preset GitHub/i)).toBeTruthy();

    // Confirm removal
    const confirmBtn = screen.getByText("Confirm");
    await fireEvent.press(confirmBtn);

    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledWith("github");
  });

  test("OAuth with completionInput requiring a callback: paste plus Submit calls the complete function with the pasted text once", async () => {
    const mockSubmit = jest.fn().mockResolvedValueOnce({});
    mockUseMcpOAuth.mockReturnValue({
      state: "awaiting_user",
      error: null,
      authUrl: "https://github.com/login/oauth/authorize",
      completionInput: "callback_url",
      start: jest.fn(),
      submit: mockSubmit,
      cancel: jest.fn(),
    });

    await renderWithTheme(<AppsScreen />);

    // Switch to MCP tab
    await fireEvent.press(screen.getByText("MCP"));

    // Tap on row or OAuth button to open OAuth sheet
    const oauthTrigger = screen.getByText(/OAuth|Authorize/i);
    await fireEvent.press(oauthTrigger);

    // Paste callback url into input
    const pasteInput = screen.getByLabelText(/Callback URL/i);
    await fireEvent.changeText(pasteInput, "https://127.0.0.1:8000/oauth?code=xyz");

    // Click submit
    const submitBtn = screen.getByText("Submit");
    await fireEvent.press(submitBtn);

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSubmit).toHaveBeenCalledWith("https://127.0.0.1:8000/oauth?code=xyz");
  });

  test("There is no 'custom' or 'import' button anywhere, and the note text is present", async () => {
    await renderWithTheme(<AppsScreen />);

    // Switch to MCP tab
    await fireEvent.press(screen.getByText("MCP"));

    // Check no custom or import button
    expect(screen.queryByRole("button", { name: /custom/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /import/i })).toBeNull();

    // Note text is present
    expect(screen.getByText(/Add custom servers from the WebUI on your computer/i)).toBeTruthy();
  });

  test("The Plugin switch on calls enable after confirm", async () => {
    const mockEnable = jest.fn().mockResolvedValueOnce({});
    mockSettingsData.runtime_config["tools.webui_allow_remote_package_install"] = true;
    mockUseFeatures.mockReturnValue({
      features: [sampleFeature],
      requiresRestart: false,
      loading: false,
      error: null,
      refresh: jest.fn(),
      enable: mockEnable,
      disable: jest.fn(),
    });

    await renderWithTheme(<AppsScreen />);

    // Switch to Plugin tab
    await fireEvent.press(screen.getByText(/Plugin/i));

    const pluginSwitch = screen.getByRole("switch");
    await fireEvent(pluginSwitch, "valueChange", true);

    // Confirm dialog is shown
    expect(screen.getByText(/Enable plugin Code Interpreter/i)).toBeTruthy();

    const confirmBtn = screen.getByText("Confirm");
    await fireEvent.press(confirmBtn);

    expect(mockEnable).toHaveBeenCalledTimes(1);
    expect(mockEnable).toHaveBeenCalledWith("code_interpreter");
  });

  test("OAuth start: starts in idle with no authUrl, button calls start once, and Authorize button appears after update", async () => {
    const mockStart = jest.fn().mockResolvedValueOnce({});
    mockUseMcpOAuth.mockReturnValue({
      state: "idle",
      error: null,
      authUrl: undefined,
      completionInput: undefined,
      start: mockStart,
      submit: jest.fn(),
      cancel: jest.fn(),
    });

    const { rerender } = await renderWithTheme(<AppsScreen />);
    await fireEvent.press(screen.getByText("MCP"));

    // Open OAuth sheet
    const oauthBtn = screen.getByText(/OAuth|Authorize/i);
    await fireEvent.press(oauthBtn);

    // "Start authorization" button is present
    const startBtn = screen.getByText(/Start authorization/i);
    expect(startBtn).toBeTruthy();

    await fireEvent.press(startBtn);
    expect(mockStart).toHaveBeenCalledTimes(1);

    // After mock updates with authUrl
    mockUseMcpOAuth.mockReturnValue({
      state: "awaiting_user",
      error: null,
      authUrl: "https://github.com/login/oauth/authorize",
      completionInput: "callback_url",
      start: mockStart,
      submit: jest.fn(),
      cancel: jest.fn(),
    });

    await rerender(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <AppsScreen />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByText("Authorize")).toBeTruthy();
  });

  test("device_code shows no paste field", async () => {
    mockUseMcpOAuth.mockReturnValue({
      state: "awaiting_user",
      error: null,
      authUrl: "https://github.com/login/oauth/authorize",
      completionInput: "device_code",
      start: jest.fn(),
      submit: jest.fn(),
      cancel: jest.fn(),
    });

    await renderWithTheme(<AppsScreen />);
    await fireEvent.press(screen.getByText("MCP"));

    const oauthBtn = screen.getByText(/OAuth|Authorize/i);
    await fireEvent.press(oauthBtn);

    expect(screen.queryByLabelText(/Callback URL/i)).toBeNull();
    expect(screen.queryByText("Submit")).toBeNull();
  });

  test("A double tap on Submit calls complete once", async () => {
    const mockSubmit = jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));
    mockUseMcpOAuth.mockReturnValue({
      state: "awaiting_user",
      error: null,
      authUrl: "https://github.com/login/oauth/authorize",
      completionInput: "callback_url",
      start: jest.fn(),
      submit: mockSubmit,
      cancel: jest.fn(),
    });

    await renderWithTheme(<AppsScreen />);
    await fireEvent.press(screen.getByText("MCP"));

    const oauthBtn = screen.getByText(/OAuth|Authorize/i);
    await fireEvent.press(oauthBtn);

    const pasteInput = screen.getByLabelText(/Callback URL/i);
    await fireEvent.changeText(pasteInput, "https://127.0.0.1:8000/oauth?code=xyz");

    const submitBtn = screen.getByText("Submit");
    await fireEvent.press(submitBtn);
    await fireEvent.press(submitBtn);

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSubmit).toHaveBeenCalledWith("https://127.0.0.1:8000/oauth?code=xyz");
  });

  test("With the gate off, the MCP enable switch is disabled", async () => {
    mockSettingsData.runtime_config["tools.webui_allow_remote_package_install"] = false;
    mockUseMcp.mockReturnValue({
      presets: [{ ...samplePreset, enabled: false }],
      loading: false,
      error: null,
      refresh: jest.fn(),
      enable: jest.fn(),
      disable: jest.fn(),
      remove: jest.fn(),
      test: jest.fn(),
      reconnect: jest.fn(),
      tools: jest.fn(),
    });

    await renderWithTheme(<AppsScreen />);
    await fireEvent.press(screen.getByText("MCP"));

    const switchEl = screen.getByRole("switch");
    expect(switchEl.props.accessibilityState?.disabled ?? switchEl.props.disabled).toBe(true);
  });

  test("With the gate on, enable opens a confirm, and confirm calls enable once", async () => {
    const mockEnable = jest.fn().mockResolvedValueOnce({});
    mockSettingsData.runtime_config["tools.webui_allow_remote_package_install"] = true;
    mockUseMcp.mockReturnValue({
      presets: [{ ...samplePreset, enabled: false }],
      loading: false,
      error: null,
      refresh: jest.fn(),
      enable: mockEnable,
      disable: jest.fn(),
      remove: jest.fn(),
      test: jest.fn(),
      reconnect: jest.fn(),
      tools: jest.fn(),
    });

    await renderWithTheme(<AppsScreen />);
    await fireEvent.press(screen.getByText("MCP"));

    const switchOnEl = screen.getByRole("switch");
    await fireEvent(switchOnEl, "valueChange", true);

    // Confirm dialog is shown
    expect(screen.getByText(/Enable MCP server GitHub/i)).toBeTruthy();

    const confirmBtn = screen.getByText("Confirm");
    await fireEvent.press(confirmBtn);

    expect(mockEnable).toHaveBeenCalledTimes(1);
    expect(mockEnable).toHaveBeenCalledWith("github");
  });

  test("A failing handleSave shows a toast", async () => {
    const mockEnable = jest.fn().mockRejectedValueOnce(new Error("Network error"));
    mockSettingsData.runtime_config["tools.webui_allow_remote_package_install"] = true;
    mockUseMcp.mockReturnValue({
      presets: [{ ...samplePreset, enabled: true }],
      loading: false,
      error: null,
      refresh: jest.fn(),
      enable: mockEnable,
      disable: jest.fn(),
      remove: jest.fn(),
      test: jest.fn(),
      reconnect: jest.fn(),
      tools: jest.fn(),
    });

    await renderWithTheme(<AppsScreen />);
    await fireEvent.press(screen.getByText("MCP"));

    // Tap preset card to open sheet
    await fireEvent.press(screen.getByText("GitHub"));

    // Save button
    const saveBtn = screen.getByText("Save");
    await fireEvent.press(saveBtn);

    expect(mockEnable).toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith("Operation failed");
    expect(toast.show).not.toHaveBeenCalledWith("Network error");
  });

  test("I9: AppsScreen refreshes settings on focus", async () => {
    mockRefreshSettings.mockClear();
    await renderWithTheme(<AppsScreen />);
    appFocusListeners.forEach((fn) => fn());
    expect(mockRefreshSettings).toHaveBeenCalled();
  });

  test("I11: PluginsTab tracks in-flight state and ignores second toggle during enable", async () => {
    let resolveEnable: (val: any) => void;
    const pendingEnablePromise = new Promise((resolve) => {
      resolveEnable = resolve;
    });
    const mockEnable = jest.fn(() => pendingEnablePromise);

    mockUseFeatures.mockReturnValue({
      features: [sampleFeature],
      requiresRestart: false,
      loading: false,
      refresh: jest.fn(),
      enable: mockEnable,
      disable: jest.fn(),
    });
    mockSettingsData.runtime_config["tools.webui_allow_remote_package_install"] = true;

    await renderWithTheme(<AppsScreen />);
    await fireEvent.press(screen.getByText("Plugin"));

    const switchEl = screen.getByRole("switch");
    await fireEvent(switchEl, "valueChange", true);

    // Confirm dialog
    const confirmBtn = screen.getByText("Confirm");
    await fireEvent.press(confirmBtn);

    expect(mockEnable).toHaveBeenCalledTimes(1);
    expect(mockEnable).toHaveBeenCalledWith("code_interpreter");

    // While enable is in-flight, switch is disabled and second toggle is ignored
    expect(switchEl.props.accessibilityState?.disabled ?? switchEl.props.disabled).toBe(true);
    await fireEvent(switchEl, "valueChange", true);
    expect(mockEnable).toHaveBeenCalledTimes(1);

    // Resolve the enable
    await act(async () => {
      resolveEnable!({ timedOut: false });
    });
  });

  test("M15: CliAppsTab tracks in-flight state per app without blocking other apps", async () => {
    const mockInstall = jest.fn(() => new Promise(() => {})); // pending
    const app1: CliAppInfo = { ...sampleCliApp, name: "app1", display_name: "App 1", status: "not_installed" };
    const app2: CliAppInfo = { ...sampleCliApp, name: "app2", display_name: "App 2", status: "installed" };

    mockUseCliApps.mockReturnValue({
      apps: [app1, app2],
      loading: false,
      refresh: jest.fn(),
      install: mockInstall,
      update: jest.fn(),
      uninstall: jest.fn(),
      test: jest.fn(),
    });
    mockSettingsData.runtime_config["tools.webui_allow_remote_package_install"] = true;

    await renderWithTheme(<AppsScreen />);

    // Tap Install on app1
    const installBtn = screen.getByText("Install");
    await fireEvent.press(installBtn);
    const confirmBtn = screen.getByText("Confirm");
    await fireEvent.press(confirmBtn);

    expect(mockInstall).toHaveBeenCalledWith("app1");

    // app2 still has its buttons enabled (e.g. Test, Update)
    const testBtn = screen.getByText("Test");
    expect(testBtn.props.accessibilityState?.disabled ?? testBtn.props.disabled).toBeFalsy();
  });

  test("I7: McpSheet uses enable and tools passed down as props", async () => {
    const mockEnable = jest.fn().mockResolvedValue({});
    const mockTools = jest.fn().mockResolvedValue({});

    mockSettingsData.runtime_config["tools.webui_allow_remote_package_install"] = true;
    mockUseMcp.mockReturnValue({
      presets: [{ ...samplePreset, enabled: true }],
      loading: false,
      error: null,
      refresh: jest.fn(),
      enable: mockEnable,
      disable: jest.fn(),
      remove: jest.fn(),
      test: jest.fn(),
      reconnect: jest.fn(),
      tools: mockTools,
    });

    await renderWithTheme(<AppsScreen />);
    await fireEvent.press(screen.getByText("MCP"));

    // Open sheet
    await fireEvent.press(screen.getByText("GitHub"));

    // Save triggers prop enable and prop tools
    const saveBtn = screen.getByText("Save");
    await fireEvent.press(saveBtn);

    expect(mockEnable).toHaveBeenCalledWith("github", expect.any(Object));
    expect(mockTools).toHaveBeenCalledWith("github", expect.any(Array));
  });
});
