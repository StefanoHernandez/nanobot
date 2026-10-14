import { RUNTIME_FIELDS, coerceRuntimeValue, fieldFromError, isDangerous, isDangerousAccessMode, visibleFields } from "../../src/settings/runtimeFields";
import { imageGenPayload, networkSafetyPayload, selectImageProvider, transcriptionPayload, webSearchPayload } from "../../src/settings/capabilities";

const f = (p: string) => RUNTIME_FIELDS.find((x) => x.path === p)!;
const settings = (over: object = {}) => ({
  web_search: { provider: "brave", api_key_hint: "sk-…1", providers: [
    { name: "brave", credential: "api_key" }, { name: "tavily", credential: "api_key" },
    { name: "x", credential: "optional_api_key" }, { name: "searx", credential: "base_url" }] },
  image_generation: { request_overrides_supported: false, providers: [
    { name: "a", default_model: "dm", models: ["m1"] }, { name: "b", models: ["bm"] }] },
  ...over,
}) as never;

describe("runtime fields", () => {
  it("coerces numbers", () => {
    expect(coerceRuntimeValue(f("agents.defaults.max_tool_iterations"), "0")).toEqual({ ok: false, code: "below_min" });
    expect(coerceRuntimeValue(f("api.timeout"), "2.5")).toEqual({ ok: true, value: 2.5 });
    expect(coerceRuntimeValue(f("gateway.port"), "1.5")).toMatchObject({ ok: false });
    expect(coerceRuntimeValue(f("gateway.port"), "70000")).toEqual({ ok: false, code: "above_max" });
  });
  it("coerces list and nullable", () => {
    expect(coerceRuntimeValue(f("tools.exec.allow_patterns"), "a\n\n b ")).toEqual({ ok: true, value: ["a", "b"] });
    expect(coerceRuntimeValue({ ...f("tools.exec.path_prepend"), kind: "nullable" }, "")).toEqual({ ok: true, value: null });
  });
  it("applies when and enabledBy", () => {
    const tz = (v: Record<string, string | boolean>) => visibleFields("runtime", v).some((x) => x.path === "agents.defaults.timezone");
    expect(tz({})).toBe(false);
    expect(tz({ "agents.defaults.timezone_mode": "manual" })).toBe(true);
    const sh = (v: Record<string, string | boolean>) => visibleFields("advanced", v).some((x) => x.path === "tools.exec.timeout");
    expect(sh({})).toBe(false);
    expect(sh({ "tools.exec.enable": true })).toBe(true);
    expect(visibleFields("advanced", { "tools.exec.enable": true }).some((x) => x.path === "tools.exec.sandbox_ro_binds")).toBe(false);
    expect(visibleFields("advanced", { "tools.exec.enable": true, "tools.exec.sandbox": "bwrap" }).some((x) => x.path === "tools.exec.sandbox_ro_binds")).toBe(true);
  });
  it("rejects hex/exponent numbers; trims list arrays", () => {
    expect(coerceRuntimeValue(f("gateway.port"), "0x10")).toEqual({ ok: false, code: "invalid_number" });
    expect(coerceRuntimeValue(f("gateway.port"), "1e2")).toEqual({ ok: false, code: "invalid_number" });
    expect(coerceRuntimeValue(f("api.timeout"), "1e2")).toEqual({ ok: false, code: "invalid_number" });
    expect(coerceRuntimeValue(f("tools.ssrf_whitelist"), [" a ", "", "b"])).toEqual({ ok: true, value: ["a", "b"] });
  });
  it("has card fields, skipped by default", () => {
    for (const p of ["tools.web.enable", "tools.web.proxy", "tools.web.user_agent", "tools.image_generation.save_dir"]) expect(f(p).card).toBeDefined();
    expect(visibleFields("browser", {}).length).toBe(0);
    expect(visibleFields("browser", {}, { excludeCards: false }).map((x) => x.path)).toEqual(["tools.web.enable"]);
    expect(visibleFields("image", {}, { excludeCards: false }).map((x) => x.path)).toEqual(["tools.image_generation.save_dir"]);
  });
  it("maps errors to fields (longest path)", () => {
    expect(fieldFromError("tools.exec.timeout: must be >= 0", RUNTIME_FIELDS)?.path).toBe("tools.exec.timeout");
    expect(fieldFromError("tools.exec.sandbox_ro_binds bad")?.path).toBe("tools.exec.sandbox_ro_binds");
    expect(fieldFromError("nope")).toBeUndefined();
  });
  it("flags dangerous changes", () => {
    expect(isDangerous(f("tools.exec.enable"), true)).toBe(true);
    expect(isDangerous(f("tools.exec.enable"), false)).toBe(false);
    expect(isDangerous(f("tools.restrict_to_workspace"), false)).toBe(true);
    expect(isDangerous(f("tools.restrict_to_workspace"), true)).toBe(false);
    expect(isDangerous(f("tools.ssrf_whitelist"), ["x"])).toBe(true);
    expect(isDangerous(f("tools.webui_allow_remote_package_install"), true)).toBe(true);
    expect(isDangerous(f("tools.exec.sandbox"), "")).toBe(true);
    expect(isDangerous(f("tools.exec.sandbox"), "bwrap")).toBe(false);
    expect(isDangerousAccessMode("full")).toBe(true);
    expect(isDangerousAccessMode("default")).toBe(false);
    expect(f("tools.webui_allow_remote_package_install").disabledOnRemote).toBe(true);
  });
});

describe("capability validators", () => {
  it("web search: key required unless hint", () => {
    expect(webSearchPayload({ provider: "tavily", maxResults: 5 }, settings())).toEqual({ ok: false, code: "apiKey" });
    expect(webSearchPayload({ provider: "brave" }, settings())).toMatchObject({ ok: true });
    expect(webSearchPayload({ provider: "brave", apiKey: " k " }, settings())).toMatchObject({ ok: true, value: { api_key: "k" } });
    expect(webSearchPayload({ provider: "brave", maxResults: 11 }, settings())).toEqual({ ok: false, code: "maxResults" });
    expect(webSearchPayload({ provider: "brave", timeout: 121 }, settings())).toEqual({ ok: false, code: "timeout" });
    expect(webSearchPayload({ provider: "searx" }, settings())).toEqual({ ok: false, code: "baseUrl" });
  });
  it("optional key sends empty string when editing and cleared", () => {
    expect(webSearchPayload({ provider: "x", keyEditing: true, apiKey: "" }, settings())).toMatchObject({ ok: true, value: { api_key: "" } });
    const untouched = webSearchPayload({ provider: "x", apiKey: "" }, settings());
    expect(untouched.ok && "api_key" in untouched.value).toBe(false);
  });
  it("image: bounds and provider switch", () => {
    const base = { enabled: true, provider: "a", model: "m", defaultAspectRatio: "1:1", defaultImageSize: "1K", maxImagesPerTurn: 4 };
    expect(imageGenPayload({ ...base, maxImagesPerTurn: 0 })).toMatchObject({ ok: false });
    expect(imageGenPayload({ ...base, maxImagesPerTurn: 9 })).toMatchObject({ ok: false });
    expect(imageGenPayload(base)).toMatchObject({ ok: true });
    expect(selectImageProvider(base, settings(), "a").model).toBe("dm");
    expect(selectImageProvider(base, settings(), "b").model).toBe("bm");
  });
  it("transcription bounds", () => {
    const b = { enabled: true, provider: "p", model: "m", language: " it ", maxDurationSec: 120, maxUploadMb: 25 };
    expect(transcriptionPayload(b)).toMatchObject({ ok: true, value: { language: "it", max_duration_sec: 120, max_upload_mb: 25 } });
    expect(transcriptionPayload({ ...b, maxDurationSec: 601 })).toMatchObject({ ok: false });
    expect(transcriptionPayload({ ...b, maxUploadMb: 0 })).toMatchObject({ ok: false });
  });
  it("emits wire snake_case keys", () => {
    const keys = (r: unknown) => Object.keys((r as { value: object }).value);
    const img = imageGenPayload({ enabled: true, provider: "a", model: "m", defaultAspectRatio: "1:1", defaultImageSize: "1K", maxImagesPerTurn: 4, extraHeaders: "", extraBody: "" });
    expect(keys(img)).toEqual(expect.arrayContaining(["default_aspect_ratio", "default_image_size", "max_images_per_turn", "extra_headers", "extra_body"]));
    expect(keys(img)).not.toContain("maxImagesPerTurn");
    const web = webSearchPayload({ provider: "brave", apiKey: "k", baseUrl: "u", maxResults: 3, timeout: 9, useJinaReader: true }, settings());
    expect(keys(web).sort()).toEqual(["api_key", "base_url", "max_results", "provider", "timeout", "use_jina_reader"]);
    const tr = transcriptionPayload({ enabled: true, provider: "p", model: "m", language: "", maxDurationSec: 1, maxUploadMb: 1 });
    expect(keys(tr)).toEqual(expect.arrayContaining(["max_duration_sec", "max_upload_mb"]));
    expect(keys(tr)).not.toContain("maxUploadMb");
    expect(Object.keys(networkSafetyPayload({ webuiAllowLocalServiceAccess: true, webuiDefaultAccessMode: "full" })).sort())
      .toEqual(["webui_allow_local_service_access", "webui_default_access_mode"]);
  });
  it("network safety always sends both fields", () => {
    expect(networkSafetyPayload({ webuiAllowLocalServiceAccess: undefined, webuiDefaultAccessMode: "default" } as never))
      .toEqual({ webui_allow_local_service_access: false, webui_default_access_mode: "default" });
  });
});
