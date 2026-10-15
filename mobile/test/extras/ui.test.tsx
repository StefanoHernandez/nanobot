import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { toast } from "../../src/ui/components";
import { i18n } from "../../src/i18n";
import { OfflineBanner } from "../../src/extras/OfflineBanner";
import { EffortPill } from "../../src/extras/EffortPill";
import { EffortSheet } from "../../src/extras/EffortSheet";
import { CommandDrawerButton } from "../../src/extras/CommandDrawer";
import { StatusDot, STATUS_COLORS } from "../../src/extras/StatusDot";
import { StatusPanel } from "../../src/extras/StatusPanel";
import { lightTheme } from "../../src/ui/theme";
import { useSession } from "../../src/state/sessionStore";
import { useEffort, applyEffort, type EffortState } from "../../src/extras/effort";
import { loadCommands, type Cmd } from "../../src/extras/logic";
import { useThreadSlice } from "../../src/state/threadStore";

jest.mock("../../src/state/sessionStore");
jest.mock("../../src/extras/effort");
jest.mock("../../src/extras/logic", () => {
  const actual = jest.requireActual("../../src/extras/logic");
  return {
    ...actual,
    loadCommands: jest.fn(),
  };
});
jest.mock("../../src/state/threadStore");

const mockUseSession = useSession as unknown as jest.Mock;
const mockUseEffort = useEffort as unknown as jest.Mock;
const mockApplyEffort = applyEffort as unknown as jest.Mock;
const mockLoadCommands = loadCommands as unknown as jest.Mock;
const mockUseThreadSlice = useThreadSlice as unknown as jest.Mock;

const mockResume = jest.fn();
const mockSend = jest.fn();

const defaultSession = {
  session: { resume: mockResume, get: jest.fn() },
  state: "open",
  profile: { id: "p1", name: "Luffy", baseUrl: "https://luffy.ts.net", hasSecret: false },
};

const wrap = async (ui: React.ReactElement) => {
  const result = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
  return {
    ...result,
    rerender: async (newUi: React.ReactElement) =>
      await result.rerender(
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 360, height: 640 },
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
          }}
        >
          <ThemeProvider>{newUi}</ThemeProvider>
        </SafeAreaProvider>,
      ),
  };
};

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue(defaultSession);
  mockUseThreadSlice.mockReturnValue({ send: mockSend });
});


describe("EffortPill & EffortSheet", () => {
  const fakeEffortState: EffortState = {
    base: {
      name: "claude-sonnet",
      provider: "anthropic",
      model: "claude-3-7-sonnet",
      max_tokens: 4096,
      context_window_tokens: 200000,
      temperature: 1,
      reasoning_effort: "low",
      reasoning_effort_values: ["low", "medium", "high"],
      is_default: true,
      active: true,
    },
    current: "low",
    levels: ["low", "medium", "high"],
  };

  test("useEffort state null renders nothing", async () => {
    mockUseEffort.mockReturnValue({ state: null, loading: false, error: null, apply: jest.fn() });
    await wrap(<EffortPill chatKey="websocket:c1" />);
    expect(screen.queryByText(/⚡/)).toBeNull();
  });

  test("Apply error: applyEffort rejects with boom -> toast shows boom, sheet open, previous level highlighted", async () => {
    mockApplyEffort.mockRejectedValue(new Error("boom"));
    const spyToast = jest.spyOn(toast, "show").mockImplementation(() => {});
    const onClose = jest.fn();

    await wrap(
      <EffortSheet
        open
        onClose={onClose}
        chatKey="websocket:c1"
        state={fakeEffortState}
      />,
    );

    // Select "high"
    await fireEvent.press(screen.getByLabelText(/high/i));
    // Press Apply
    await fireEvent.press(screen.getByText(/apply/i));

    expect(spyToast).toHaveBeenCalledWith("boom");
    // Assert onClose is NOT called after error
    expect(onClose).not.toHaveBeenCalled();
    // Sheet is still open: Apply button still present
    expect(screen.getByText(/apply/i)).toBeTruthy();

    // Assert previously current level ("low") is still highlighted, and "high" is false
    const lowSegment = screen.getByLabelText(/low/i);
    const highSegment = screen.getByLabelText(/high/i);
    expect(lowSegment.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(highSegment.props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));

    spyToast.mockRestore();
  });

  test("Apply success: applyEffort called once with selected level, even on double tap", async () => {
    mockApplyEffort.mockResolvedValue("claude-sonnet·medium");
    const onClose = jest.fn();

    await wrap(
      <EffortSheet
        open
        onClose={onClose}
        chatKey="websocket:c1"
        state={fakeEffortState}
      />,
    );

    await fireEvent.press(screen.getByLabelText(/medium/i));
    const applyBtn = screen.getByText(/apply/i);
    await fireEvent.press(applyBtn);
    await fireEvent.press(applyBtn);

    expect(mockApplyEffort).toHaveBeenCalledTimes(1);
    expect(mockApplyEffort).toHaveBeenCalledWith(
      defaultSession.session,
      "websocket:c1",
      fakeEffortState,
      "medium",
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("CommandDrawerButton", () => {
  const fakeCommands: Cmd[] = [
    { command: "/compact", title: "Compact", description: "Summarize history", acceptsArgs: false },
    { command: "/goal", title: "Goal", description: "Set agent goal", argHint: "what to do", acceptsArgs: true },
  ];

  beforeEach(() => {
    mockLoadCommands.mockResolvedValue(fakeCommands);
  });

  test("command without args: tap /compact calls send('/compact')", async () => {
    await wrap(<CommandDrawerButton chatKey="websocket:c1" />);

    // Open drawer
    await fireEvent.press(screen.getByLabelText(/command/i));

    // Wait for commands to load and tap /compact
    const compactItem = await screen.findByText("/compact");
    await fireEvent.press(compactItem);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith("/compact");
  });

  test("command with args: tap /goal, type 'ship it', confirm -> send('/goal ship it') called once", async () => {
    await wrap(<CommandDrawerButton chatKey="websocket:c1" />);

    await fireEvent.press(screen.getByLabelText(/command/i));

    const goalItem = await screen.findByText("/goal");
    await fireEvent.press(goalItem);

    // Dialog opens with TextField
    const input = await screen.findByPlaceholderText("what to do");
    await fireEvent.changeText(input, "ship it");

    // Press OK / Confirm
    await fireEvent.press(screen.getByText(/ok/i));

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith("/goal ship it");
  });
});

describe("StatusDot", () => {
  test("dot maps open to green, reconnecting to yellow, auth_error to destructive, offline to destructive", async () => {
    // Assert literals once
    expect(STATUS_COLORS.open).toBe("#22c55e");
    expect(STATUS_COLORS.reconnecting).toBe("#eab308");

    // open -> green
    mockUseSession.mockReturnValue({ ...defaultSession, state: "open" });
    const { rerender } = await wrap(<StatusDot />);
    const dotOpen = screen.getByTestId("status-dot");
    expect(dotOpen.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: STATUS_COLORS.open })]),
    );

    // reconnecting -> yellow
    mockUseSession.mockReturnValue({ ...defaultSession, state: "reconnecting" });
    await rerender(<StatusDot />);
    const dotRecon = screen.getByTestId("status-dot");
    expect(dotRecon.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: STATUS_COLORS.reconnecting })]),
    );

    // auth_error -> destructive
    mockUseSession.mockReturnValue({ ...defaultSession, state: "auth_error" });
    await rerender(<StatusDot />);
    const dotAuth = screen.getByTestId("status-dot");
    expect(dotAuth.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: lightTheme.colors.destructive })]),
    );

    // offline -> destructive
    mockUseSession.mockReturnValue({ ...defaultSession, state: "offline" });
    await rerender(<StatusDot />);
    const dotOffline = screen.getByTestId("status-dot");
    expect(dotOffline.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: lightTheme.colors.destructive })]),
    );
  });
});

describe("StatusPanel", () => {
  test("loads settings, version-check, usage and displays them without exposing secret", async () => {
    const mockGet = jest.fn((path: string) => {
      if (path === "/api/settings") {
        return Promise.resolve({
          version: { current: "0.5.2" },
          model_presets: [{ name: "sonnet", active: true }],
        });
      }
      if (path === "/api/settings/version-check") {
        return Promise.resolve({
          updateAvailable: { currentVersion: "0.5.2", latestVersion: "0.5.3" },
        });
      }
      if (path === "/api/settings/usage") {
        return Promise.resolve({
          total_tokens: 12345,
          total_tokens_30d: 67890,
        });
      }
      return Promise.reject(new Error("not found"));
    });

    mockUseSession.mockReturnValue({
      ...defaultSession,
      session: { ...defaultSession.session, get: mockGet },
      profile: { id: "p1", name: "Luffy", baseUrl: "https://luffy.ts.net", hasSecret: true, secret: "super-secret-token" },
    });

    await wrap(<StatusPanel open onClose={jest.fn()} />);

    expect(await screen.findByText("0.5.2")).toBeTruthy();
    expect(screen.getByText("sonnet")).toBeTruthy();
    expect(screen.getByText(/0.5.3/)).toBeTruthy();
    expect(screen.getByText(/12,345/)).toBeTruthy();
    expect(screen.getByText("https://luffy.ts.net")).toBeTruthy();
    expect(screen.queryByText("super-secret-token")).toBeNull();
  });
});

describe("OfflineBanner", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("with state reconnecting, not shown at 2.9s, shown at 3s; retry calls resume; open hides it", async () => {
    mockUseSession.mockReturnValue({ ...defaultSession, state: "reconnecting" });
    const { rerender } = await wrap(<OfflineBanner />);

    await act(async () => {
      jest.advanceTimersByTime(2900);
    });
    expect(screen.queryByText(/Unreachable/)).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.getByText(/Unreachable/)).toBeTruthy();

    const retryBtn = screen.getByText(/retry/i);
    await fireEvent.press(retryBtn);
    expect(mockResume).toHaveBeenCalledTimes(1);

    mockUseSession.mockReturnValue({ ...defaultSession, state: "open" });
    await rerender(<OfflineBanner />);
    expect(screen.queryByText(/Unreachable/)).toBeNull();
  });

  test("state goes reconnecting, back to open at 2s, clock advances to 5s -> banner never appears", async () => {
    mockUseSession.mockReturnValue({ ...defaultSession, state: "reconnecting" });
    const { rerender } = await wrap(<OfflineBanner />);

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByText(/Unreachable/)).toBeNull();

    mockUseSession.mockReturnValue({ ...defaultSession, state: "open" });
    await rerender(<OfflineBanner />);

    await act(async () => {
      jest.advanceTimersByTime(3000); // reaches 5s total
    });
    expect(screen.queryByText(/Unreachable/)).toBeNull();
  });
});

describe("effort notches", () => {
  const { effortNotches } = require("../../src/extras/EffortPill");
  test("levels fill 0-3 notches", () => {
    const levels = ["none", "low", "medium", "high"];
    expect(levels.map((l: string) => effortNotches(l, levels))).toEqual([0, 1, 2, 3]);
    const six = ["none", "low", "medium", "high", "xhigh", "max"];
    expect(six.map((l: string) => effortNotches(l, six))).toEqual([0, 1, 2, 2, 3, 3]);
    expect(effortNotches("adaptive", ["low", "adaptive"])).toBe(2);
    expect(effortNotches("unknown", ["low"])).toBe(1);
  });
});
