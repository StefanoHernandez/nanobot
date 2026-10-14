import type { RuntimeConfigValue } from "@/lib/types";

export type FieldPage = "runtime" | "advanced" | "memory" | "browser" | "network" | "image";
export type FieldKind = "toggle" | "boolean" | "text" | "nullable" | "number" | "select" | "list" | "preset";
export type RuntimeField = {
  path: string; page: FieldPage; group: string; kind: FieldKind;
  min?: number; max?: number; float?: boolean; options?: string[];
  manual?: boolean; when?: { path: string; value: string | boolean | string[] };
  enabledBy?: string; danger?: boolean; card?: "web" | "image"; disabledOnRemote?: boolean;
};

// Hand port of upstream system/runtime-config-fields.ts. Fields with `card` are rendered inside the
// web / image capability cards, so the generic System/Advanced renderer skips them (visibleFields).
const GROUPS: Record<string, { page: FieldPage; enabledBy?: string }> = {
  identity: { page: "runtime" }, memory: { page: "memory" }, chat: { page: "advanced" },
  execution: { page: "advanced" }, sessions: { page: "runtime" }, tools: { page: "runtime" },
  web: { page: "browser" }, network: { page: "network" }, storage: { page: "image" },
  shell: { page: "advanced", enabledBy: "tools.exec.enable" }, safety: { page: "advanced" },
  cli: { page: "advanced", enabledBy: "tools.cli_apps.enable" }, gateway: { page: "advanced" }, api: { page: "advanced" },
};

type Raw = Omit<RuntimeField, "page" | "enabledBy">;
const RAW: Raw[] = [
  { group: "identity", path: "agents.defaults.timezone_mode", kind: "toggle", options: ["manual", "auto"] },
  { group: "identity", path: "agents.defaults.timezone", kind: "text", when: { path: "agents.defaults.timezone_mode", value: "manual" } },
  { group: "memory", path: "agents.defaults.dream.enabled", kind: "boolean" },
  { group: "execution", path: "agents.defaults.provider_retry_mode", kind: "toggle", options: ["standard", "persistent"] },
  { group: "execution", path: "agents.defaults.max_tool_iterations", kind: "number", min: 1 },
  { group: "execution", path: "agents.defaults.max_concurrent_subagents", kind: "number", min: 1 },
  { group: "execution", path: "agents.defaults.max_tool_result_chars", kind: "number", min: 1 },
  { group: "execution", path: "agents.defaults.tool_hint_max_length", kind: "number", min: 20, max: 500 },
  { group: "execution", path: "tools.max_session_messages_per_minute", kind: "number", min: 1 },
  { group: "sessions", path: "agents.defaults.unified_session", kind: "boolean" },
  { group: "tools", path: "tools.exec.enable", kind: "boolean", danger: true },
  { group: "tools", path: "tools.file.enable", kind: "boolean" },
  { group: "web", path: "tools.web.enable", kind: "boolean", card: "web" },
  { group: "tools", path: "tools.my.enable", kind: "boolean" },
  { group: "tools", path: "tools.my.allow_set", kind: "boolean", when: { path: "tools.my.enable", value: true } },
  { group: "shell", path: "tools.exec.timeout", kind: "number", min: 0 },
  { group: "shell", path: "tools.exec.path_prepend", kind: "text" },
  { group: "shell", path: "tools.exec.path_append", kind: "text" },
  { group: "shell", path: "tools.exec.sandbox", kind: "select", options: ["", "bwrap", "seatbelt"], danger: true },
  { group: "shell", path: "tools.exec.sandbox_ro_binds", kind: "list", when: { path: "tools.exec.sandbox", value: ["bwrap", "seatbelt"] } },
  { group: "shell", path: "tools.exec.sandbox_rw_binds", kind: "list", when: { path: "tools.exec.sandbox", value: ["bwrap", "seatbelt"] } },
  { group: "shell", path: "tools.exec.allowed_env_keys", kind: "list" },
  { group: "shell", path: "tools.exec.allow_patterns", kind: "list" },
  { group: "shell", path: "tools.exec.deny_patterns", kind: "list" },
  { group: "network", path: "tools.web.proxy", kind: "nullable", card: "web" },
  { group: "network", path: "tools.web.user_agent", kind: "nullable", card: "web" },
  { group: "safety", path: "tools.restrict_to_workspace", kind: "boolean", danger: true },
  { group: "safety", path: "tools.webui_allow_remote_package_install", kind: "boolean", danger: true, disabledOnRemote: true },
  { group: "safety", path: "tools.ssrf_whitelist", kind: "list", danger: true },
  { group: "cli", path: "tools.cli_apps.install_timeout", kind: "number", min: 1, max: 3600 },
  { group: "cli", path: "tools.cli_apps.run_timeout", kind: "number", min: 1, max: 600 },
  { group: "cli", path: "tools.cli_apps.catalog_ttl_seconds", kind: "number", min: 60, max: 86400 },
  { group: "gateway", path: "gateway.host", kind: "text", manual: true },
  { group: "gateway", path: "gateway.port", kind: "number", min: 1, max: 65535, manual: true },
  { group: "gateway", path: "gateway.restart_mode", kind: "select", options: ["auto", "exec", "spawn", "exit"] },
  { group: "api", path: "api.host", kind: "text", manual: true },
  { group: "api", path: "api.timeout", kind: "number", min: 1, max: 3600, float: true },
  { group: "storage", path: "tools.image_generation.save_dir", kind: "text", card: "image" },
];

export const RUNTIME_FIELDS: RuntimeField[] = RAW.map((f) => ({
  ...f, page: GROUPS[f.group].page, ...(GROUPS[f.group].enabledBy ? { enabledBy: GROUPS[f.group].enabledBy } : {}),
}));

export type CoerceResult = { ok: true; value: RuntimeConfigValue } | { ok: false; code: "invalid_number" | "below_min" | "above_max" | "invalid_option" };

export function coerceRuntimeValue(field: RuntimeField, input: unknown): CoerceResult {
  switch (field.kind) {
    case "toggle": case "select": {
      const v = String(input ?? "");
      return field.options && !field.options.includes(v) ? { ok: false, code: "invalid_option" } : { ok: true, value: v };
    }
    case "boolean": return { ok: true, value: input === true || input === "true" };
    case "text": case "preset": {
      const v = String(input ?? "").trim();
      return { ok: true, value: field.kind === "preset" && !v ? null : v };
    }
    case "nullable": { const v = String(input ?? "").trim(); return { ok: true, value: v || null }; }
    case "list":
      return { ok: true, value: (Array.isArray(input) ? input.map(String) : String(input ?? "").split("\n")).map((s) => s.trim()).filter(Boolean) };
    case "number": {
      const s = String(input ?? "").trim();
      if (!(field.float ? /^-?\d+(\.\d+)?$/ : /^-?\d+$/).test(s)) return { ok: false, code: "invalid_number" };
      const n = Number(s);
      if (field.min !== undefined && n < field.min) return { ok: false, code: "below_min" };
      if (field.max !== undefined && n > field.max) return { ok: false, code: "above_max" };
      return { ok: true, value: n };
    }
  }
}

const matches = (want: string | boolean | string[], got: unknown) => (Array.isArray(want) ? want.includes(got as string) : want === got);

/** Fields of a page after applying `when` and the group-level `enabledBy` gate. */
export function visibleFields(
  page: FieldPage, values: Record<string, RuntimeConfigValue | undefined>, opts: { excludeCards?: boolean } = {},
): RuntimeField[] {
  const excludeCards = opts.excludeCards ?? true;
  return RUNTIME_FIELDS.filter((f) =>
    f.page === page && !(excludeCards && f.card) && (!f.enabledBy || values[f.enabledBy] === true) && (!f.when || matches(f.when.value, values[f.when.path])));
}

/** Server errors start with the offending path; the longest path wins (sandbox vs sandbox_ro_binds). */
export function fieldFromError(message: string, fields: RuntimeField[] = RUNTIME_FIELDS): RuntimeField | undefined {
  return fields.filter((f) => message.startsWith(f.path)).sort((a, b) => b.path.length - a.path.length)[0];
}

/**
 * Our addition (not upstream): changes that need a confirm dialog. Rules:
 *  - tools.exec.enable -> true
 *  - tools.restrict_to_workspace -> false
 *  - tools.ssrf_whitelist -> any change
 *  - tools.webui_allow_remote_package_install -> true (read-only on mobile, disabledOnRemote)
 *  - tools.exec.sandbox -> "" (no sandbox)
 * Plus webui_default_access_mode "full" via isDangerousAccessMode.
 */
export function isDangerous(field: Pick<RuntimeField, "path">, next: unknown): boolean {
  switch (field.path) {
    case "tools.exec.enable": case "tools.webui_allow_remote_package_install": return next === true;
    case "tools.restrict_to_workspace": return next === false;
    case "tools.ssrf_whitelist": return true;
    case "tools.exec.sandbox": return next === "";
    default: return false;
  }
}

export const isDangerousAccessMode = (mode: string) => mode === "full";
