import { EFFORT_ORDER, basePresetName, derivedPresetName, sortEfforts, groupCommands, type Cmd } from "../../src/extras/logic";

const c = (command: string): Cmd => ({ command, title: command, description: "", acceptsArgs: false });

describe("effort presets", () => {
  it("exposes canonical effort order", () => {
    expect(EFFORT_ORDER).toEqual(["none", "low", "medium", "high", "xhigh", "max", "adaptive"]);
  });
  it("strips a trailing known effort level", () => {
    expect(basePresetName("gpt·high")).toBe("gpt");
    expect(basePresetName("a·b")).toBe("a·b");
    expect(basePresetName("gpt")).toBe("gpt");
  });
  it("derives gpt·max from gpt·low + max", () => {
    expect(derivedPresetName(basePresetName("gpt·low"), "max")).toBe("gpt·max");
  });
  it("keeps only known levels in canonical order, deduped", () => {
    expect(sortEfforts(["high", "bogus", "low", "high", "none"])).toEqual(["none", "low", "high"]);
  });
});

describe("groupCommands", () => {
  it("groups commands and omits empty groups", () => {
    expect(groupCommands([c("/status"), c("/dream"), c("/foo")]).map((g) => g.group)).toEqual(["session", "memory", "other"]);
  });
  it("orders session, memory, agent, other", () => {
    expect(groupCommands([c("/foo"), c("/help"), c("/dream"), c("/stop")]).map((g) => g.group)).toEqual(["session", "memory", "agent", "other"]);
  });
});
