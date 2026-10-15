import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
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
  formatCost,
  formatTokens,
  costsStore,
  type CostsPayload,
} from "../../src/extras/costs";
import { CostsSection } from "../../src/screens/settings/CostsSection";

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

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("CO-A: costs", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    costsStore.getState().reset();
    sessionStore.setState({
      session: null,
      state: "open" as never,
      profile: { id: "p1", baseUrl: "http://h", name: "nanobot" } as never,
    });
    // Clear test notifications in kv
    for (const key of kv.keys()) {
      if (key.startsWith("costs.notified.")) {
        kv.del(key);
      }
    }
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("the money and token formatter edge cases", () => {
    // Money formatter: $0.0042 below 1 cent, $1.20 otherwise
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(0.0042)).toBe("$0.0042");
    expect(formatCost(0.0001)).toBe("$0.0001");
    expect(formatCost(0.0099)).toBe("$0.0099");
    expect(formatCost(0.01)).toBe("$0.01");
    expect(formatCost(1.2)).toBe("$1.20");
    expect(formatCost(5)).toBe("$5.00");
    expect(formatCost(1234.56)).toBe("$1234.56");

    // Token counts: compact (1.2M, 340k)
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(500)).toBe("500");
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(10000)).toBe("10k");
    expect(formatTokens(340000)).toBe("340k");
    expect(formatTokens(1000000)).toBe("1M");
    expect(formatTokens(1200000)).toBe("1.2M");
  });

  test("the payload renders today, the cap bar and per-model sorting. An unpriced model shows — and the banner", async () => {
    const mockPayload: CostsPayload = {
      currency: "USD",
      today: "2026-10-16",
      today_cost_usd: 1.2,
      total_cost_usd: 10.5,
      days: [
        {
          date: "2026-10-16",
          cost_usd: 1.2,
          models: [
            {
              provider: "openai",
              model: "gpt-4o",
              input_tokens: 10000,
              output_tokens: 2000,
              total_tokens: 12000,
              cache_read_tokens: 0,
              cache_write_tokens: 0,
              cost_usd: 0.25,
            },
            {
              provider: "anthropic",
              model: "claude-3-5-sonnet",
              input_tokens: 50000,
              output_tokens: 10000,
              total_tokens: 60000,
              cache_read_tokens: 0,
              cache_write_tokens: 0,
              cost_usd: 0.95,
            },
            {
              provider: "ollama",
              model: "llama3",
              input_tokens: 80000,
              output_tokens: 20000,
              total_tokens: 100000,
              cache_read_tokens: 0,
              cache_write_tokens: 0,
              cost_usd: null,
            },
          ],
        },
      ],
      unpriced_models: ["ollama/llama3"],
      prices: {
        "anthropic/claude-3-5-sonnet": { input: 3, output: 15 },
        "openai/gpt-4o": { input: 2.5, output: 10 },
      },
      daily_cap_usd: 5.0,
      alert_pct: 80,
      alert: false,
      over_cap: false,
    };

    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mockPayload,
    } as Response));
    global.fetch = fetchMock as never;

    await wrap(<CostsSection />);

    // Header shows today's cost and cap: "$1.20 / $5.00"
    expect(screen.getByText(/\$1\.20\s*\/\s*\$5\.00/)).toBeTruthy();

    // Models sorted by cost: claude ($0.95) should appear before gpt-4o ($0.25)
    expect(screen.getByText("claude-3-5-sonnet")).toBeTruthy();
    expect(screen.getByText("gpt-4o")).toBeTruthy();
    expect(screen.getByText("llama3")).toBeTruthy();

    // Unpriced model shows "—"
    expect(screen.getByText("—")).toBeTruthy();

    // Unpriced banner is visible
    expect(screen.getByText(/1 unpriced model|1 modello senza prezzo/i)).toBeTruthy();

    // Action "Set price" / "Imposta prezzo" is present
    expect(screen.getByText(/set price|imposta prezzo/i)).toBeTruthy();
  });

  test("bar colour for normal, alert and over_cap", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    // 1. Normal
    const payloadNormal: CostsPayload = {
      currency: "USD",
      today: "2026-10-16",
      today_cost_usd: 1.0,
      total_cost_usd: 5.0,
      days: [{ date: "2026-10-16", cost_usd: 1.0, models: [] }],
      unpriced_models: [],
      prices: {},
      daily_cap_usd: 5.0,
      alert_pct: 80,
      alert: false,
      over_cap: false,
    };

    let currentPayload = payloadNormal;
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => currentPayload,
    } as Response));
    global.fetch = fetchMock as never;

    const { unmount } = await wrap(<CostsSection />);
    const barNormal = screen.getByTestId("costs-cap-progress");
    expect(barNormal.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: lightTheme.colors.primary })]),
    );
    await unmount();

    // 2. Alert
    currentPayload = {
      ...payloadNormal,
      today_cost_usd: 4.2,
      alert: true,
      over_cap: false,
    };
    const { unmount: unmountAlert } = await wrap(<CostsSection />);
    const barAlert = screen.getByTestId("costs-cap-progress");
    expect(barAlert.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: lightTheme.colors.brand })]),
    );
    await unmountAlert();

    // 3. Over cap
    currentPayload = {
      ...payloadNormal,
      today_cost_usd: 6.0,
      alert: true,
      over_cap: true,
    };
    await wrap(<CostsSection />);
    const barOver = screen.getByTestId("costs-cap-progress");
    expect(barOver.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: lightTheme.colors.destructive })]),
    );
  });

  test("the range chips change the totals between 7 and 30 days, and missing days render as empty bars", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    const payload30d: CostsPayload = {
      currency: "USD",
      today: "2026-10-16",
      today_cost_usd: 2.0,
      total_cost_usd: 45.0,
      days: [
        { date: "2026-10-16", cost_usd: 2.0, models: [] },
        { date: "2026-10-10", cost_usd: 5.0, models: [] }, // within 7 days
        { date: "2026-09-25", cost_usd: 38.0, models: [] }, // > 7 days ago
      ],
      unpriced_models: [],
      prices: {},
      daily_cap_usd: null,
      alert_pct: 80,
      alert: false,
      over_cap: false,
    };

    const payload7d: CostsPayload = {
      ...payload30d,
      total_cost_usd: 7.0,
      days: [
        { date: "2026-10-16", cost_usd: 2.0, models: [] },
        { date: "2026-10-10", cost_usd: 5.0, models: [] },
      ],
    };

    const fetchMock = jest.fn(async (url: string) => {
      const is7d = url.includes("days=7");
      return {
        ok: true,
        status: 200,
        json: async () => (is7d ? payload7d : payload30d),
      } as Response;
    });
    global.fetch = fetchMock as never;

    await wrap(<CostsSection />);

    // Default is 30 days, total $45.00
    expect(screen.getByText(/\$45\.00/)).toBeTruthy();

    // Missing days render: in 30 days, 30 bars are rendered
    const dayBars30 = screen.getAllByTestId("costs-day-bar");
    expect(dayBars30).toHaveLength(30);

    // Switch range to 7 days
    const chip7 = screen.getByText(/7 days|7 giorni/i);
    await act(async () => {
      fireEvent.press(chip7);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("days=7"),
      expect.anything(),
    );
    expect(screen.getByText(/\$7\.00/)).toBeTruthy();

    const dayBars7 = screen.getAllByTestId("costs-day-bar");
    expect(dayBars7).toHaveLength(7);
  });

  test("the prices sheet posts the full map. Delete posts the map without that key. Opening it from an unpriced model prefills the key. Invalid numbers are refused on the client", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    const mockPayload: CostsPayload = {
      currency: "USD",
      today: "2026-10-16",
      today_cost_usd: 0,
      total_cost_usd: 0,
      days: [
        {
          date: "2026-10-16",
          cost_usd: 0,
          models: [
            {
              provider: "ollama",
              model: "mistral",
              input_tokens: 1000,
              output_tokens: 500,
              total_tokens: 1500,
              cache_read_tokens: 0,
              cache_write_tokens: 0,
              cost_usd: null,
            },
          ],
        },
      ],
      unpriced_models: ["ollama/mistral"],
      prices: {
        "anthropic/claude-3-5-sonnet": { input: 3, output: 15 },
      },
      daily_cap_usd: null,
      alert_pct: 80,
      alert: false,
      over_cap: false,
    };

    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => mockPayload,
      } as Response;
    });
    global.fetch = fetchMock as never;

    await wrap(<CostsSection />);

    // 1. Opening from an unpriced model prefills the key
    const setPriceBtn = screen.getByText(/set price|imposta prezzo/i);
    await act(async () => {
      fireEvent.press(setPriceBtn);
    });

    // Model key input is prefilled with "ollama/mistral"
    const modelInput = screen.getByDisplayValue("ollama/mistral");
    expect(modelInput).toBeTruthy();

    // 2. Invalid numbers are refused on the client
    const inputPriceInput = screen.getByLabelText(/input price|prezzo input/i);
    const outputPriceInput = screen.getByLabelText(/output price|prezzo output/i);
    const saveBtn = screen.getByRole("button", { name: /^save$|^salva$/i });

    // Enter negative or invalid price
    await act(async () => {
      fireEvent.changeText(inputPriceInput, "-2.5");
      fireEvent.changeText(outputPriceInput, "abc");
      fireEvent.press(saveBtn);
    });

    // Toast refused or error shown, POST not called
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/settings"),
      expect.objectContaining({ method: "POST" }),
    );

    // Enter valid prices
    await act(async () => {
      fireEvent.changeText(inputPriceInput, "0.5");
      fireEvent.changeText(outputPriceInput, "1.5");
      fireEvent.press(saveBtn);
    });

    // Posts the full map
    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/costs/settings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          prices: {
            "anthropic/claude-3-5-sonnet": { input: 3, output: 15 },
            "ollama/mistral": { input: 0.5, output: 1.5 },
          },
        }),
      }),
    );

    // 3. Edit existing price and delete it
    const editBtn = screen.getByLabelText(/edit anthropic\/claude-3-5-sonnet|modifica anthropic\/claude-3-5-sonnet/i);
    await act(async () => {
      fireEvent.press(editBtn);
    });

    const deleteBtn = screen.getByRole("button", { name: /delete price|elimina prezzo/i });
    await act(async () => {
      fireEvent.press(deleteBtn);
    });

    // Delete posts map without that key
    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/costs/settings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          prices: {},
        }),
      }),
    );
  });

  test("saving the cap posts the number. An empty field posts null. alert_pct 0 or 101 is refused", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    const mockPayload: CostsPayload = {
      currency: "USD",
      today: "2026-10-16",
      today_cost_usd: 0,
      total_cost_usd: 0,
      days: [],
      unpriced_models: [],
      prices: {},
      daily_cap_usd: 5.0,
      alert_pct: 80,
      alert: false,
      over_cap: false,
    };

    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => mockPayload,
      } as Response;
    });
    global.fetch = fetchMock as never;

    await wrap(<CostsSection />);

    const capInput = screen.getByLabelText(/daily cap|limite giornaliero/i);
    const alertPctInput = screen.getByLabelText(/alert threshold|soglia avviso/i);

    // 1. Save valid cap
    await act(async () => {
      fireEvent.changeText(capInput, "10");
      fireEvent(capInput, "blur");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/costs/settings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ daily_cap_usd: 10 }),
      }),
    );

    // 2. Empty field posts null
    await act(async () => {
      fireEvent.changeText(capInput, "");
      fireEvent(capInput, "blur");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/costs/settings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ daily_cap_usd: null }),
      }),
    );

    // 3. alert_pct 0 or 101 is refused
    fetchMock.mockClear();
    await act(async () => {
      fireEvent.changeText(alertPctInput, "0");
      fireEvent(alertPctInput, "blur");
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.changeText(alertPctInput, "101");
      fireEvent(alertPctInput, "blur");
    });
    expect(fetchMock).not.toHaveBeenCalled();

    // 4. Valid alert_pct
    await act(async () => {
      fireEvent.changeText(alertPctInput, "75");
      fireEvent(alertPctInput, "blur");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/costs/settings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ alert_pct: 75 }),
      }),
    );
  });

  test("the notification fires once per day per kind, and is not fired when no cap is set", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    // Put AppState in background
    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      value: "background",
    });

    // 1. When no cap is set: does NOT fire even if alert/over_cap flags are somehow true
    const noCapPayload: CostsPayload = {
      currency: "USD",
      today: "2026-10-16",
      today_cost_usd: 10,
      total_cost_usd: 10,
      days: [],
      unpriced_models: [],
      prices: {},
      daily_cap_usd: null,
      alert_pct: 80,
      alert: true,
      over_cap: true,
    };

    let currentPayload = noCapPayload;
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => currentPayload,
    } as Response));
    global.fetch = fetchMock as never;

    await act(async () => {
      await costsStore.getState().refresh();
    });

    const sched = Notifications.scheduleNotificationAsync as jest.Mock;
    expect(sched).not.toHaveBeenCalled();

    // 2. Alert fires when cap is set and alert is true
    currentPayload = {
      ...noCapPayload,
      daily_cap_usd: 5.0,
      today_cost_usd: 4.2,
      alert: true,
      over_cap: false,
    };

    await act(async () => {
      await costsStore.getState().refresh();
    });

    expect(sched).toHaveBeenCalledTimes(1);
    expect(sched.mock.calls[0][0].trigger).toEqual({ channelId: "turns" });
    expect(sched.mock.calls[0][0].content.title).toMatch(/approaching|quasi raggiunto/i);

    // Refreshing again today does NOT repeat alert
    await act(async () => {
      await costsStore.getState().refresh();
    });
    expect(sched).toHaveBeenCalledTimes(1);

    // 3. Later, over_cap turns true -> fires overNotify
    currentPayload = {
      ...currentPayload,
      today_cost_usd: 5.5,
      alert: true,
      over_cap: true,
    };

    await act(async () => {
      await costsStore.getState().refresh();
    });

    expect(sched).toHaveBeenCalledTimes(2);
    expect(sched.mock.calls[1][0].content.title).toMatch(/exceeded|superato/i);

    // Refreshing again does NOT repeat
    await act(async () => {
      await costsStore.getState().refresh();
    });
    expect(sched).toHaveBeenCalledTimes(2);

    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      value: "active",
    });
  });

  test("a profile switch mid-request drops the stale result", async () => {
    let resolveRefresh: ((v: any) => void) | null = null;
    const fetchMock = jest.fn(() => {
      return new Promise((res) => {
        resolveRefresh = () =>
          res({
            ok: true,
            status: 200,
            json: async () => ({
              currency: "USD",
              today: "2026-10-16",
              today_cost_usd: 99.9,
              total_cost_usd: 99.9,
              days: [],
              unpriced_models: [],
              prices: {},
              daily_cap_usd: null,
              alert_pct: 80,
              alert: false,
              over_cap: false,
            }),
          });
      });
    });
    global.fetch = fetchMock as never;

    const f = fakeSession();
    sessionStore.setState({
      session: f.session,
      profile: { id: "profile-1", baseUrl: "http://h", name: "P1" } as never,
    });

    const refreshPromise = costsStore.getState().refresh();

    // Switch profile while request is in flight
    await act(async () => {
      sessionStore.setState({
        profile: { id: "profile-2", baseUrl: "http://h2", name: "P2" } as never,
      });
    });

    // Stale request resolves
    await act(async () => {
      resolveRefresh?.(null);
      await refreshPromise;
    });

    // Data was dropped
    expect(costsStore.getState().data).toBeNull();
  });
});
