import "../../src/platform/install";
import { act, renderHook } from "@testing-library/react-native";
import {
  callOrderOps, canDelete, canSaveOrder, clearCatalogCache, createPresetAndOrder, loadProviderModels,
  parseContextWindowTokens, presetUpdateDiff, suggestPresetName, validatePreset, visiblePresets, type PresetForm,
} from "../../src/settings/models";
import { parseJsonObject, providerUpdatePayload, requiredFeature, validateProviderForm } from "../../src/settings/providers";
import { useOAuthFlow } from "../../src/settings/oauth";
import { useProviderModels } from "../../src/settings/models";

let mockSession: { get: jest.Mock } | null = null;
jest.mock("../../src/state/sessionStore", () => ({ useSession: () => ({ session: mockSession }) }));

const mockMutate = jest.fn();
jest.mock("../../src/settings/store", () => ({ useSettings: () => ({ mutate: mockMutate }) }));
jest.mock("expo-notifications", () => ({}));

const form: PresetForm = {
  name: "gpt", provider: "openai", model: "openai/gpt-5", maxTokens: 4096, contextWindowTokens: 200000,
  temperature: 0.5, reasoningEffort: "", api: null, extraHeaders: "", extraQuery: "", extraBody: "",
};
const preset = (o = {}) => ({
  name: "gpt", active: true, is_default: false, model: "openai/gpt-5", provider: "openai", max_tokens: 4096,
  context_window_tokens: 200000, temperature: 0.5, reasoning_effort: "low", ...o,
}) as never;

beforeEach(() => { mockMutate.mockReset(); clearCatalogCache(); jest.useRealTimers(); });

test("context window parsing", () => {
  expect(parseContextWindowTokens("128k")).toBe(128000);
  expect(parseContextWindowTokens("1m")).toBe(1000000);
  expect(parseContextWindowTokens("4096")).toBe(4096);
  expect(parseContextWindowTokens("abc")).toBeNull();
});

test("preset validation", () => {
  expect(validatePreset({ ...form, name: "new" }, ["gpt"])).toEqual({ ok: true });
  expect(validatePreset({ ...form, temperature: 2.1 }, [])).toEqual({ ok: false, field: "temperature", code: "invalid" });
  expect(validatePreset({ ...form, name: "GPT" }, ["gpt"])).toEqual({ ok: false, field: "name", code: "duplicate" });
});

test("diff sends only changed fields; cleared effort is empty string", () => {
  expect(presetUpdateDiff(preset(), { ...form, reasoningEffort: "low", maxTokens: 8000 })).toEqual({ max_tokens: 8000 });
  expect(presetUpdateDiff(preset(), form)).toEqual({ reasoning_effort: "" });
  expect(suggestPresetName("openrouter/anthropic/claude")).toBe("claude");
});

test("call order rules", () => {
  expect(callOrderOps.remove(["a"], 0)).toEqual(["a"]);
  expect(callOrderOps.remove(["a", "b"], 0)).toEqual(["b"]);
  expect(callOrderOps.moveDown(["a", "b"], 0)).toEqual(["b", "a"]);
  expect(callOrderOps.moveUp(["a", "b"], 0)).toEqual(["a", "b"]);
  expect(canDelete("a", ["a", "b"])).toBe(false);
  expect(canDelete("b", ["a", "b"])).toBe(true);
  expect(canSaveOrder(["a", "b"], ["a", "b"])).toBe(false);
  expect(canSaveOrder(["a"], [])).toBe(false);
  expect(canSaveOrder(["a", "b"], ["b", "a"])).toBe(true);
});

test("visiblePresets hides default and groups effort variants", () => {
  const g = visiblePresets({ model_presets: [preset({ name: "default", is_default: true }), preset(), preset({ name: "gpt·low" }), preset({ name: "gpt·max" }), preset({ name: "other" })] });
  expect(g.map((x) => x.preset.name)).toEqual(["gpt", "other"]);
  expect(g[0].variants.map((v) => v.name)).toEqual(["gpt·low", "gpt·max"]);
});

test("createPresetAndOrder appends created preset", async () => {
  mockMutate.mockResolvedValueOnce({ created_model_preset: "gpt" }).mockResolvedValueOnce({ ok: 1 });
  await createPresetAndOrder(mockMutate, form, ["a"]);
  expect(mockMutate.mock.calls[1]).toEqual(["settings.model_call_order.update", { order: ["a", "gpt"] }]);
});

test("provider payload omits empty api_key and keeps masks", () => {
  const p = { name: "x", label: "X", configured: true, advanced_fields: ["extra_headers", "proxy"] } as never;
  const f = { displayName: "", apiKey: "", apiBase: "http://b", api: null, proxy: "", extraHeaders: '{"a":"••••••••"}' } as never;
  const out = providerUpdatePayload(p, f);
  expect(out).toEqual({ provider: "x", api_base: "http://b", extra_headers: '{"a":"••••••••"}', proxy: "" });
  expect(providerUpdatePayload(p, { ...(f as object), apiKey: " k " } as never).api_key).toBe("k");
});

test("provider features, validation, json", () => {
  expect(requiredFeature("azure_openai")).toBe("azure");
  expect(requiredFeature("bedrock")).toBe("bedrock");
  expect(requiredFeature("openai")).toBeNull();
  expect(parseJsonObject('{"a":1}', { stringValues: true })).toBeNull();
  expect(parseJsonObject("[]")).toBeNull();
  const p = { name: "x", label: "X", configured: false } as never;
  expect(validateProviderForm(p, { apiKey: "" } as never)).toMatchObject({ ok: false, field: "apiKey" });
});

test("catalogue refresh failure keeps previous models", async () => {
  const get = jest.fn().mockResolvedValueOnce({ provider: "p", models: [{ id: "m" }] }).mockRejectedValueOnce(new Error("x"));
  await loadProviderModels(get, "p");
  const r = await loadProviderModels(get, "p", true);
  expect(r.models).toEqual([{ id: "m" }]);
  expect(get.mock.calls[1][0]).toContain("refresh=1");
});

describe("oauth", () => {
  const auth = { status: "authorization_required", provider: "p", flow_id: "f", authorization_url: "http://a", expires_in: 60 };
  test("code flow: awaiting -> polling -> done", async () => {
    jest.useFakeTimers();
    mockMutate.mockResolvedValueOnce({ ...auth, completion_input: "authorization_code" })
      .mockResolvedValueOnce({ status: "pending" }).mockResolvedValueOnce({ status: "pending" }).mockResolvedValueOnce({ agent: {} });
    const { result } = await renderHook(() => useOAuthFlow("p"));
    await act(async () => void (await result.current.start()));
    expect(result.current.state).toBe("awaiting_user");
    expect(mockMutate.mock.calls[0]).toEqual(["settings.provider.oauth_login", { provider: "p", remote_browser: true }]);
    await act(async () => void result.current.submit("code"));
    expect(result.current.state).toBe("polling");
    await act(async () => void (await jest.advanceTimersByTimeAsync(1000)));
    await act(async () => void (await jest.advanceTimersByTimeAsync(1000)));
    expect(result.current.state).toBe("done");
    expect(mockMutate.mock.calls[1][1]).toMatchObject({ authorization_response: "code" });
  });
  test("cancel on device_code sends cancel", async () => {
    mockMutate.mockResolvedValueOnce({ ...auth, completion_input: "device_code", user_code: "U" }).mockReturnValue(new Promise(() => {}));
    const { result } = await renderHook(() => useOAuthFlow("p"));
    await act(async () => void (await result.current.start()));
    expect(result.current.userCode).toBe("U");
    mockMutate.mockResolvedValue({});
    await act(async () => void (await result.current.cancel()));
    expect(mockMutate).toHaveBeenLastCalledWith("settings.provider.oauth_complete", { provider: "p", flow_id: "f", cancel: true });
    expect(result.current.state).toBe("idle");
  });
});

test("validatePreset: editing own name is valid, other duplicates are not", () => {
  expect(validatePreset(form, ["gpt", "x"], "GPT")).toEqual({ ok: true });
  expect(validatePreset({ ...form, name: "x" }, ["gpt", "x"], "gpt")).toMatchObject({ code: "duplicate" });
});

test("diff: rename only, clear effort, overrides gating", () => {
  expect(presetUpdateDiff(preset({ reasoning_effort: null }), { ...form, name: "new" })).toEqual({ new_name: "new" });
  expect(presetUpdateDiff(preset(), { ...form, reasoningEffort: "" })).toEqual({ reasoning_effort: "" });
  const f = { ...form, reasoningEffort: "low", extraBody: '{"a":1}' };
  expect(presetUpdateDiff(preset(), f)).toEqual({ extra_body: '{"a":1}' });
  expect(presetUpdateDiff(preset(), f, { overrides: false })).toEqual({});
});

test("provider payload skips unknown advanced fields", () => {
  const p = { name: "x", label: "X", configured: true, advanced_fields: ["bogus"] } as never;
  expect(providerUpdatePayload(p, { apiBase: "", apiKey: "" } as never)).toEqual({ provider: "x", api_base: "" });
});

test("useProviderModels drops a stale slow result after a provider switch", async () => {
  let resolveA!: (v: unknown) => void;
  mockSession = {
    get: jest.fn((path: string) =>
      path.includes("provider=A") ? new Promise((r) => (resolveA = r)) : Promise.resolve({ provider: "B", models: [{ id: "b" }] }),
    ),
  };
  const { result, rerender } = await renderHook(({ p }: { p: string }) => useProviderModels(p), { initialProps: { p: "A" } });
  await rerender({ p: "B" });
  await act(async () => {});
  expect(result.current.models).toEqual([{ id: "b" }]);
  await act(async () => resolveA({ provider: "A", models: [{ id: "a" }] }));
  expect(result.current.models).toEqual([{ id: "b" }]);
});

describe("oauth extras", () => {
  const auth = (o = {}) => ({ status: "authorization_required", provider: "p", flow_id: "f", authorization_url: "http://a", expires_in: 3, completion_input: "authorization_code", ...o });
  test("expiry stops polling with code expired", async () => {
    jest.useFakeTimers();
    mockMutate.mockResolvedValueOnce(auth()).mockResolvedValue({ status: "pending" });
    const { result } = await renderHook(() => useOAuthFlow("p"));
    await act(async () => void (await result.current.start()));
    await act(async () => void result.current.submit("c"));
    await act(async () => void (await jest.advanceTimersByTimeAsync(5000)));
    expect(result.current.state).toBe("error");
    expect(result.current.errorCode).toBe("expired");
    const n = mockMutate.mock.calls.length;
    await act(async () => void (await jest.advanceTimersByTimeAsync(5000)));
    expect(mockMutate.mock.calls.length).toBe(n);
  });
  test("response only on first poll; poll error -> error", async () => {
    jest.useFakeTimers();
    mockMutate.mockResolvedValueOnce(auth({ expires_in: 600 })).mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "pending" }).mockRejectedValueOnce(new Error("boom"));
    const { result } = await renderHook(() => useOAuthFlow("p"));
    await act(async () => void (await result.current.start()));
    await act(async () => void result.current.submit("c"));
    await act(async () => void (await jest.advanceTimersByTimeAsync(2000)));
    expect(mockMutate.mock.calls[1][1]).toHaveProperty("authorization_response", "c");
    expect(mockMutate.mock.calls[2][1]).not.toHaveProperty("authorization_response");
    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe("boom");
  });
  test("unmount stops polling", async () => {
    jest.useFakeTimers();
    mockMutate.mockResolvedValueOnce(auth({ expires_in: 600 })).mockResolvedValue({ status: "pending" });
    const { result, unmount } = await renderHook(() => useOAuthFlow("p"));
    await act(async () => void (await result.current.start()));
    await act(async () => void result.current.submit("c"));
    await unmount();
    const n = mockMutate.mock.calls.length;
    await act(async () => void (await jest.advanceTimersByTimeAsync(5000)));
    expect(mockMutate.mock.calls.length).toBe(n);
  });
  test("device_code auto-polls after start", async () => {
    mockMutate.mockResolvedValueOnce(auth({ completion_input: "device_code", user_code: "U", expires_in: 600 })).mockResolvedValue({ agent: {} });
    const { result } = await renderHook(() => useOAuthFlow("p"));
    await act(async () => void (await result.current.start()));
    expect(mockMutate.mock.calls[1][0]).toBe("settings.provider.oauth_complete");
    expect(result.current.state).toBe("done");
  });
});
