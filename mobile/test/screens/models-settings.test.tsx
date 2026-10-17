import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { i18n } from "../../src/i18n";
import { sessionStore } from "../../src/state/sessionStore";
import { settingsStore } from "../../src/settings/store";
import { clearCatalogCache } from "../../src/settings/models";
import { SettingsSection } from "../../src/screens/settings/SettingsSection";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() }, useNavigation: () => ({ addListener: jest.fn(() => () => {}), dispatch: jest.fn() }) }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));

const mutate = jest.fn();
const get = jest.fn();
const preset = (name: string, o = {}) => ({
  name, active: false, is_default: false, model: `m-${name}`, provider: "openai", max_tokens: 4096,
  context_window_tokens: 200000, temperature: 0.5, reasoning_effort: null, ...o,
});
const provider = (o = {}) => ({
  name: "openai", label: "OpenAI", configured: true, auth_type: "api_key", api_key_hint: "sk-a••••wxyz", api_base: "https://api.openai.com/v1",
  model_catalog: "unsupported", advanced_fields: [], ...o,
});
const base = (o = {}) => ({
  agent: { model: "m" }, requires_restart: false, model_call_order: ["a", "b"], model_call_order_editable: true,
  model_presets: [preset("a"), preset("b"), preset("c")], providers: [provider()], ...o,
});

beforeEach(async () => {
  jest.clearAllMocks();
  clearCatalogCache();
  mutate.mockImplementation(async () => ({}));
  get.mockImplementation(async (path: string) => {
    if (String(path).includes("/api/ext/journal")) throw new Error("missing");
    return {};
  });
  settingsStore.getState().reset();
  settingsStore.getState().setData(base() as never);
  await i18n.changeLanguage("en");
  sessionStore.setState({ profile: { id: "p1", name: "Home", baseUrl: "https://x.ts.net" }, session: { get, mutate } } as never);
});

const metrics = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const show = () => render(<SafeAreaProvider initialMetrics={metrics}><SettingsSection section="models" /></SafeAreaProvider>);

test("reorder sends the new call order", async () => {
  await show();
  await fireEvent.press(screen.getByLabelText("Move up b"));
  expect(mutate).toHaveBeenCalledWith("settings.model_call_order.update", { order: ["b", "a"] }, undefined);
});

test("remove is disabled when only one entry is left", async () => {
  settingsStore.getState().setData(base({ model_call_order: ["a"] }) as never);
  await show();
  expect(screen.getByLabelText("Remove a").props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText("Primary")).toBeTruthy();
});

test("disabled presets can be added to the order", async () => {
  await show();
  await fireEvent.press(screen.getByText("Add to order"));
  expect(mutate).toHaveBeenCalledWith("settings.model_call_order.update", { order: ["a", "b", "c"] }, undefined);
});

test("saving an edited preset sends only the diff", async () => {
  await show();
  await fireEvent.press(screen.getByText("b"));
  await fireEvent.changeText(screen.getByLabelText("Max tokens"), "8000");
  await fireEvent.press(screen.getByText("Save"));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith("settings.model_configuration.update", { name: "b", max_tokens: 8000 }, undefined));
});

test("the primary preset cannot be deleted", async () => {
  await show();
  await fireEvent.press(screen.getByText("a"));
  expect(screen.getByRole("button", { name: "Delete" }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByText("Delete"));
  expect(screen.queryByText("Delete model")).toBeNull();
});

test("a secondary preset is deleted after confirm", async () => {
  await show();
  await fireEvent.press(screen.getByText("b"));
  await fireEvent.press(screen.getByText("Delete"));
  await fireEvent.press(screen.getAllByText("Delete").at(-1)!);
  await waitFor(() => expect(mutate).toHaveBeenCalledWith("settings.model_configuration.delete", { name: "b" }, undefined));
});

test("deferred providers search only after 2 characters", async () => {
  settingsStore.getState().setData(base({ providers: [provider({ name: "ollama", label: "Ollama", model_catalog: "local" })] }) as never);
  get.mockResolvedValue({ status: "available", models: [{ id: "llama3" }, { id: "qwen" }] });
  await show();
  await fireEvent.press(screen.getByText("Add model"));
  await waitFor(() => expect(get).toHaveBeenCalled());
  await fireEvent.changeText(screen.getByLabelText("Model"), "l");
  expect(screen.queryByText("llama3")).toBeNull();
  await fireEvent.changeText(screen.getByLabelText("Model"), "ll");
  expect(screen.getByText("llama3")).toBeTruthy();
});

test("inline model suggestions cap at 8 with no more-models line", async () => {
  settingsStore.getState().setData(base({ providers: [provider({ model_catalog: "remote" })] }) as never);
  get.mockResolvedValue({ status: "available", models: Array.from({ length: 40 }, (_, i) => ({ id: `gpt-${i}` })) });
  await show();
  await fireEvent.press(screen.getByText("Add model"));
  await waitFor(() => expect(screen.getByText("gpt-0")).toBeTruthy());
  expect(screen.getByText("gpt-7")).toBeTruthy();
  expect(screen.queryByText("gpt-8")).toBeNull();
  expect(screen.queryByText(/more models/)).toBeNull();
  await fireEvent.changeText(screen.getByLabelText("Model"), "gpt-3");
  expect(screen.getByText("gpt-35")).toBeTruthy();
});

test("the model picker lists the full catalog with search", async () => {
  settingsStore.getState().setData(base({ providers: [provider({ model_catalog: "remote" })] }) as never);
  get.mockResolvedValue({ status: "available", models: Array.from({ length: 300 }, (_, i) => ({ id: `gpt-${i}` })) });
  await show();
  await fireEvent.press(screen.getByText("Add model"));
  await waitFor(() => expect(get).toHaveBeenCalled());
  await fireEvent.press(screen.getByText("Choose from list"));
  expect(screen.getByText("300 models")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Search"), "gpt-299");
  expect(screen.getByText("gpt-299")).toBeTruthy();
});

test("picker search filters by id and label and shows count of total", async () => {
  settingsStore.getState().setData(base({ providers: [provider({ model_catalog: "remote" })] }) as never);
  get.mockResolvedValue({
    status: "available",
    models: [{ id: "m1", label: "Alpha One" }, { id: "m2", label: "Beta Two" }],
  });
  await show();
  await fireEvent.press(screen.getByText("Add model"));
  await waitFor(() => expect(get).toHaveBeenCalled());
  await fireEvent.press(screen.getByText("Choose from list"));
  await fireEvent.changeText(screen.getByLabelText("Search"), "alpha");
  expect(screen.getByText("1 of 2")).toBeTruthy();
  expect(screen.getAllByText("m1").length).toBeGreaterThan(0);
});

test("deferred provider shows models in the picker without typing in the model field", async () => {
  settingsStore.getState().setData(base({ providers: [provider({ name: "openrouter", label: "OpenRouter", model_catalog: "remote" })] }) as never);
  get.mockResolvedValue({ status: "available", models: [{ id: "or-model-a" }, { id: "or-model-b" }] });
  await show();
  await fireEvent.press(screen.getByText("Add model"));
  await waitFor(() => expect(get).toHaveBeenCalled());
  expect(screen.queryByText("or-model-a")).toBeNull();
  await fireEvent.press(screen.getByText("Choose from list"));
  expect(screen.getByText("or-model-a")).toBeTruthy();
});

test("picking a model fills fields and closes the picker", async () => {
  settingsStore.getState().setData(base({ providers: [provider({ model_catalog: "remote" })] }) as never);
  get.mockResolvedValue({ status: "available", models: [{ id: "big-model", context_window: 200000 }] });
  await show();
  await fireEvent.press(screen.getByText("Add model"));
  await waitFor(() => expect(get).toHaveBeenCalled());
  await fireEvent.press(screen.getByText("Choose from list"));
  await fireEvent.press(screen.getAllByText("big-model").at(-1)!);
  expect(screen.getByLabelText("Model").props.value).toBe("big-model");
  expect(screen.getByLabelText("Context window").props.value).toBe("200000");
  expect(screen.queryByLabelText("Search")).toBeNull();
});

test("empty or failed catalog shows retry and refresh refetches", async () => {
  settingsStore.getState().setData(base({ providers: [provider({ model_catalog: "remote" })] }) as never);
  get.mockRejectedValueOnce(new Error("network"));
  await show();
  await fireEvent.press(screen.getByText("Add model"));
  await waitFor(() => expect(get).toHaveBeenCalled());
  await fireEvent.press(screen.getByText("Choose from list"));
  expect(screen.getByText("Could not load the models.")).toBeTruthy();
  get.mockResolvedValue({ status: "available", models: [{ id: "recovered" }] });
  await fireEvent.press(screen.getByText("Retry"));
  await waitFor(() => expect(get.mock.calls.some((c) => String(c[0]).includes("refresh=1"))).toBe(true));
  await waitFor(() => expect(screen.getAllByText("recovered").length).toBeGreaterThan(0));
});

test("choose from list is hidden when the provider has no catalog", async () => {
  await show();
  await fireEvent.press(screen.getByText("Add model"));
  expect(screen.queryByText("Choose from list")).toBeNull();
});

test("provider key shows the hint and save omits api_key when untouched", async () => {
  await show();
  await fireEvent.press(screen.getByText("OpenAI"));
  expect(screen.getAllByText("sk-a••••wxyz")).toHaveLength(2); // list row + read-only field
  expect(screen.queryByLabelText("API key")).toBeNull();
  await fireEvent.press(screen.getByText("Save"));
  await waitFor(() => expect(mutate).toHaveBeenCalled());
  expect(mutate.mock.calls[0][1]).not.toHaveProperty("api_key");
});

test("editing the key uses a password field and sends it", async () => {
  await show();
  await fireEvent.press(screen.getByText("OpenAI"));
  await fireEvent.press(screen.getByLabelText("Edit API key"));
  expect(screen.getByLabelText("API key").props.secureTextEntry).toBe(true);
  await fireEvent.changeText(screen.getByLabelText("API key"), "sk-new");
  await fireEvent.press(screen.getByText("Save"));
  await waitFor(() => expect(mutate.mock.calls[0][1]).toMatchObject({ api_key: "sk-new" }));
});

test("oauth device_code shows the user code", async () => {
  settingsStore.getState().setData(base({ providers: [provider({ name: "github_copilot", label: "Copilot", auth_type: "oauth", oauth_login_supported: true, api_key_hint: null })] }) as never);
  mutate.mockImplementation(async (action: string) =>
    action === "settings.provider.oauth_login"
      ? { status: "authorization_required", flow_id: "f", authorization_url: "https://auth", expires_in: 600, completion_input: "device_code", user_code: "ABCD-1234" }
      : { status: "pending" });
  await show();
  await fireEvent.press(screen.getByText("Copilot"));
  await fireEvent.press(screen.getByText("Log in"));
  await waitFor(() => expect(screen.getByText("Your code: ABCD-1234")).toBeTruthy());
  await act(async () => {});
});

const bedrock = () => settingsStore.getState().setData(base({ providers: [provider({ name: "bedrock", label: "Bedrock", api_key_hint: null, api_key_required: false, configured: true })] }) as never);

test("feature check failure fails closed: confirm shown, nothing sent until confirmed", async () => {
  bedrock();
  get.mockRejectedValue(new Error("boom"));
  await show();
  await fireEvent.press(screen.getByText("Bedrock"));
  await fireEvent.press(screen.getByText("Save"));
  await waitFor(() => expect(screen.getByText("Install packages?")).toBeTruthy());
  expect(mutate).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Install"));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
  expect(mutate.mock.calls[0]).toEqual(["settings.feature.enable", { name: "bedrock" }, 150000]);
});

test("closing the sheet during a device_code flow cancels it", async () => {
  settingsStore.getState().setData(base({ providers: [provider({ name: "github_copilot", label: "Copilot", auth_type: "oauth", oauth_login_supported: true, api_key_hint: null })] }) as never);
  mutate.mockImplementation(async (action: string) =>
    action === "settings.provider.oauth_login"
      ? { status: "authorization_required", flow_id: "f", authorization_url: "https://auth", expires_in: 600, completion_input: "device_code", user_code: "X" }
      : { status: "pending" });
  const r = await show();
  await fireEvent.press(screen.getByText("Copilot"));
  await fireEvent.press(screen.getByText("Log in"));
  await waitFor(() => expect(screen.getByText("Your code: X")).toBeTruthy());
  await r.unmount();
  expect(mutate).toHaveBeenCalledWith("settings.provider.oauth_complete", { provider: "github_copilot", flow_id: "f", cancel: true }, undefined);
});

test("provider request API selector saves api", async () => {
  settingsStore.getState().setData(base({ providers: [provider({ provider_api_configurable: true, request_apis: ["chat_completions", "responses"], api: { supported_apis: ["chat_completions", "responses"], preferred_api: "chat_completions" } })] }) as never);
  await show();
  await fireEvent.press(screen.getByText("OpenAI"));
  await fireEvent.press(screen.getAllByText("responses").at(-1)!);
  await fireEvent.press(screen.getByText("Save"));
  await waitFor(() => expect(mutate.mock.calls[0][1]).toMatchObject({ api: { supported_apis: ["chat_completions", "responses"], preferred_api: "responses" } }));
});

describe("models for tasks (fork: subagent and Dream presets)", () => {
  const withTasks = (rc: Record<string, unknown>) =>
    base({ runtime_config: { "agents.defaults.subagent_model_preset": null, "agents.defaults.dream.model_override": null, ...rc } });

  test("hidden when the server doesn't expose the fields", async () => {
    await show();
    expect(screen.queryByText("Models for tasks")).toBeNull();
  });

  test("choosing a preset for subagents sends the runtime config patch", async () => {
    settingsStore.getState().setData(withTasks({}) as never);
    await show();
    expect(screen.getAllByText(/Same as the chat/).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByText("Subagents"));
    await fireEvent.press(screen.getAllByText("c").at(-1)!); // the sheet renders last
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith("settings.runtime_config.update", { values: { "agents.defaults.subagent_model_preset": "c" } }, undefined),
    );
  });

  test("Dream can go back to the chat model (null)", async () => {
    settingsStore.getState().setData(withTasks({ "agents.defaults.dream.model_override": "b" }) as never);
    await show();
    await fireEvent.press(screen.getByText("Dream (memory)"));
    expect(screen.getByLabelText("Selected")).toBeTruthy();
    await fireEvent.press(screen.getAllByText("Same as the chat").at(-1)!);
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith("settings.runtime_config.update", { values: { "agents.defaults.dream.model_override": null } }, undefined),
    );
  });

  test("the journal row is hidden when the route is missing", async () => {
    settingsStore.getState().setData(withTasks({}) as never);
    await show();
    expect(screen.queryByText("Journal")).toBeNull();
    expect(screen.getByText("Subagents")).toBeTruthy();
  });

  test("the journal row shows the chosen preset", async () => {
    get.mockImplementation(async (path: string) => {
      if (String(path).includes("/api/ext/journal")) return { enabled: true, hour: 21, model: "b", days: [] };
      return {};
    });
    settingsStore.getState().setData(withTasks({}) as never);
    await show();
    expect(await screen.findByText("b · The model that writes the evening journal")).toBeTruthy();
  });

  test("the journal row shows the chat model when none is chosen", async () => {
    get.mockImplementation(async (path: string) => {
      if (String(path).includes("/api/ext/journal")) return { enabled: false, hour: 22, model: null, days: [] };
      return {};
    });
    settingsStore.getState().setData(withTasks({}) as never);
    await show();
    expect(await screen.findByText("Same as the chat · The model that writes the evening journal")).toBeTruthy();
  });

  test("picking a journal preset keeps enabled and hour", async () => {
    get.mockImplementation(async (path: string) => {
      if (String(path).includes("/api/ext/journal")) return { enabled: true, hour: 21, model: null, days: ["2026-10-16"] };
      return {};
    });
    sessionStore.setState({
      profile: { id: "p1", name: "Home", baseUrl: "https://x.ts.net" },
      session: { get, mutate, baseUrl: "https://x.ts.net", apiToken: () => "tok" },
    } as never);
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ enabled: true, hour: 21, model: "c" }),
    }));
    const previous = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    settingsStore.getState().setData(withTasks({}) as never);
    try {
      await show();
      await fireEvent.press(await screen.findByText("Journal"));
      await fireEvent.press(screen.getAllByText("c").at(-1)!);
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const call = fetchMock.mock.calls[0] as unknown as [string, { body?: string }];
      expect(String(call[0])).toContain("/api/ext/journal/settings");
      expect(JSON.parse(String(call[1].body))).toEqual({ enabled: true, hour: 21, model: "c" });
    } finally {
      global.fetch = previous;
    }
  });
});
