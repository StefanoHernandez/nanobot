import { loadEffortState, applyEffort, RefreshGuard, type Preset } from "../../src/extras/effort";
import { fakeSession } from "../state/fake";

const P = (name: string, extra: Partial<Preset> = {}): Preset => ({
  name, provider: "p", model: "m", max_tokens: 1, context_window_tokens: 2, temperature: 0.5,
  reasoning_effort: null, is_default: false, active: false, ...extra,
});
const state = { base: P("gpt", { reasoning_effort_values: ["low", "high"] }), current: "high", levels: ["low", "high"] };

function mk(presets: Preset[], sessions: unknown[] = []) {
  const f = fakeSession({ "/api/settings": { model_presets: presets }, "/api/sessions": { sessions } });
  const mutate = jest.fn(async () => ({}));
  (f.session as unknown as { mutate: unknown }).mutate = mutate;
  return { ...f, mutate };
}

describe("loadEffortState", () => {
  it("resolves base, current, levels", async () => {
    const { session } = mk(
      [P("gpt", { reasoning_effort_values: ["low", "high", "bogus"] }), P("gpt·high", { reasoning_effort: "high" })],
      [{ key: "websocket:abc", model_preset: "gpt·high" }],
    );
    const s = await loadEffortState(session, "websocket:abc");
    expect(s!.base.name).toBe("gpt");
    expect(s!.current).toBe("high");
    expect(s!.levels).toEqual(["low", "high"]);
  });
  it("null when session missing", async () => {
    const { session } = mk([P("gpt", { reasoning_effort_values: ["low"] })]);
    expect(await loadEffortState(session, "x")).toBeNull();
  });
});

describe("applyEffort", () => {
  it("creates missing preset, then sends /model", async () => {
    const { session, mutate, sent } = mk([P("gpt")]);
    expect(await applyEffort(session, "websocket:abc", state, "low")).toBe("gpt·low");
    expect(mutate).toHaveBeenCalledWith("settings.model_configuration.create", expect.objectContaining({ name: "gpt·low", reasoning_effort: "low" }));
    expect(sent).toEqual([expect.objectContaining({ chatId: "abc", content: "/model gpt·low" })]);
  });
  it("skips create when present", async () => {
    const { session, mutate, sent } = mk([P("gpt"), P("gpt·low")]);
    await applyEffort(session, "websocket:abc", state, "low");
    expect(mutate).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });
  it("non-writable key rejects no_chat with zero calls", async () => {
    const { session, mutate, sent, get } = mk([P("gpt")]);
    await expect(applyEffort(session, "telegram:1", state, "low")).rejects.toThrow("no_chat");
    expect(mutate).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });
  it("create failure sends no /model and surfaces the message", async () => {
    const { session, mutate, sent } = mk([P("gpt")]);
    mutate.mockRejectedValueOnce(new Error("boom"));
    await expect(applyEffort(session, "websocket:abc", state, "low")).rejects.toThrow("boom");
    expect(sent).toEqual([]);
  });
});

describe("RefreshGuard", () => {
  it("drops superseded or key-changed results", () => {
    const g = new RefreshGuard();
    const a = g.begin("A");
    expect(a("A")).toBe(true);
    expect(a("B")).toBe(false);
    const a2 = g.begin("A");
    expect(a("A")).toBe(false);
    expect(a2("A")).toBe(true);
  });
});
