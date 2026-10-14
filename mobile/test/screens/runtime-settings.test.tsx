import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { i18n } from "../../src/i18n";
import { sessionStore } from "../../src/state/sessionStore";
import { settingsStore } from "../../src/settings/store";
import { SettingsSection } from "../../src/screens/settings/SettingsSection";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() }, useNavigation: () => ({ addListener: jest.fn(() => () => {}), dispatch: jest.fn() }) }));

const mutate = jest.fn();
const get = jest.fn();
const rc = { "agents.defaults.max_tool_iterations": 40, "tools.exec.enable": true, "tools.exec.sandbox": "", "tools.ssrf_whitelist": [], "tools.restrict_to_workspace": true, "tools.file.enable": true };
const base = () => ({
  agent: { model: "m" }, requires_restart: false, runtime_config: rc, apply_state: { status: "idle", sections: [] },
  runtime: { config_path: "/home/u/config.json" },
  advanced: { webui_allow_local_service_access: false, webui_default_access_mode: "default" },
});
const metrics = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const show = (s: string) => render(<SafeAreaProvider initialMetrics={metrics}><SettingsSection section={s} /></SafeAreaProvider>);

beforeEach(async () => {
  jest.clearAllMocks();
  mutate.mockResolvedValue({});
  get.mockResolvedValue({ features: [{ name: "langfuse", display_name: "Langfuse", type: "feature", enabled: false }], enabled_count: 0 });
  settingsStore.getState().reset();
  settingsStore.getState().setData(base() as never);
  await i18n.changeLanguage("en");
  sessionStore.setState({ profile: { id: "p1", name: "Home", baseUrl: "https://x.ts.net" }, session: { get, mutate } } as never);
});

test("system page shows config path, apply state and restart row", async () => {
  await show("system");
  expect(screen.getByText("/home/u/config.json")).toBeTruthy();
  expect(screen.getByText("idle")).toBeTruthy();
  expect(screen.getByText("Restart nanobot")).toBeTruthy();
});

test("number out of range shows inline error and sends nothing", async () => {
  await show("advanced");
  await fireEvent.changeText(screen.getByLabelText("Max tool iterations"), "0");
  await fireEvent.press(screen.getByText("Save Execution"));
  expect(screen.getByText("Must be at least 1")).toBeTruthy();
  expect(mutate).not.toHaveBeenCalled();
});

test("dangerous toggle needs confirm; cancel sends nothing", async () => {
  await show("advanced");
  await fireEvent(screen.getByLabelText("Restrict to workspace"), "valueChange", false);
  expect(screen.getByText("Confirm risky change")).toBeTruthy();
  await fireEvent.press(screen.getByText("Cancel"));
  expect(mutate).not.toHaveBeenCalled();
  await fireEvent(screen.getByLabelText("Restrict to workspace"), "valueChange", false);
  await fireEvent.press(screen.getByText("Apply change"));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith("settings.runtime_config.update", { values: { "tools.restrict_to_workspace": false } }, undefined));
});

test("plain toggle saves immediately", async () => {
  await show("system");
  await fireEvent(screen.getByLabelText("File tools"), "valueChange", false);
  await waitFor(() => expect(mutate).toHaveBeenCalledWith("settings.runtime_config.update", { values: { "tools.file.enable": false } }, undefined));
});

test("server field error lands under the right row", async () => {
  mutate.mockRejectedValue(new Error("agents.defaults.max_tool_iterations: too big"));
  await show("advanced");
  await fireEvent.changeText(screen.getByLabelText("Max tool iterations"), "50");
  await fireEvent.press(screen.getByText("Save Execution"));
  expect(await screen.findByText("agents.defaults.max_tool_iterations: too big")).toBeTruthy();
});

test("list field sends trimmed lines (after confirm for ssrf)", async () => {
  await show("advanced");
  await fireEvent.changeText(screen.getByLabelText("SSRF whitelist"), " 10.0.0.1 \n\n  host.local ");
  await fireEvent.press(screen.getByText("Save Safety"));
  await fireEvent.press(screen.getByText("Apply change"));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith("settings.runtime_config.update", { values: { "tools.ssrf_whitelist": ["10.0.0.1", "host.local"] } }, undefined));
});

test("advanced page includes network safety card", async () => {
  await show("advanced");
  expect(screen.getByText("Network safety")).toBeTruthy();
});

test("feature enable asks confirm and uses long timeout", async () => {
  await show("system");
  await fireEvent.press(await screen.findByText("Enable"));
  expect(screen.getByText(/installs packages on the host/i)).toBeTruthy();
  await fireEvent.press(screen.getByText("Install and enable"));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith("settings.feature.enable", { name: "langfuse" }, 150_000));
});

test("exec enable confirm explains the specific risk", async () => {
  settingsStore.getState().setData({ ...base(), runtime_config: { ...rc, "tools.exec.enable": false } } as never);
  await show("system");
  await fireEvent(screen.getByLabelText("Shell execution"), "valueChange", true);
  expect(screen.getByText("The agent will be able to run shell commands on the host")).toBeTruthy();
});
