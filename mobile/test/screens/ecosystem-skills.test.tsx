import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { toast } from "../../src/ui/components/Toast";
import { SkillsScreen } from "../../src/screens/ecosystem/skills/SkillsScreen";
import type { MarketplaceSkillSummary, SkillDetail, SkillSummary } from "@/lib/types";

jest.mock("../../src/ui/components/Toast", () => ({
  toast: { show: jest.fn() },
}));

const mockMutate = jest.fn();
let mockSettingsData: any = {
  runtime_config: {
    "tools.webui_allow_remote_package_install": true,
  },
};

jest.mock("../../src/settings/store", () => ({
  useSettings: () => ({ mutate: mockMutate, data: mockSettingsData, refresh: jest.fn() }),
  useRestart: () => ({ pending: false, sections: [], state: "idle", run: jest.fn() }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

const mockSearch = jest.fn();
const mockDiscover = jest.fn();
const mockTrending = jest.fn();
const mockDetail = jest.fn();
const mockInstall = jest.fn();
const mockUpdate = jest.fn();
const mockRefresh = jest.fn();
const mockUseSkills = jest.fn();

jest.mock("../../src/ecosystem/skills", () => ({
  useSkills: () => mockUseSkills(),
}));

const sampleInstalledSkill: SkillSummary = {
  name: "weather",
  description: "Get weather reports",
  source: "builtin",
  enabled: true,
  available: true,
};

const sampleMarketplaceSkill: MarketplaceSkillSummary = {
  id: "math_solver",
  skill_id: "math_solver",
  name: "Math Solver",
  source: "skills_sh",
  provider: "skills_sh",
  installs: 120,
  url: "https://example.com",
  installed: false,
  install_supported: true,
  metric: "installs_total",
  version: "1.2.0",
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

describe("P4-U3 Skills UI", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useRealTimers();
    await i18n.changeLanguage("en");
    mockSettingsData = {
      runtime_config: {
        "tools.webui_allow_remote_package_install": true,
      },
    };
    mockSearch.mockResolvedValue({ skills: [sampleMarketplaceSkill] });
    mockDiscover.mockResolvedValue({ skills: [sampleMarketplaceSkill] });
    mockTrending.mockResolvedValue({ skills: [sampleMarketplaceSkill] });
    mockDetail.mockResolvedValue({
      ...sampleInstalledSkill,
      requirements: { bins: [], env: [], missing_bins: [], missing_env: [] },
      raw_markdown: "# Weather Skill\nShows current weather.",
    } as SkillDetail);
    mockInstall.mockResolvedValue({ timedOut: false, result: {} });
    mockUpdate.mockResolvedValue({ skills: [] });

    mockUseSkills.mockReturnValue({
      skills: [sampleInstalledSkill],
      loading: false,
      error: null,
      refresh: mockRefresh,
      discover: mockDiscover,
      search: mockSearch,
      trending: mockTrending,
      detail: mockDetail,
      install: mockInstall,
      update: mockUpdate,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("Typing 'abc' calls search('abc') once, only after 400 ms", async () => {
    jest.useFakeTimers();
    await renderWithTheme(<SkillsScreen />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    expect(searchInput).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(searchInput, "abc");
    });

    // Advance 200ms -> should not be called yet
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(mockSearch).not.toHaveBeenCalled();

    // Advance another 200ms (total 400ms)
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith("abc");
  });

  test("Install opens a confirm, and confirm calls install once", async () => {
    mockSettingsData.runtime_config["tools.webui_allow_remote_package_install"] = true;
    mockUseSkills.mockReturnValue({
      skills: [],
      loading: false,
      error: null,
      refresh: mockRefresh,
      discover: mockDiscover,
      search: mockSearch,
      trending: mockTrending,
      detail: mockDetail,
      install: mockInstall,
      update: mockUpdate,
    });

    await renderWithTheme(<SkillsScreen />);

    // Switch to Discover tab
    await fireEvent.press(screen.getByText(/Discover/i));

    const installBtn = await screen.findByText("Install");
    await fireEvent.press(installBtn);

    // Confirm dialog is shown
    expect(screen.getByText(/Install skill Math Solver on host computer/i)).toBeTruthy();

    const confirmBtn = screen.getByText("Confirm");
    await fireEvent.press(confirmBtn);

    expect(mockInstall).toHaveBeenCalledTimes(1);
    expect(mockInstall).toHaveBeenCalledWith(
      sampleMarketplaceSkill.provider,
      sampleMarketplaceSkill.source,
      sampleMarketplaceSkill.skill_id,
      sampleMarketplaceSkill.version,
    );
  });

  test("Gate off: the banner is shown and Install is disabled", async () => {
    mockSettingsData.runtime_config["tools.webui_allow_remote_package_install"] = false;
    mockUseSkills.mockReturnValue({
      skills: [],
      loading: false,
      error: null,
      refresh: mockRefresh,
      discover: mockDiscover,
      search: mockSearch,
      trending: mockTrending,
      detail: mockDetail,
      install: mockInstall,
      update: mockUpdate,
    });

    await renderWithTheme(<SkillsScreen />);

    // Gate banner is shown
    expect(screen.getByText(/Enable remote installs on your computer/i)).toBeTruthy();

    // Switch to Discover tab
    await fireEvent.press(screen.getByText(/Discover/i));

    const installBtn = await screen.findByText("Install");
    expect(installBtn).toBeTruthy();

    // Disabled install button
    await fireEvent.press(installBtn);
    expect(screen.queryByText(/Install skill Math Solver on host computer/i)).toBeNull();
  });

  test("There is no element with a delete/remove label, and the note is present", async () => {
    await renderWithTheme(<SkillsScreen />);

    // Installed tab is default
    expect(screen.queryByRole("button", { name: /delete|remove/i })).toBeNull();

    // The note is present
    expect(screen.getByText(/Remove skills from the WebUI on your computer/i)).toBeTruthy();
  });

  test("A 403 from install shows the policy toast", async () => {
    mockSettingsData.runtime_config["tools.webui_allow_remote_package_install"] = true;
    mockInstall.mockRejectedValueOnce({ status: 403, message: "Policy error" });
    mockUseSkills.mockReturnValue({
      skills: [],
      loading: false,
      error: null,
      refresh: mockRefresh,
      discover: mockDiscover,
      search: mockSearch,
      trending: mockTrending,
      detail: mockDetail,
      install: mockInstall,
      update: mockUpdate,
    });

    await renderWithTheme(<SkillsScreen />);
    await fireEvent.press(screen.getByText(/Discover/i));

    const installBtn = await screen.findByText("Install");
    await fireEvent.press(installBtn);

    const confirmBtn = screen.getByText("Confirm");
    await fireEvent.press(confirmBtn);

    expect(mockInstall).toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith(expect.stringMatching(/Enable remote installs on your computer/i));
  });
});
