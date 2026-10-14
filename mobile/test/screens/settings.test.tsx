import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { router } from "expo-router";
import { i18n } from "../../src/i18n";
import { lockSettings } from "../../src/extras/lock";
import { profiles } from "../../src/core/profiles";
import { sessionStore } from "../../src/state/sessionStore";
import { toast } from "../../src/ui/components";
import { SettingsScreen } from "../../src/screens/settings/SettingsScreen";
import { SettingsSection } from "../../src/screens/settings/SettingsSection";
import { prefs } from "../../src/settings/prefs";
import * as settingsStoreModule from "../../src/settings/store";
import { settingsStore } from "../../src/settings/store";

const mockRun = jest.fn();
jest.mock("../../src/settings/store", () => {
  const a = jest.requireActual("../../src/settings/store");
  return { ...a, useRestart: () => ({ pending: mockPending, sections: [], state: mockRState, run: mockRun }) };
});
let mockPending = false;
let mockRState = "idle";
jest.mock("../../src/settings/prefs", () => ({
  prefs: { language: () => "system", setLanguage: jest.fn(), notificationSound: () => false, setNotificationSound: jest.fn() },
}));

const mockSetPref = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => mockNav,
}));
const mockNav = { addListener: jest.fn(() => () => {}), dispatch: jest.fn() };
jest.mock("expo-local-authentication", () => ({ authenticateAsync: jest.fn() }));
jest.mock("../../src/extras/lock", () => ({ lockSettings: { enabled: jest.fn(() => false), setEnabled: jest.fn() } }));
jest.mock("../../src/core/profiles", () => ({ profiles: { getSecret: jest.fn() } }));
jest.mock("../../src/ui/ThemeProvider", () => ({
  ...jest.requireActual("../../src/ui/ThemeProvider"),
  useThemePreference: () => ["system", mockSetPref],
}));

const setEnabled = lockSettings.setEnabled as jest.Mock;
const auth = LocalAuthentication.authenticateAsync as jest.Mock;
const enabled = lockSettings.enabled as jest.Mock;

const show = (section = "appearance") => render(<SettingsSection section={section} />);
const mockGet = jest.fn();

beforeEach(async () => {
  jest.clearAllMocks();
  mockPending = false;
  mockRState = "idle";
  settingsStore.getState().reset();
  settingsStore.getState().setData({ agent: { model: "m" }, requires_restart: false } as never);
  enabled.mockReturnValue(false);
  await i18n.changeLanguage("en");
  sessionStore.setState({ profile: { id: "p1", name: "Home", baseUrl: "https://x.ts.net" }, session: { get: mockGet } } as never);
});

test("theme change calls setPref", async () => {
  await show();
  await fireEvent.press(screen.getByText("Dark"));
  expect(mockSetPref).toHaveBeenCalledWith("dark");
});

test("enabling lock failing shows toast and switch stays off", async () => {
  const spy = jest.spyOn(toast, "show").mockImplementation(() => {});
  setEnabled.mockResolvedValue({ ok: false, reason: "not_enrolled" });
  await show();
  await fireEvent(screen.getByLabelText("Biometric lock"), "valueChange", true);
  await waitFor(() => expect(spy).toHaveBeenCalledWith("No fingerprint or face enrolled on this device"));
  expect(screen.getByLabelText("Biometric lock").props.value).toBe(false);
});

test("disabling lock with auth failing keeps lock on", async () => {
  enabled.mockReturnValue(true);
  auth.mockResolvedValue({ success: false });
  await show();
  await fireEvent(screen.getByLabelText("Biometric lock"), "valueChange", false);
  await waitFor(() => expect(auth).toHaveBeenCalled());
  expect(setEnabled).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Biometric lock").props.value).toBe(true);
});

test("disabling lock with auth ok calls setEnabled(false) once", async () => {
  enabled.mockReturnValue(true);
  auth.mockResolvedValue({ success: true });
  setEnabled.mockResolvedValue({ ok: true });
  await show();
  await fireEvent(screen.getByLabelText("Biometric lock"), "valueChange", false);
  await waitFor(() => expect(setEnabled).toHaveBeenCalledTimes(1));
  expect(setEnabled).toHaveBeenCalledWith(false);
});

test("change server pushes /connect; secret never read", async () => {
  await show("about");
  expect(screen.getByText("Home")).toBeTruthy();
  await fireEvent.press(screen.getByText("Change server"));
  expect(router.push).toHaveBeenCalledWith("/connect");
  expect(profiles.getSecret).not.toHaveBeenCalled();
});

test("section list navigates", async () => {
  await render(<SettingsScreen />);
  await fireEvent.press(screen.getByText("Appearance"));
  expect(router.push).toHaveBeenCalledWith("/settings/appearance");
  expect(screen.getByText("Models")).toBeTruthy();
});

test("unknown section shows the placeholder", async () => {
  await show("nope");
  expect(screen.getByText("Coming soon")).toBeTruthy();
});

test("system section renders real content", async () => {
  await show("system");
  expect(screen.getByText("Restart nanobot")).toBeTruthy();
  expect(screen.queryByText("Coming soon")).toBeNull();
});

test("restart notice shows and Restart calls run", async () => {
  mockPending = true;
  await show();
  expect(screen.getByText("Saved. Restart to apply")).toBeTruthy();
  await fireEvent.press(screen.getByText("Restart"));
  expect(mockRun).toHaveBeenCalled();
});

test("language switch calls setLanguage", async () => {
  await show();
  await fireEvent.press(screen.getByText("IT"));
  expect(prefs.setLanguage).toHaveBeenCalledWith("it");
});

test("version check shows update available", async () => {
  mockGet.mockResolvedValue({ updateAvailable: { currentVersion: "1", latestVersion: "2.0" } });
  await show("about");
  await fireEvent.press(screen.getByText("Check for updates"));
  expect(await screen.findByText("Update available: v2.0")).toBeTruthy();
});

test("overview renders usage total", async () => {
  mockGet.mockResolvedValue({ days: [{ date: "d", total_tokens: 5 }], total_tokens_30d: 1234, peak_day_tokens: 5 });
  await show("overview");
  expect(await screen.findByText("Total: 1,234 tokens")).toBeTruthy();
});

test("restart notice states", async () => {
  mockRState = "restarting";
  const r = await render(<SettingsSection section="system" />);
  expect(screen.getByText("Restarting...")).toBeTruthy();
  mockRState = "timeout";
  await r.rerender(<SettingsSection section="system" />);
  expect(screen.getByText("Restart is taking too long. Check the server.")).toBeTruthy();
  expect(screen.getByText("Restart")).toBeTruthy();
  mockRState = "done";
  await r.rerender(<SettingsSection section="system" />);
  expect(screen.getByText("Restarted.")).toBeTruthy();
  expect(screen.queryByText("Restart")).toBeNull();
});

test("restart notice with pending shows Restart in any section", async () => {
  mockPending = true;
  await show("about");
  expect(screen.getByText("Restart")).toBeTruthy();
});

test("overview without usage renders and rows navigate", async () => {
  mockGet.mockRejectedValue(new Error("x"));
  await show("overview");
  await fireEvent.press(screen.getByText("Web"));
  expect(router.push).toHaveBeenCalledWith("/settings/capabilities");
  await fireEvent.press(screen.getByText("m"));
  expect(router.push).toHaveBeenCalledWith("/settings/models");
});

test("about repo link opens and MIT line present", async () => {
  const { Linking } = require("react-native");
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  await show("about");
  await fireEvent.press(screen.getByText("Repository"));
  expect(open).toHaveBeenCalledWith("https://github.com/HKUDS/nanobot");
  expect(screen.getByText(/MIT License/)).toBeTruthy();
});

describe("exit guard", () => {
  const setup = async () => {
    mockPending = true;
    await render(<SettingsScreen />);
    const h = (mockNav.addListener.mock.calls as unknown as [string, (e: unknown) => void][]).find((c) => c[0] === "beforeRemove")![1];
    const e = { preventDefault: jest.fn(), data: { action: { type: "GO_BACK" } } };
    await act(async () => h(e));
    return { h, e };
  };
  test("blocks, Leave dispatches once and then lets through", async () => {
    const { h, e } = await setup();
    expect(e.preventDefault).toHaveBeenCalled();
    expect(screen.getByText("Restart pending")).toBeTruthy();
    await fireEvent.press(screen.getByText("Leave"));
    expect(mockNav.dispatch).toHaveBeenCalledTimes(1);
    const e2 = { preventDefault: jest.fn(), data: e.data };
    await act(async () => h(e2));
    expect(e2.preventDefault).not.toHaveBeenCalled();
  });
  test("Stay closes without dispatch", async () => {
    await setup();
    await fireEvent.press(screen.getByText("Stay"));
    expect(mockNav.dispatch).not.toHaveBeenCalled();
    expect(screen.queryByText("Restart pending")).toBeNull();
  });

  test("M17: SettingsShell refreshes settings on focus", async () => {
    await render(<SettingsScreen />);
    mockGet.mockClear();
    const focusHandler = (mockNav.addListener.mock.calls as unknown as [string, () => void][]).find((c) => c[0] === "focus")?.[1];
    expect(focusHandler).toBeTruthy();
    await act(async () => {
      focusHandler!();
    });
    expect(mockGet).toHaveBeenCalledWith("/api/settings");
  });
});
