import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { Composer } from "../../src/screens/thread/Composer";
import { i18n } from "../../src/i18n";
import { useThreadSlice } from "../../src/state/threadStore";
import { useSession } from "../../src/state/sessionStore";
import { useChats } from "../../src/state/chatsStore";
import { loadCommands } from "../../src/extras/logic";
import { toast } from "../../src/ui/components/Toast";
import type { ChatSummary, CliAppInfo, McpPresetInfo } from "@/lib/types";
import {
  toSessionMention,
  filterMcpPresets,
  pruneMentions,
} from "../../src/screens/thread/mentions";

jest.mock("../../src/extras/logic", () => {
  const actual = jest.requireActual("../../src/extras/logic");
  return {
    ...actual,
    loadCommands: jest.fn().mockResolvedValue([]),
  };
});

jest.mock("../../src/state/threadStore", () => ({
  useThreadSlice: jest.fn(),
  threadStore: jest.requireActual("../../src/state/threadStore").threadStore,
}));
jest.mock("../../src/state/sessionStore");
jest.mock("../../src/state/chatsStore", () => {
  const actual = jest.requireActual("../../src/state/chatsStore");
  return {
    ...actual,
    useChats: jest.fn(),
  };
});

const mockUseThreadSlice = useThreadSlice as unknown as jest.Mock;
const mockUseSession = useSession as unknown as jest.Mock;
const mockUseChats = useChats as unknown as jest.Mock;

const mockSend = jest.fn();
const mockSetDraft = jest.fn();
const mockStop = jest.fn();

let currentOverrides: Record<string, any> = {};

function setupThread(overrides: Record<string, any> = {}) {
  currentOverrides = overrides;
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  jest.clearAllMocks();
  currentOverrides = {};

  mockUseThreadSlice.mockImplementation(() => {
    const [draft, setDraftState] = React.useState(currentOverrides.draft ?? "");
    return {
      draft,
      setDraft: (d: string) => {
        currentOverrides.draft = d;
        setDraftState(d);
        mockSetDraft(d);
      },
      send: mockSend,
      running: false,
      stop: mockStop,
      messages: [],
      notices: [],
      model: null,
      preset: null,
      pendingFiles: [],
      setPendingFiles: jest.fn(),
      sendError: null,
      uploading: false,
      ...currentOverrides,
    };
  });

  mockUseChats.mockImplementation((selector?: any) => {
    const list = [mockChat1, mockChat2];
    return typeof selector === "function" ? selector({ chats: list }) : list;
  });

  mockUseSession.mockReturnValue({
    session: {
      id: "s1",
      get: jest.fn().mockImplementation((path: string) => {
        if (path.includes("cli-apps")) {
          return Promise.resolve({ apps: [mockApp1] });
        }
        if (path.includes("mcp-presets")) {
          return Promise.resolve({ presets: [mockPreset1] });
        }
        return Promise.resolve({});
      }),
      client: {
        onRuntimeModelUpdate: () => () => {},
        onChat: () => () => {},
      },
    } as never,
    state: "open",
    profile: null,
  });

  mockSend.mockReturnValue(true);
  setupThread();
});

const mockChat1: ChatSummary = {
  key: "websocket:c1",
  channel: "websocket",
  chatId: "c1",
  createdAt: null,
  updatedAt: null,
  title: "Coder Chat",
  preview: "hi",
  handle: { id: "handle_123", name: "coder" },
};

const mockChat2: ChatSummary = {
  key: "websocket:c2",
  channel: "websocket",
  chatId: "c2",
  createdAt: null,
  updatedAt: null,
  title: "Other Chat",
  preview: "hi",
  handle: { id: "handle_456", name: "other" },
};

const mockApp1: CliAppInfo = {
  name: "codex",
  display_name: "CodeX CLI",
  category: "dev",
  description: "CLI helper",
  requires: "",
  source: "cli",
  entry_point: "codex",
  install_supported: true,
  installed: true,
  available: true,
  status: "installed",
  skill_installed: false,
};

const mockPreset1: McpPresetInfo = {
  name: "github",
  display_name: "GitHub MCP",
  category: "vcs",
  description: "GitHub tools",
  docs_url: "",
  transport: "stdio",
  requires: "",
  note: "",
  install_supported: true,
  installed: true,
  configured: true,
  available: true,
  status: "configured",
  connection_summary: "connected",
  required_fields: [],
};

const mount = async (chatKey = "websocket:c1") => {
  const rendered = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <Composer chatKey={chatKey} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  await act(async () => {});
  return rendered;
};

describe("pure mentions helpers", () => {
  test("toSessionMention gives an id starting with handle_, the name, the session_key and the title", () => {
    const mention = toSessionMention(mockChat1);
    expect(mention.id).toBe("handle_123");
    expect(mention.id).toMatch(/^handle_/);
    expect(mention.name).toBe("coder");
    expect(mention.session_key).toBe("websocket:c1");
    expect(mention.title).toBe("Coder Chat");
  });

  test("The MCP filter excludes source: 'agent-plugin' and includes {installed:true, configured:true} with enabled undefined", () => {
    const agentPluginPreset = {
      ...mockPreset1,
      name: "agent-plug",
      source: "agent-plugin",
      installed: true,
      configured: true,
      enabled: true,
    };
    const validPresetWithUndefinedEnabled = {
      ...mockPreset1,
      name: "valid-undef",
      source: "preset",
      installed: true,
      configured: true,
      enabled: undefined,
    };
    const notConfiguredPreset = {
      ...mockPreset1,
      name: "not-conf",
      source: "preset",
      installed: true,
      configured: false,
      enabled: undefined,
    };
    const explicitlyEnabledPreset = {
      ...mockPreset1,
      name: "exp-enabled",
      source: "preset",
      installed: false,
      configured: false,
      enabled: true,
    };

    const filtered = filterMcpPresets([
      agentPluginPreset,
      validPresetWithUndefinedEnabled,
      notConfiguredPreset,
      explicitlyEnabledPreset,
    ]);

    expect(filtered.map((p) => p.name)).toEqual(["valid-undef", "exp-enabled"]);
  });

  test("pruneMentions drops picked items whose @name token is no longer in text", () => {
    const picked = [
      { name: "coder", session_key: "websocket:c1" },
      { name: "codex", entry_point: "codex" },
    ];
    const pruned = pruneMentions("hello @coder and more", picked);
    expect(pruned).toEqual([{ name: "coder", session_key: "websocket:c1" }]);

    const prunedEmpty = pruneMentions("hello coder and codex", picked);
    expect(prunedEmpty).toEqual([]);
  });
});

describe("Composer mentions integration", () => {
  test("typing 'hey @co' shows candidates that match 'co' (chat coder, app codex) and selecting coder sets draft to 'hey @coder '", async () => {
    setupThread({ draft: "hey @co" });
    await mount();

    // Menu should be open with matches coder and codex, but not other
    expect(screen.getByText("@coder")).toBeTruthy();
    expect(screen.getByText("@codex")).toBeTruthy();
    expect(screen.queryByText("@other")).toBeNull();

    // Selecting coder updates draft
    const coderItem = screen.getByText("@coder");
    await act(async () => {
      fireEvent.press(coderItem);
    });

    expect(mockSetDraft).toHaveBeenCalledWith("hey @coder ");
  });

  test("after deleting @coder from the text, send passes no sessionMentions", async () => {
    setupThread({ draft: "hey @co" });
    await mount();

    // Select coder
    const coderItem = screen.getByText("@coder");
    await act(async () => {
      fireEvent.press(coderItem);
    });
    expect(mockSetDraft).toHaveBeenCalledWith("hey @coder ");

    // Now user changes text, deleting @coder
    const input = screen.getByPlaceholderText("Message nanobot…");
    await act(async () => {
      fireEvent.changeText(input, "hey there");
    });

    // Press Send
    const sendBtn = screen.getByLabelText("Send");
    await act(async () => {
      fireEvent.press(sendBtn);
    });

    expect(mockSend).toHaveBeenCalledWith("hey there");
  });

  test("a ninth session mention is refused with a toast", async () => {
    const spyToast = jest.spyOn(toast, "show").mockImplementation(() => {});

    // Create 10 mock chats with handles
    const tenChats: ChatSummary[] = Array.from({ length: 10 }, (_, i) => ({
      key: `websocket:c${i}`,
      channel: "websocket",
      chatId: `c${i}`,
      createdAt: null,
      updatedAt: null,
      title: `Chat ${i}`,
      preview: "p",
      handle: { id: `handle_${i}`, name: `chat${i}` },
    }));

    mockUseChats.mockImplementation((selector?: any) => {
      return typeof selector === "function" ? selector({ chats: tenChats }) : tenChats;
    });

    setupThread({ draft: "" });
    await mount();
    const input = screen.getByPlaceholderText("Message nanobot…");

    // Select 8 chats by typing @ and selecting each
    let currentText = "";
    for (let i = 0; i < 8; i++) {
      currentText = `${currentText}@chat${i}`;
      await act(async () => {
        fireEvent.changeText(input, currentText);
      });
      const item = screen.getByText(`@chat${i}`);
      await act(async () => {
        fireEvent.press(item);
      });
      currentText = `${currentText.replace(/@chat\d+$/, "")}@chat${i} `;
    }

    expect(spyToast).not.toHaveBeenCalled();

    // Attempt to select 9th chat
    currentText = `${currentText}@chat8`;
    await act(async () => {
      fireEvent.changeText(input, currentText);
    });
    const ninthItem = screen.getByText("@chat8");
    await act(async () => {
      fireEvent.press(ninthItem);
    });

    expect(spyToast).toHaveBeenCalled();
    spyToast.mockRestore();
  });

  test("send with one of each passes all three lists to send", async () => {
    setupThread({ draft: "" });
    await mount();
    const input = screen.getByPlaceholderText("Message nanobot…");

    // Type @co and select coder
    await act(async () => {
      fireEvent.changeText(input, "@co");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("@coder"));
    });

    // Type @codex and select
    await act(async () => {
      fireEvent.changeText(input, "@coder @codex");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("@codex"));
    });

    // Type @github and select
    await act(async () => {
      fireEvent.changeText(input, "@coder @codex @github");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("@github"));
    });

    // Send
    const sendBtn = screen.getByLabelText("Send");
    await act(async () => {
      fireEvent.press(sendBtn);
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.stringContaining("@coder @codex @github"),
      expect.objectContaining({
        sessionMentions: [expect.objectContaining({ name: "coder" })],
        cliApps: [expect.objectContaining({ name: "codex" })],
        mcpPresets: [expect.objectContaining({ name: "github" })],
      }),
    );
  });
});
