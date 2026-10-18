import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { toast } from "../../src/ui/components/Toast";
import { SkillsScreen } from "../../src/screens/ecosystem/skills/SkillsScreen";
import { ThreadScreen } from "../../src/screens/thread/ThreadScreen";
import { threadStore } from "../../src/state/threadStore";
import { chatsStore } from "../../src/state/chatsStore";
import { sessionStore } from "../../src/state/sessionStore";
import * as skillsModule from "../../src/ecosystem/skills";
import { fakeSession } from "../state/fake";

jest.mock("../../src/ui/components/Toast", () => ({
  toast: { show: jest.fn(), setLift: jest.fn() },
}));

const mockMutate = jest.fn();
let mockSettingsData: any = {
  runtime_config: {
    "tools.webui_allow_remote_package_install": true,
  },
};
const mockRefreshSettings = jest.fn();
jest.mock("../../src/settings/store", () => ({
  useSettings: () => ({ mutate: mockMutate, data: mockSettingsData, refresh: mockRefreshSettings }),
  useRestart: () => ({ pending: false, sections: [], state: "idle", run: jest.fn() }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ addListener: jest.fn(() => () => {}) }),
}));

let mockSessionGet: jest.Mock;
let mockSessionPost: jest.Mock;
let mockSession: any;

describe("SK-A Skill Proposals Mobile UI", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage("it");
    mockSessionGet = jest.fn(() => Promise.resolve({}));
    mockSessionPost = jest.fn(() => Promise.resolve({ ok: true }));
    const fake = fakeSession();
    mockSession = {
      ...fake.session,
      baseUrl: "https://example.com",
      get: mockSessionGet,
      post: mockSessionPost,
      apiToken: () => "token",
      capabilities: new Set<string>(),
    };
    sessionStore.setState({ session: mockSession, state: "open" });

    // Mock installed skills
    jest.spyOn(skillsModule, "useSkills").mockReturnValue({
      skills: [
        {
          name: "weather",
          description: "Meteo",
          source: "builtin",
          enabled: true,
          available: true,
        },
      ],
      loading: false,
      error: null,
      refresh: jest.fn(),
      discover: jest.fn(),
      search: jest.fn(),
      trending: jest.fn(),
      detail: jest.fn(),
      install: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as any);
  });

  const renderWithTheme = (ui: React.ReactElement) => {
    return render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{ui}</ThemeProvider>
      </SafeAreaProvider>,
    );
  };

  test("Section hidden when there are no proposals", async () => {
    mockSessionGet.mockImplementation((path: string) => {
      if (path === "/api/ext/skills/proposals") return Promise.resolve({ proposals: [] });
      if (path === "/api/ext/skills/scout") return Promise.resolve({ enabled: false });
      return Promise.resolve({});
    });

    await renderWithTheme(<SkillsScreen />);
    await waitFor(() => {
      expect(screen.queryByText(/Proposte dal bot/i)).toBeNull();
    });
  });

  test("Section visible with proposals, shows update badge, activate and reject call routes", async () => {
    const proposals = [
      {
        name: "pdf-extractor",
        summary: "Estrae tabelle da PDF",
        reason: "Richiesto spesso nei chat",
        source: "chat",
        date: "2026-10-18T20:00:00",
      },
      {
        name: "weather",
        summary: "Versione migliorata del meteo",
        reason: "Aggiornamento modello",
        source: "scout",
        date: "2026-10-18T21:00:00",
        updates: "weather",
      },
    ];

    mockSessionGet.mockImplementation((path: string) => {
      if (path === "/api/ext/skills/proposals") return Promise.resolve({ proposals });
      if (path === "/api/ext/skills/proposals/pdf-extractor") {
        return Promise.resolve({
          name: "pdf-extractor",
          summary: "Estrae tabelle da PDF",
          reason: "Richiesto spesso nei chat",
          raw_markdown: "# PDF Extractor\nIstruzioni.",
        });
      }
      if (path === "/api/ext/skills/scout") return Promise.resolve({ enabled: false });
      return Promise.resolve({});
    });
    mockSessionPost.mockImplementation((path: string) => {
      if (path === "/api/ext/skills/proposals/pdf-extractor/activate") return Promise.resolve({ ok: true });
      if (path === "/api/ext/skills/proposals/pdf-extractor/reject") return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: true });
    });

    await renderWithTheme(<SkillsScreen />);

    // Section title
    await waitFor(() => {
      expect(screen.getByText(/Proposte dal bot/i)).toBeTruthy();
    });

    // Both proposal rows
    expect(screen.getByText("pdf-extractor")).toBeTruthy();
    expect(screen.getByText("Estrae tabelle da PDF")).toBeTruthy();
    expect(screen.getByText("Richiesto spesso nei chat")).toBeTruthy();

    // Badges: Proposta and Aggiornamento
    expect(screen.getByText("Proposta")).toBeTruthy();
    expect(screen.getByText("Aggiornamento")).toBeTruthy();

    // Tap pdf-extractor to open proposal detail sheet
    await act(async () => {
      fireEvent.press(screen.getByText("pdf-extractor"));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Attiva" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Scarta" })).toBeTruthy();
    });

    // Tap Attiva
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Attiva" }));
    });

    expect(mockSessionPost).toHaveBeenCalledWith("/api/ext/skills/proposals/pdf-extractor/activate");
  });

  test("Thread menu: Crea skill da questa chat calls propose and shows toast", async () => {
    const chatKey = "websocket:test_chat_key";
    chatsStore.setState({
      chats: [{ key: chatKey, title: "Chat di prova" } as any],
    });
    threadStore.setState({
      threads: {
        [chatKey]: {
          messages: [{ role: "user", content: "fai X", timestamp: "2026-10-18T10:00:00" }],
          running: false,
          notices: [],
          draft: "",
        } as any,
      },
    });

    mockSessionPost.mockResolvedValueOnce({
      proposal: { name: "estrai-dati", summary: "Estrae dati", reason: "Chat test" },
    });

    await renderWithTheme(<ThreadScreen chatKey={chatKey} onBack={jest.fn()} />);

    // Open thread menu (dots-vertical)
    const menuBtn = screen.getByLabelText(/Altr[oe]|more/i);
    await act(async () => {
      fireEvent.press(menuBtn);
    });

    // Find "Crea skill da questa chat"
    const createSkillItem = await screen.findByText(/Crea skill da questa chat/i);
    expect(createSkillItem).toBeTruthy();

    await act(async () => {
      fireEvent.press(createSkillItem);
    });

    expect(mockSessionPost).toHaveBeenCalledWith("/api/ext/skills/propose", {
      session_key: chatKey,
    });

    await waitFor(() => {
      expect(toast.show).toHaveBeenCalledWith(
        expect.stringContaining("Proposta creata: estrai-dati"),
        expect.anything(),
      );
    });

    // Test second case: nothing to save
    mockSessionPost.mockResolvedValueOnce({
      proposal: null,
      reason: "Nessuna procedura riutilizzabile trovata",
    });

    await act(async () => {
      fireEvent.press(menuBtn);
    });
    const createSkillItem2 = await screen.findByText(/Crea skill da questa chat/i);
    await act(async () => {
      fireEvent.press(createSkillItem2);
    });

    await waitFor(() => {
      expect(toast.show).toHaveBeenCalledWith(
        expect.stringContaining("Niente da salvare come skill: Nessuna procedura riutilizzabile trovata"),
      );
    });
  });
});
