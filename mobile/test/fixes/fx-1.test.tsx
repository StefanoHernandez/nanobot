import React from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { lightTheme } from "../../src/ui/theme";
import { i18n } from "../../src/i18n";
import { sessionStore } from "../../src/state/sessionStore";
import { toast } from "../../src/ui/components";
import { fakeSession } from "../state/fake";
import { kv } from "../../src/platform/storage";
import {
  costsStore,
  useCostsBackgroundWatcher,
  type CostsPayload,
} from "../../src/extras/costs";
import {
  systemStore,
  formatDuration,
  temperatureColor,
  type SystemSnapshot,
} from "../../src/extras/system";
import { CostsSection } from "../../src/screens/settings/CostsSection";
import { MachineSection } from "../../src/screens/settings/MachineSection";
import fs from "fs";
import path from "path";

jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => {}),
  requestPermissionsAsync: jest.fn(async () => ({})),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 77 },
}));

jest.mock("../../src/ui/components/Toast", () => {
  const actual = jest.requireActual("../../src/ui/components/Toast");
  return {
    ...actual,
    toast: {
      show: jest.fn(),
    },
  };
});

const wrap = async (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

const sampleCostsPayload: CostsPayload = {
  currency: "USD",
  today: "2026-10-16",
  today_cost_usd: 8.5,
  total_cost_usd: 50.0,
  days: [
    {
      date: "2026-10-16",
      cost_usd: 8.5,
      models: [
        {
          provider: "anthropic",
          model: "claude-3-5-sonnet",
          input_tokens: 1000,
          output_tokens: 500,
          total_tokens: 1500,
          cost_usd: 8.5,
        },
      ],
    },
  ],
  unpriced_models: [],
  prices: {
    "anthropic/claude-3-5-sonnet": {
      input: 3.0,
      output: 15.0,
      cache_read: 0.3,
      cache_write: 3.75,
    },
  },
  daily_cap_usd: 10.0,
  alert_pct: 80,
  alert: true,
  over_cap: false,
};

describe("FX-1: Review fixes for MD-A and CO-A", () => {
  let originalFetch: typeof global.fetch;

  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    costsStore.getState().reset();
    systemStore.getState().reset();
    for (const key of kv.keys()) {
      if (key.startsWith("costs.notified.")) {
        kv.del(key);
      }
    }
    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      value: "active",
    });
    sessionStore.setState({
      session: null,
      state: "open" as never,
      profile: { id: "p1", baseUrl: "http://h", name: "nanobot" } as never,
    });
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  // 1. Watcher starts without opening CostsSection
  test("Item 1: watcher fetches costs(1) on session open and sends alert notification in background without opening screen", async () => {
    sessionStore.setState({
      session: null,
      state: "none",
      profile: null,
    });

    const f = fakeSession();
    sessionStore.setState({
      session: f.session,
      state: "open" as never,
      profile: { id: "p1", baseUrl: "http://h", name: "nanobot" } as never,
    });

    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      value: "background",
    });

    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes("/api/ext/costs")) {
        return {
          ok: true,
          status: 200,
          json: async () => sampleCostsPayload,
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    global.fetch = fetchMock as never;

    expect(costsStore.getState().data).toBeNull();

    // Mount the background watcher (simulating MainLayout mount, without opening CostsSection)
    const { unmount } = await renderHook(() => useCostsBackgroundWatcher());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("days=1"), expect.anything());
    });

    const sched = Notifications.scheduleNotificationAsync as jest.Mock;
    await waitFor(() => {
      expect(sched).toHaveBeenCalledTimes(1);
    });
    expect(sched.mock.calls[0][0].content.title).toMatch(/approaching|raggiunto/i);

    await waitFor(() => {
      expect(costsStore.getState().loading).toBe(false);
    });

    unmount();
  });

  // 2. Editing a price carries cache_write
  test("Item 2: editing a model that has cache_write preserves cache_write when only output is modified", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    let postedBody: any = null;
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/ext/costs/settings") && init?.method === "POST") {
        postedBody = JSON.parse(init.body as string);
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => sampleCostsPayload,
      } as Response;
    }) as never;

    await wrap(<CostsSection />);

    await waitFor(() => {
      expect(screen.getByText("anthropic/claude-3-5-sonnet")).toBeTruthy();
    });

    // Open edit price sheet
    const editBtn = screen.getByLabelText(i18n.t("costs.editPrice", { model: "anthropic/claude-3-5-sonnet" }));
    await act(async () => {
      fireEvent.press(editBtn);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(i18n.t("costs.outputPrice"))).toBeTruthy();
    });

    // Verify cache-write field is populated
    const outputInput = screen.getByLabelText(i18n.t("costs.outputPrice"));
    await act(async () => {
      fireEvent.changeText(outputInput, "18.0");
    });

    // Save
    const saveBtn = screen.getByRole("button", { name: i18n.t("costs.save") });
    await act(async () => {
      fireEvent.press(saveBtn);
    });

    await waitFor(() => {
      expect(postedBody).not.toBeNull();
    });

    await waitFor(() => {
      expect(screen.queryByLabelText(i18n.t("costs.outputPrice"))).toBeNull();
    });

    const modelPrice = postedBody.prices["anthropic/claude-3-5-sonnet"];
    expect(modelPrice.input).toBe(3.0);
    expect(modelPrice.output).toBe(18.0);
    expect(modelPrice.cache_read).toBe(0.3);
    // MUST preserve cache_write!
    expect(modelPrice.cache_write).toBe(3.75);

    await waitFor(() => {
      expect(costsStore.getState().loading).toBe(false);
    });
  });

  // 3. Invalid or negative cache_read/cache_write block save and show costs.invalidPrice
  test("Item 3: negative cache_read or cache_write shows costs.invalidPrice and blocks save", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => sampleCostsPayload,
    }));
    global.fetch = fetchMock as never;

    await wrap(<CostsSection />);

    await waitFor(() => {
      expect(screen.getByText("anthropic/claude-3-5-sonnet")).toBeTruthy();
    });

    const editBtn = screen.getByLabelText(i18n.t("costs.editPrice", { model: "anthropic/claude-3-5-sonnet" }));
    await act(async () => {
      fireEvent.press(editBtn);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(i18n.t("costs.cacheReadPrice"))).toBeTruthy();
    });

    const cacheReadInput = screen.getByLabelText(i18n.t("costs.cacheReadPrice"));
    const saveBtn = screen.getByRole("button", { name: i18n.t("costs.save") });
    await act(async () => {
      fireEvent.changeText(cacheReadInput, "-0.5");
      fireEvent.press(saveBtn);
    });

    expect(toast.show).toHaveBeenCalledWith(i18n.t("costs.invalidPrice"));
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/settings"), expect.anything());
  });

  // 4. Hardcoded strings moved to i18n
  test("Item 4: price line and placeholders use i18n in it and en", () => {
    const itTranslations = require("../../src/i18n/it.json");
    const enTranslations = require("../../src/i18n/en.json");

    for (const key of [
      "inputPricePlaceholder",
      "outputPricePlaceholder",
      "cacheReadPlaceholder",
      "cacheWritePlaceholder",
      "capPlaceholder",
      "alertPctPlaceholder",
      "priceSummary",
      "cacheReadPart",
      "cacheWritePart",
      "cacheBothPart",
    ]) {
      expect(itTranslations.costs[key]).toBeTruthy();
      expect(enTranslations.costs[key]).toBeTruthy();
    }
  });

  // 5. Daily bars touch target >= 48dp
  test("Item 5: daily bars have at least 48dp touch area (hitSlop or style)", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => sampleCostsPayload,
    })) as never;

    await wrap(<CostsSection />);

    await waitFor(() => {
      expect(screen.getAllByTestId("costs-day-bar").length).toBeGreaterThan(0);
    });

    const bars = screen.getAllByTestId("costs-day-bar");
    const firstBar = bars[0];
    const hitSlop = firstBar.props.hitSlop;
    const style = firstBar.props.style;
    const minHeight = style?.minHeight ?? 0;
    const height = style?.height;
    // Must have hitSlop or height >= 48
    expect(hitSlop || minHeight >= 48 || height >= 48 || height === "100%").toBeTruthy();
  });

  // 6. Range change fires only ONE request
  test("Item 6: changing the range fires only one request, not two", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    const fetchMock = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => sampleCostsPayload,
    }));
    global.fetch = fetchMock as never;

    await wrap(<CostsSection />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("days=30"), expect.anything());
    });
    fetchMock.mockClear();

    // Click 7 days range
    const chip7 = screen.getByText(i18n.t("costs.range7d"));
    fireEvent.press(chip7);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("days=7"), expect.anything());
    });

    await waitFor(() => {
      expect(costsStore.getState().days).toBe(7);
      expect(costsStore.getState().loading).toBe(false);
    });

    // Must be called exactly once for days=7!
    const callsFor7 = fetchMock.mock.calls.filter((c: any) => c[0].includes("days=7"));
    expect(callsFor7).toHaveLength(1);
  });

  // 7. Bar color uses brand for alert and destructive for over_cap
  test("Item 7: progress bar color uses brand for alert and destructive for over_cap", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    const alertPayload = { ...sampleCostsPayload, alert: true, over_cap: false };
    const overCapPayload = { ...sampleCostsPayload, alert: true, over_cap: true };

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => alertPayload,
    })) as never;

    await wrap(<CostsSection />);
    await waitFor(() => {
      expect(screen.getByTestId("costs-cap-progress")).toBeTruthy();
    });
    expect(screen.getByTestId("costs-cap-progress").props.style[0].backgroundColor).toBe(lightTheme.colors.brand);

    // over_cap = true -> destructive
    await act(async () => {
      costsStore.setState({ data: overCapPayload });
    });

    expect(screen.getByTestId("costs-cap-progress").props.style[0].backgroundColor).toBe(lightTheme.colors.destructive);
  });

  // 8. Machine error banner does not flicker during poll
  test("Item 8: refresh does not clear error before poll response", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    // Set initial error in systemStore
    systemStore.setState({ error: "common.operationFailed", data: null, loading: false });

    let resolveFetch: any;
    global.fetch = jest.fn((url: string) => {
      if (typeof url === "string" && url.includes("/api/ext/system")) {
        return new Promise((res) => {
          resolveFetch = res;
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);
    }) as never;

    // Start refresh (in-flight)
    const p = systemStore.getState().refresh();

    // In flight: error must NOT be cleared!
    expect(systemStore.getState().loading).toBe(true);
    expect(systemStore.getState().error).toBe("common.operationFailed");

    // Finish fetch successfully
    await act(async () => {
      resolveFetch({
        ok: true,
        status: 200,
        json: async () => ({ cpu_percent: 10, load: [1, 1, 1], cores: 2, memory: null, temperature_c: 40, disk: null, uptime_s: 100, gateway_uptime_s: 100, log_errors: [] }),
      });
      await p;
    });

    // Now error is cleared
    expect(systemStore.getState().error).toBeNull();
  });

  // 9. formatDuration units in i18n
  test("Item 9: formatDuration helper takes t function and renders translated units", async () => {
    // English
    await i18n.changeLanguage("en");
    expect(formatDuration(0, i18n.t)).toBe("0 s");
    expect(formatDuration(59, i18n.t)).toBe("59 s");
    expect(formatDuration(61 * 60, i18n.t)).toBe("61 min");
    expect(formatDuration(3 * 86400 + 4 * 3600, i18n.t)).toBe("3 days 4 h");
    expect(formatDuration(1 * 86400 + 4 * 3600, i18n.t)).toBe("1 day 4 h");

    // Italian
    await i18n.changeLanguage("it");
    expect(formatDuration(0, i18n.t)).toBe("0 s");
    expect(formatDuration(59, i18n.t)).toBe("59 s");
    expect(formatDuration(61 * 60, i18n.t)).toBe("61 min");
    expect(formatDuration(3 * 86400 + 4 * 3600, i18n.t)).toBe("3 g 4 h");
    expect(formatDuration(1 * 86400 + 4 * 3600, i18n.t)).toBe("1 g 4 h");

    // Reset back to English
    await i18n.changeLanguage("en");
  });

  // 10. Temperature warning uses colors.brand
  test("Item 10: temperature warning at 65 °C uses colors.brand and danger at 75 °C uses destructive", () => {
    expect(temperatureColor(64, lightTheme)).toBe(lightTheme.colors.foreground);
    // 65 °C must use brand!
    expect(temperatureColor(65, lightTheme)).toBe(lightTheme.colors.brand);
    expect(temperatureColor(74.9, lightTheme)).toBe(lightTheme.colors.brand);
    // 75 °C must use destructive!
    expect(temperatureColor(75, lightTheme)).toBe(lightTheme.colors.destructive);
  });

  // 11. load rendered only if Array.isArray(data.load)
  test("Item 11: load averages render '—' if load is not an Array", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    // Payload with non-array load (null, string, object)
    const badLoadSnapshot: SystemSnapshot = {
      cpu_percent: 20,
      load: null as any,
      cores: 4,
      memory: null,
      temperature_c: 50,
      disk: null,
      uptime_s: 100,
      gateway_uptime_s: 100,
      log_errors: [],
    };

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => badLoadSnapshot,
    })) as never;

    await wrap(<MachineSection />);

    await waitFor(() => {
      expect(screen.getByText("20%")).toBeTruthy();
    });

    // Load section should display "—"
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  // 12. No sessionStore?.getState ? ... in system.ts
  test("Item 12: system.ts contains no defensive sessionStore?.getState ? ... ternary checks", () => {
    const filePath = path.resolve(__dirname, "../../src/extras/system.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).not.toContain("sessionStore?.getState ?");
  });
});
