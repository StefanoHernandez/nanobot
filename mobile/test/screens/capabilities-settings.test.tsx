import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { i18n } from "../../src/i18n";
import { sessionStore } from "../../src/state/sessionStore";
import { settingsStore } from "../../src/settings/store";
import { SettingsSection } from "../../src/screens/settings/SettingsSection";
import { NetworkSafetyCard } from "../../src/screens/settings/NetworkSafetyCard";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() }, useNavigation: () => ({ addListener: jest.fn(() => () => {}), dispatch: jest.fn() }) }));

const mutate = jest.fn();
const get = jest.fn();
const base = (o = {}) => ({
  agent: { model: "m" }, requires_restart: false, runtime_config: { "tools.web.enable": true, "agents.defaults.dream.enabled": false },
  image_generation: {
    enabled: false, provider: "openai", provider_configured: false, model: "gpt-image", default_aspect_ratio: "1:1", default_image_size: "1K",
    max_images_per_turn: 1, save_dir: "", providers: [{ name: "openai", label: "OpenAI", configured: false, models: ["gpt-image"] }],
  },
  web_search: { provider: "brave", api_key_hint: null, base_url: "", max_results: 5, timeout: 30, providers: [
    { name: "brave", label: "Brave", credential: "api_key" }, { name: "olostep", label: "Olostep", credential: "api_key" }] },
  web: { enable: true, proxy: null, user_agent: null, search: { max_results: 5, timeout: 30 }, fetch: { use_jina_reader: false } },
  advanced: { webui_allow_local_service_access: false, webui_default_access_mode: "default" },
  ...o,
});

beforeEach(async () => {
  jest.clearAllMocks();
  mutate.mockImplementation(async () => ({}));
  get.mockResolvedValue({});
  settingsStore.getState().reset();
  settingsStore.getState().setData(base() as never);
  await i18n.changeLanguage("en");
  sessionStore.setState({ profile: { id: "p1", name: "Home", baseUrl: "https://x.ts.net" }, session: { get, mutate } } as never);
});

const metrics = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (n: React.ReactNode) => render(<SafeAreaProvider initialMetrics={metrics}>{n}</SafeAreaProvider>);

test("image toggle with unconfigured provider shows hint and sends nothing", async () => {
  await wrap(<SettingsSection section="capabilities" />);
  await fireEvent(screen.getByLabelText("Enable image generation"), "valueChange", true);
  expect(screen.getAllByText("Configure provider").length).toBeGreaterThan(0);
  expect(mutate).not.toHaveBeenCalled();
});

test("web save without key or hint shows the error", async () => {
  await wrap(<SettingsSection section="capabilities" />);
  await fireEvent.press(screen.getByText("Save web"));
  expect(screen.getByText("Required")).toBeTruthy();
  expect(mutate).not.toHaveBeenCalled();
});

test("web toggle uses runtime config", async () => {
  await wrap(<SettingsSection section="capabilities" />);
  await fireEvent(screen.getByLabelText("Enable web tools"), "valueChange", false);
  expect(mutate).toHaveBeenCalledWith("settings.runtime_config.update", { values: { "tools.web.enable": false } }, undefined);
});

test("full access asks for confirmation, cancel sends nothing, confirm sends", async () => {
  await wrap(<NetworkSafetyCard />);
  await fireEvent.press(screen.getByText("Full access"));
  expect(screen.getByText("Allow full access?")).toBeTruthy();
  await fireEvent.press(screen.getByText("Cancel"));
  expect(mutate).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Full access"));
  await fireEvent.press(screen.getByText("Allow full access"));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith(
    "settings.network_safety.update", { webui_allow_local_service_access: false, webui_default_access_mode: "full" }, undefined));
});

test("olostep needs confirm then feature.enable", async () => {
  await wrap(<SettingsSection section="capabilities" />);
  await fireEvent.press(screen.getByText("Olostep"));
  await fireEvent.changeText(screen.getByLabelText("API key"), "k");
  await fireEvent.press(screen.getByText("Save web"));
  await fireEvent.press(await screen.findByText("Install"));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith("settings.feature.enable", { name: "olostep" }, 150_000));
  expect(mutate).toHaveBeenCalledWith("settings.web_search.update", expect.objectContaining({ provider: "olostep", api_key: "k" }), undefined);
});

test("dream toggle saves runtime value", async () => {
  await wrap(<SettingsSection section="capabilities" />);
  await fireEvent(screen.getByLabelText("Dream memory"), "valueChange", true);
  expect(mutate).toHaveBeenCalledWith("settings.runtime_config.update", { values: { "agents.defaults.dream.enabled": true } }, undefined);
});

const trans = (o = {}) => ({
  enabled: false, provider: "w", provider_configured: true, model: "m", language: null, max_duration_sec: 60, max_upload_mb: 25,
  providers: [{ name: "w", label: "W", configured: true }], ...o,
});

test("transcription rejects 601 s", async () => {
  settingsStore.getState().setData(base({ transcription: trans() }) as never);
  await wrap(<SettingsSection section="capabilities" />);
  await fireEvent.changeText(screen.getByLabelText("Max duration (s)"), "601");
  await fireEvent.press(screen.getByText("Save transcription"));
  expect(screen.getByText("Invalid value")).toBeTruthy();
  expect(mutate).not.toHaveBeenCalled();
});

test("transcription empty language sends empty string", async () => {
  settingsStore.getState().setData(base({ transcription: trans() }) as never);
  await wrap(<SettingsSection section="capabilities" />);
  await fireEvent.press(screen.getByText("Save transcription"));
  expect(mutate).toHaveBeenCalledWith("settings.transcription.update", expect.objectContaining({ language: "", max_duration_sec: 60 }), undefined);
});

const twoImg = (enabled: boolean) => base({
  image_generation: {
    ...base().image_generation, enabled, provider: "a", provider_configured: true,
    providers: [
      { name: "a", label: "A", configured: true, default_model: "dm", models: ["m1"] },
      { name: "b", label: "B", configured: true, models: ["bm"] },
      { name: "c", label: "C", configured: false, models: ["cm"] },
    ],
  },
});

test("image provider change resets the model", async () => {
  settingsStore.getState().setData(twoImg(false) as never);
  await wrap(<SettingsSection section="capabilities" />);
  await fireEvent.press(screen.getByText("B"));
  expect(mutate).toHaveBeenCalledWith("settings.image_generation.update", expect.objectContaining({ provider: "b", model: "bm", enabled: false }), undefined);
});

test("enabled image config does not switch to an unconfigured provider", async () => {
  settingsStore.getState().setData(twoImg(true) as never);
  await wrap(<SettingsSection section="capabilities" />);
  await fireEvent.press(screen.getByText("C"));
  expect(screen.getByText("Configure provider")).toBeTruthy();
  expect(mutate).not.toHaveBeenCalled();
});

test("clearing an optional api key sends empty string", async () => {
  settingsStore.getState().setData(base({
    web_search: { provider: "x", api_key_hint: "ab••", base_url: "", max_results: 5, timeout: 30, providers: [{ name: "x", label: "X", credential: "optional_api_key" }] },
  }) as never);
  await wrap(<SettingsSection section="capabilities" />);
  await fireEvent.press(screen.getByLabelText("Edit API key"));
  await fireEvent.press(screen.getByText("Save web"));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith("settings.web_search.update", expect.objectContaining({ provider: "x", api_key: "" }), undefined));
});

test("olostep confirm appears when the features lookup throws; nothing sent before confirm", async () => {
  get.mockRejectedValue(new Error("boom"));
  await wrap(<SettingsSection section="capabilities" />);
  await fireEvent.press(screen.getByText("Olostep"));
  await fireEvent.changeText(screen.getByLabelText("API key"), "k");
  await fireEvent.press(screen.getByText("Save web"));
  expect(await screen.findByText("Install packages?")).toBeTruthy();
  expect(mutate).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Install"));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith("settings.feature.enable", { name: "olostep" }, 150_000));
});

test("partial web save reports the failed part and refreshes", async () => {
  settingsStore.getState().setData(base({ web_search: { ...base().web_search, api_key_hint: "ab••" } }) as never);
  mutate.mockImplementation(async (a: string) => {
    if (a === "settings.runtime_config.update") throw new Error("nope");
    return {};
  });
  get.mockResolvedValue(base());
  await wrap(<SettingsSection section="capabilities" />);
  await fireEvent.changeText(screen.getByLabelText("Proxy"), "http://p");
  await fireEvent.press(screen.getByText("Save web"));
  await waitFor(() => expect(get).toHaveBeenCalledWith("/api/settings"));
  expect(mutate).toHaveBeenCalledWith("settings.web_search.update", expect.anything(), undefined);
});

test("card resyncs from data unless there are unsaved edits", async () => {
  await wrap(<SettingsSection section="capabilities" />);
  const w = (proxy: string) => base({ web: { ...base().web, proxy } }) as never;
  await act(async () => settingsStore.getState().setData(w("http://one")));
  expect(screen.getByDisplayValue("http://one")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Proxy"), "typed");
  await act(async () => settingsStore.getState().setData(w("http://two")));
  expect(screen.getByDisplayValue("typed")).toBeTruthy();
});

test("tapping Full access when already full is a no-op", async () => {
  settingsStore.getState().setData(base({ advanced: { webui_allow_local_service_access: false, webui_default_access_mode: "full" } }) as never);
  await wrap(<NetworkSafetyCard />);
  await fireEvent.press(screen.getByText("Full access"));
  expect(screen.queryByText("Allow full access?")).toBeNull();
  expect(mutate).not.toHaveBeenCalled();
});
