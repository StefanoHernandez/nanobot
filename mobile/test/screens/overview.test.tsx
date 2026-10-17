import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { OverviewSection } from "../../src/screens/settings/OverviewSection";
import { settingsStore } from "../../src/settings/store";
import { sessionStore } from "../../src/state/sessionStore";
import { i18n } from "../../src/i18n";
import * as systemExtra from "../../src/extras/system";
import * as costsExtra from "../../src/extras/costs";
import * as journalEcosystem from "../../src/ecosystem/journal";
import * as kanbanEcosystem from "../../src/ecosystem/kanban";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ addListener: jest.fn(() => () => {}), dispatch: jest.fn() }),
}));

jest.mock("../../src/core/profiles", () => ({
  profiles: { getSecret: jest.fn() },
}));

const mockSystemData: systemExtra.SystemSnapshot = {
  cpu_percent: 42,
  load: [1.2, 0.8, 0.5],
  cores: 4,
  memory: {
    total_mb: 4096,
    used_mb: 2048,
    swap_total_mb: 1024,
    swap_used_mb: 256,
  },
  temperature_c: 48,
  disk: {
    total_gb: 64,
    used_gb: 24,
    free_gb: 40,
  },
  uptime_s: 7200,
  gateway_uptime_s: 3600,
  log_errors: [],
};

const mockCostsData: costsExtra.CostsPayload = {
  currency: "USD",
  today: "2026-10-17",
  today_cost_usd: 0.45,
  total_cost_usd: 12.5,
  daily_cap_usd: 2.0,
  alert_pct: 80,
  alert: false,
  over_cap: false,
  days: [],
  unpriced_models: [],
  prices: {},
};

const mockUsageData = {
  days: [
    { date: "2026-10-15", total_tokens: 1500 },
    { date: "2026-10-16", total_tokens: 3000 },
    { date: "2026-10-17", total_tokens: 4500 },
  ],
  peak_day_tokens: 4500,
  total_tokens_30d: 9000,
};

const mockMemoryPages = {
  dream: { enabled: true, schedule: "0 4 * * *" },
  pages: {
    user: { text: "u", truncated: false },
    memory: { text: "m", truncated: false },
    soul: { text: "s", truncated: false },
  },
  latest: {
    time: "2026-10-17T04:00:00Z",
    subject: "Dream log",
    diff: "",
    truncated: false,
  },
};

const mockJournalData: journalEcosystem.JournalIndex = {
  enabled: true,
  hour: 3,
  model: "anthropic/claude-3-haiku",
  days: ["2026-10-16"],
};

const mockKanbanData: kanbanEcosystem.KanbanSnapshot = {
  boards: [{ id: "main", title: "Main" }],
  active_board: { id: "main", title: "Main" },
  bots: [],
  tasks: [
    { id: "1", title: "T1", status: "running" } as any,
    { id: "2", title: "T2", status: "running" } as any,
    { id: "3", title: "T3", status: "review" } as any,
    { id: "4", title: "T4", status: "blocked" } as any,
    { id: "5", title: "T5", status: "done" } as any,
  ],
  links: [],
  messages: [],
};

describe("OverviewSection (ST-A Part 4)", () => {
  let mockGet: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage("it");

    settingsStore.getState().reset();
    settingsStore.getState().setData({
      agent: {
        model: "openai/gpt-4o",
        provider: "openai",
        resolved_provider: "openai",
        model_preset: "default",
      },
      web: { enable: true },
      image_generation: { enabled: false },
      transcription: { enabled: true },
      runtime_config: {
        "agents.defaults.subagent_model_preset": "anthropic/claude-3-5-sonnet",
        "agents.defaults.dream.model_override": "deepseek/deepseek-chat",
      },
      version: { current: "0.2.1", commit: "abcdef123" },
      requires_restart: false,
    } as never);

    mockGet = jest.fn(async (path: string) => {
      if (path === "/api/settings/usage") return mockUsageData;
      if (path === "/api/ext/memory/pages") return mockMemoryPages;
      return {};
    });

    sessionStore.setState({
      profile: { id: "p1", name: "Home", baseUrl: "https://arduino.local:8765" },
      session: {
        baseUrl: "https://arduino.local:8765",
        apiToken: () => "tok",
        serverVersion: "0.2.1",
        get: mockGet,
      },
    } as never);

    jest.spyOn(systemExtra, "fetchSystem").mockResolvedValue(mockSystemData);
    jest.spyOn(costsExtra, "fetchCosts").mockResolvedValue(mockCostsData);
    jest.spyOn(journalEcosystem, "fetchJournal").mockResolvedValue(mockJournalData);
    jest.spyOn(kanbanEcosystem, "fetchKanban").mockResolvedValue(mockKanbanData);
  });

  test("renders all 7 cards with complete mocked data", async () => {
    await act(async () => {
      render(<OverviewSection />);
    });

    // 1. Stato Card
    await waitFor(() => {
      expect(screen.getByText("Online")).toBeTruthy();
      expect(screen.getByText(/42%/)).toBeTruthy(); // CPU
      expect(screen.getByText(/2.0 \/ 4.0 GB/)).toBeTruthy(); // RAM
      expect(screen.getByText(/24 \/ 64 GB/)).toBeTruthy(); // Disk
      expect(screen.getByText("48°C")).toBeTruthy(); // Temp
      expect(screen.getByText(/0.2.1/)).toBeTruthy(); // Version
    });

    // 2. Spesa Card
    expect(screen.getByText(/Oggi: \$0\.45/)).toBeTruthy();
    expect(screen.getByText(/Questo mese: \$12\.50/)).toBeTruthy();
    expect(screen.getByText(/Limite: \$2\.00/)).toBeTruthy();

    // 3. Uso Card
    expect(screen.getByText(/Totale: 9[,.]000 token/)).toBeTruthy();
    expect(screen.getByText(/Giorno di picco: 4[,.]500 token/)).toBeTruthy();
    expect(screen.getByText(/Media giornaliera: 3[,.]000 token/)).toBeTruthy();

    // 4. Modello Card
    expect(screen.getByText("openai/gpt-4o")).toBeTruthy();
    expect(screen.getByText(/Subagent: anthropic\/claude-3-5-sonnet/)).toBeTruthy();
    expect(screen.getByText(/Dream: deepseek\/deepseek-chat/)).toBeTruthy();
    expect(screen.getByText(/Journal: anthropic\/claude-3-haiku/)).toBeTruthy();

    // 5. Memoria Card
    expect(screen.getByText(/Dream: Attivo/)).toBeTruthy();
    expect(screen.getByText(/Journal: Attivo \(Ore 3:00\)/)).toBeTruthy();
    expect(screen.getByText(/Ultimo giorno: 2026-10-16/)).toBeTruthy();

    // 6. Lavagna Card
    expect(screen.getByText("2 in corso")).toBeTruthy();
    expect(screen.getByText("1 in revisione")).toBeTruthy();
    expect(screen.getByText("1 bloccate")).toBeTruthy();

    // 7. Capacità Card
    expect(screen.getByText("Web")).toBeTruthy();
    expect(screen.getByText("Generazione immagini")).toBeTruthy();
    expect(screen.getByText("Voce")).toBeTruthy();
  });

  test("tapping on usage bar shows selected day and value", async () => {
    await act(async () => {
      render(<OverviewSection />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Totale: 9[,.]000 token/)).toBeTruthy();
    });

    const barBtn = screen.getByLabelText("2026-10-16: 3000");
    await act(async () => {
      fireEvent.press(barBtn);
    });

    expect(screen.getByText(/2026-10-16: 3[,.]000 token/)).toBeTruthy();
  });

  test("links and details buttons navigate to appropriate screens", async () => {
    await act(async () => {
      render(<OverviewSection />);
    });

    await waitFor(() => {
      expect(screen.getByText("Online")).toBeTruthy();
    });

    // Details on Stato -> /settings/machine
    const detailsButtons = screen.getAllByText("Dettagli");
    expect(detailsButtons.length).toBeGreaterThanOrEqual(2);
    await fireEvent.press(detailsButtons[0]);
    expect(router.push).toHaveBeenCalledWith("/settings/machine");

    // Details on Spesa -> /settings/costs
    await fireEvent.press(detailsButtons[1]);
    expect(router.push).toHaveBeenCalledWith("/settings/costs");

    // Press model row -> /settings/models
    await fireEvent.press(screen.getByText("openai/gpt-4o"));
    expect(router.push).toHaveBeenCalledWith("/settings/models");

    // Press memory row -> /ecosystem/memory
    await fireEvent.press(screen.getByText(/Dream: Attivo/));
    expect(router.push).toHaveBeenCalledWith("/ecosystem/memory");

    // Press kanban row -> /ecosystem/kanban
    await fireEvent.press(screen.getByLabelText("Lavagna"));
    expect(router.push).toHaveBeenCalledWith("/ecosystem/kanban");

    // Press capability chip -> /settings/capabilities
    await fireEvent.press(screen.getByText("Web"));
    expect(router.push).toHaveBeenCalledWith("/settings/capabilities");
  });

  test("one failing source shows 'non disponibile' while others still render normally", async () => {
    // Costs fails
    (costsExtra.fetchCosts as jest.Mock).mockRejectedValue(new Error("network error"));

    await act(async () => {
      render(<OverviewSection />);
    });

    // Stato still renders
    await waitFor(() => {
      expect(screen.getByText("Online")).toBeTruthy();
    });

    // Spesa shows fallback
    expect(screen.getByText("non disponibile")).toBeTruthy();

    // Uso, Modello, Lavagna still render
    expect(screen.getByText(/Totale: 9[,.]000 token/)).toBeTruthy();
    expect(screen.getByText("openai/gpt-4o")).toBeTruthy();
    expect(screen.getByText("2 in corso")).toBeTruthy();
  });

  test("pull-to-refresh reloads all cards", async () => {
    await act(async () => {
      render(<OverviewSection />);
    });

    await waitFor(() => {
      expect(screen.getByText("Online")).toBeTruthy();
    });

    expect(systemExtra.fetchSystem).toHaveBeenCalledTimes(1);
    expect(costsExtra.fetchCosts).toHaveBeenCalledTimes(1);
    expect(journalEcosystem.fetchJournal).toHaveBeenCalledTimes(1);
    expect(kanbanEcosystem.fetchKanban).toHaveBeenCalledTimes(1);

    // Trigger refresh on ScrollView refreshControl
    const list = screen.getByTestId("overview-scroll");
    const { refreshControl } = list.props;
    await act(async () => {
      refreshControl.props.onRefresh();
    });

    expect(systemExtra.fetchSystem).toHaveBeenCalledTimes(2);
    expect(costsExtra.fetchCosts).toHaveBeenCalledTimes(2);
    expect(journalEcosystem.fetchJournal).toHaveBeenCalledTimes(2);
    expect(kanbanEcosystem.fetchKanban).toHaveBeenCalledTimes(2);
  });
});
