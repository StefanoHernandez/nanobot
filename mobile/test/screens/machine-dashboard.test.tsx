import React from "react";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { lightTheme } from "../../src/ui/theme";
import { i18n } from "../../src/i18n";
import { sessionStore } from "../../src/state/sessionStore";
import { settingsStore, runRestart } from "../../src/settings/store";
import { fakeSession } from "../state/fake";
import {
  systemStore,
  useSystemStats,
  fetchSystem,
  formatDuration,
  temperatureColor,
  type SystemSnapshot,
} from "../../src/extras/system";
import { MachineSection } from "../../src/screens/settings/MachineSection";
import { SettingsScreen, SECTIONS } from "../../src/screens/settings/SettingsScreen";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ addListener: jest.fn(() => () => {}), dispatch: jest.fn() }),
}));

const mockRunRestart = jest.fn(async () => {});

jest.mock("../../src/settings/store", () => {
  const actual = jest.requireActual("../../src/settings/store");
  return {
    ...actual,
    useRestart: () => ({
      pending: false,
      sections: [],
      state: "idle",
      run: mockRunRestart,
    }),
  };
});

const wrap = async (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

const sampleSnapshot: SystemSnapshot = {
  cpu_percent: 24.5,
  load: [0.45, 0.62, 0.58],
  cores: 4,
  memory: {
    total_mb: 4096,
    used_mb: 2048,
    swap_total_mb: 1024,
    swap_used_mb: 256,
  },
  temperature_c: 55.2,
  disk: {
    total_gb: 64,
    used_gb: 20,
    free_gb: 44,
  },
  uptime_s: 273600, // 3 days 4 hours (3 * 86400 + 4 * 3600)
  gateway_uptime_s: 720, // 12 min (12 * 60)
  log_errors: [
    "2026-10-15 10:00:00 | ERROR | first error",
    "2026-10-15 10:05:00 | ERROR | second error",
    "2026-10-15 10:10:00 | CRITICAL | third newest error",
  ],
};

describe("MD-A: Machine Dashboard", () => {
  let originalFetch: typeof global.fetch;

  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    systemStore.getState().reset();
    sessionStore.setState({
      session: null,
      state: "open" as never,
      profile: { id: "p1", baseUrl: "http://testserver", name: "nanobot" } as never,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // 1. Duration helper tests
  describe("Duration helper (formatDuration)", () => {
    test("formats 0 s, 59 s, 61 min, 3 days 4 h in en and 3 g 4 h in it", async () => {
      await i18n.changeLanguage("en");
      expect(formatDuration(0, i18n.t)).toBe("0 s");
      expect(formatDuration(59, i18n.t)).toBe("59 s");
      expect(formatDuration(61 * 60, i18n.t)).toBe("61 min");
      expect(formatDuration(3 * 86400 + 4 * 3600, i18n.t)).toBe("3 days 4 h");

      // In Italian
      await i18n.changeLanguage("it");
      expect(formatDuration(0, i18n.t)).toBe("0 s");
      expect(formatDuration(59, i18n.t)).toBe("59 s");
      expect(formatDuration(61 * 60, i18n.t)).toBe("61 min");
      expect(formatDuration(3 * 86400 + 4 * 3600, i18n.t)).toBe("3 g 4 h");

      // Reset to en
      await i18n.changeLanguage("en");

      // Null / undefined
      expect(formatDuration(null, i18n.t)).toBe("—");
      expect(formatDuration(undefined, i18n.t)).toBe("—");
    });
  });

  // 2. Temperature color threshold tests
  describe("Temperature color thresholds", () => {
    test("thresholds at 64 °C (normal), 65 °C (warning), and 75 °C (danger)", () => {
      // 64 °C: normal
      expect(temperatureColor(64, lightTheme)).toBe(lightTheme.colors.foreground);
      // 64.9 °C: normal
      expect(temperatureColor(64.9, lightTheme)).toBe(lightTheme.colors.foreground);
      // 65 °C: warning (turns warning colour at 65 °C or more) -> colors.brand!
      expect(temperatureColor(65, lightTheme)).toBe(lightTheme.colors.brand);
      // 74.9 °C: warning
      expect(temperatureColor(74.9, lightTheme)).toBe(lightTheme.colors.brand);
      // 75 °C: danger (turns danger colour at 75 °C or more)
      expect(temperatureColor(75, lightTheme)).toBe(lightTheme.colors.destructive);
      // 80 °C: danger
      expect(temperatureColor(80, lightTheme)).toBe(lightTheme.colors.destructive);
      // null: neutral
      expect(temperatureColor(null, lightTheme)).toBe(lightTheme.colors.mutedForeground);
    });
  });

  // 3. SettingsScreen wiring
  test("SettingsScreen includes machine section after system", () => {
    const sysIdx = SECTIONS.indexOf("system" as any);
    const machIdx = SECTIONS.indexOf("machine" as any);
    expect(machIdx).toBe(sysIdx + 1);
  });

  // 4. Rendering GET payload: CPU, RAM, disk, temperature, load
  test("renders CPU, RAM, disk, temperature, load and uptimes; swap is shown when swap_total_mb > 0", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => sampleSnapshot,
    })) as never;

    await wrap(<MachineSection />);

    // Wait for the stats to load into screen
    await waitFor(() => {
      expect(screen.getByText("24.5%")).toBeTruthy();
    });

    // RAM
    expect(screen.getByText(/2048 \/ 4096 MB/)).toBeTruthy();
    // Swap (swap_total_mb = 1024 > 0, so shown)
    expect(screen.getByText(/256 \/ 1024 MB/)).toBeTruthy();
    // Disk
    expect(screen.getByText(/20 \/ 64 GB/)).toBeTruthy();
    // Temperature
    expect(screen.getByText("55.2 °C")).toBeTruthy();
    // Load and cores
    expect(screen.getByText(/0.45/)).toBeTruthy();
    expect(screen.getByText(/4 core/i)).toBeTruthy();
    // Uptimes
    expect(screen.getByText("3 days 4 h")).toBeTruthy();
    expect(screen.getByText("12 min")).toBeTruthy();
  });

  // 5. Null fields render "—" and swap is hidden when swap_total_mb is 0
  test("null fields render '—' and swap is hidden when swap_total_mb is 0", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    const nullSnapshot: SystemSnapshot = {
      cpu_percent: null,
      load: null,
      cores: null,
      memory: {
        total_mb: 4096,
        used_mb: 1024,
        swap_total_mb: 0,
        swap_used_mb: 0,
      },
      temperature_c: null,
      disk: null,
      uptime_s: null,
      gateway_uptime_s: null,
      log_errors: [],
    };

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => nullSnapshot,
    })) as never;

    await wrap(<MachineSection />);

    await waitFor(() => {
      // Find multiple "—" placeholders for null fields
      const placeholders = screen.getAllByText("—");
      expect(placeholders.length).toBeGreaterThanOrEqual(4);
    });

    // Swap should NOT be rendered when swap_total_mb === 0
    expect(screen.queryByTestId("swap-gauge")).toBeNull();
    expect(screen.queryByText(/swap/i)).toBeNull();
  });

  // 6. log_errors rendered newest first, empty shows machine.noErrors
  test("log_errors renders newest first; empty list shows machine.noErrors", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => sampleSnapshot,
    })) as never;

    await wrap(<MachineSection />);

    await waitFor(() => {
      expect(screen.getByText("2026-10-15 10:10:00 | CRITICAL | third newest error")).toBeTruthy();
    });

    // Check order: newest first
    const renderedLogs = screen.getAllByTestId("log-error-item");
    expect(renderedLogs).toHaveLength(3);
    expect(renderedLogs[0].props.children).toContain("third newest error");
    expect(renderedLogs[1].props.children).toContain("second error");
    expect(renderedLogs[2].props.children).toContain("first error");

    // Test empty list
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ...sampleSnapshot, log_errors: [] }),
    })) as never;

    await act(async () => {
      await systemStore.getState().refresh();
    });

    expect(screen.getByText(i18n.t("machine.noErrors"))).toBeTruthy();
  });

  // 7. Polling failure keeps previous data; 403 shows machine.noAccess; other error shows common.operationFailed
  test("failed poll keeps previous data; 403 shows machine.noAccess", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    // Initial good data
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => sampleSnapshot,
    })) as never;

    await wrap(<MachineSection />);

    await waitFor(() => {
      expect(screen.getByText("24.5%")).toBeTruthy();
    });

    // Subsequent poll fails with 403
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: "Forbidden" }),
    })) as never;

    await act(async () => {
      await systemStore.getState().refresh();
    });

    // Error banner shows machine.noAccess ("Access denied")
    expect(screen.getByText(i18n.t("machine.noAccess"))).toBeTruthy();
    // Raw error message is NEVER shown
    expect(screen.queryByText(/Forbidden/i)).toBeNull();
    // Last good data is KEPT on screen!
    expect(screen.getByText("24.5%")).toBeTruthy();
    expect(screen.getByText("55.2 °C")).toBeTruthy();

    // Another failure with 500 shows common.operationFailed
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal Server Error" }),
    })) as never;

    await act(async () => {
      await systemStore.getState().refresh();
    });

    expect(screen.getByText(i18n.t("common.operationFailed"))).toBeTruthy();
    expect(screen.queryByText(/Internal Server Error/i)).toBeNull();
    // Data is still kept
    expect(screen.getByText("24.5%")).toBeTruthy();
  });

  // 8. Profile switch mid-request drops stale result
  test("profile switch mid-request drops stale result and clears data", async () => {
    let resolveFetch: ((v: any) => void) | null = null;
    global.fetch = jest.fn(() => {
      return new Promise((res) => {
        resolveFetch = () => res({ ok: true, status: 200, json: async () => sampleSnapshot });
      });
    }) as never;

    const f = fakeSession();
    sessionStore.setState({
      session: f.session,
      profile: { id: "profile-1", baseUrl: "http://h1", name: "P1" } as never,
    });

    // Start refresh in-flight
    const refreshPromise = systemStore.getState().refresh();

    // Switch profile mid-flight
    await act(async () => {
      sessionStore.setState({
        profile: { id: "profile-2", baseUrl: "http://h2", name: "P2" } as never,
      });
    });

    // Resolve fetch
    await act(async () => {
      resolveFetch?.(null);
      await refreshPromise;
    });

    // The stale result was dropped; data is null
    expect(systemStore.getState().data).toBeNull();
  });

  // 9. Restart row asks for confirm dialog, then calls useRestart().run
  test("restart row asks for confirm dialog, then calls existing restart", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => sampleSnapshot,
    })) as never;

    await wrap(<MachineSection />);

    await waitFor(() => {
      expect(screen.getByText("24.5%")).toBeTruthy();
    });

    // Find and press the restart row
    const restartBtn = screen.getByRole("button", { name: new RegExp(i18n.t("machine.restart"), "i") });
    await act(async () => {
      fireEvent.press(restartBtn);
    });

    // Confirm dialog is shown
    expect(screen.getAllByText(i18n.t("machine.restartConfirmTitle")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(i18n.t("machine.restartConfirmMessage"))).toBeTruthy();

    // Press Confirm
    const confirmBtn = screen.getByRole("button", { name: i18n.t("machine.restartConfirm") });
    await act(async () => {
      fireEvent.press(confirmBtn);
    });

    // run was called
    expect(mockRunRestart).toHaveBeenCalled();
  });

  // 10. Polling interval is 5s and hook does not poll in background
  test("polling interval is 5 s and disabled in background", async () => {
    jest.useFakeTimers();
    try {
      const fetchMock = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => sampleSnapshot,
      }));
      global.fetch = fetchMock as never;

      const f = fakeSession();
      sessionStore.setState({ session: f.session, state: "open" as never });

      let appListener: (s: string) => void = () => {};
      const remove = jest.fn();
      jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, l: (s: string) => void) => ((appListener = l), { remove })) as never);

      Object.defineProperty(AppState, "currentState", {
        configurable: true,
        value: "active",
      });

      const { unmount } = await renderHook(() => useSystemStats());
      // Initial fetch on mount
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Advance by 5s in active state -> ticks
      await act(async () => {
        await jest.advanceTimersByTimeAsync(5000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Switch to background via AppState event
      Object.defineProperty(AppState, "currentState", {
        configurable: true,
        value: "background",
      });
      appListener("background");

      // Advance by 5s in background -> MUST NOT TICK!
      await act(async () => {
        await jest.advanceTimersByTimeAsync(5000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Advance another 15s in background -> STILL MUST NOT TICK!
      await act(async () => {
        await jest.advanceTimersByTimeAsync(15000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      unmount();
      jest.restoreAllMocks();
    } finally {
      jest.useRealTimers();
    }
  });
});
