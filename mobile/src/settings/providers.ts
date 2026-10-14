import type { ModelAPIConfig, SettingsPayload } from "@/lib/types";

export type Provider = SettingsPayload["providers"][number];

export type ProviderForm = {
  displayName: string;
  apiKey: string;
  apiBase: string;
  api: ModelAPIConfig | null;
  proxy: string;
  extraHeaders: string;
  extraBody: string;
  extraQuery: string;
  thinkingStyle: string;
  region: string;
  profile: string;
};

export const MASK = "••••••••";

const json = (v: Record<string, unknown> | null | undefined) => (v && Object.keys(v).length ? JSON.stringify(v, null, 2) : "");

export function providerFormFromRow(p: Provider): ProviderForm {
  return {
    displayName: p.is_custom ? p.label : "",
    apiKey: "",
    apiBase: p.api_base ?? p.default_api_base ?? "",
    api: p.api ?? null,
    proxy: p.proxy ?? "",
    extraHeaders: json(p.extra_headers),
    extraBody: json(p.extra_body),
    extraQuery: json(p.extra_query),
    thinkingStyle: p.thinking_style ?? "",
    region: p.region ?? "",
    profile: p.profile ?? "",
  };
}

/** Wire payload for settings.provider.update. Never log it: it may hold api_key and masked headers. */
export function providerUpdatePayload(p: Provider, f: ProviderForm): Record<string, unknown> {
  const out: Record<string, unknown> = { provider: p.name, api_base: f.apiBase.trim() };
  const key = f.apiKey.trim();
  if (key) out.api_key = key;
  if (p.is_custom) out.display_name = f.displayName.trim();
  if (p.provider_api_configurable) out.api = f.api;
  for (const field of p.advanced_fields ?? []) {
    const v = {
      proxy: f.proxy, extra_headers: f.extraHeaders, extra_body: f.extraBody, extra_query: f.extraQuery,
      thinking_style: f.thinkingStyle, region: f.region, profile: f.profile,
    }[field];
    if (v == null) continue;
    out[field] = v.trim(); // masked header/query values pass through unchanged
  }
  return out;
}

export const requiredFeature = (p: Pick<Provider, "name"> | string): "bedrock" | "azure" | null => {
  const n = typeof p === "string" ? p : p.name;
  return n === "bedrock" ? "bedrock" : n === "azure_openai" ? "azure" : null;
};

/** null when the text is a JSON object (string values only if `stringValues`); empty text is `{}`. */
export function parseJsonObject(text: string, opts: { stringValues?: boolean } = {}): Record<string, unknown> | null {
  if (!text.trim()) return {};
  try {
    const v: unknown = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    if (opts.stringValues && Object.values(v).some((x) => typeof x !== "string")) return null;
    return v as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type ProviderValidation = { ok: true } | { ok: false; field: string; code: "required" | "invalid" };

export function validateProviderForm(p: Provider, f: ProviderForm): ProviderValidation {
  if (p.auth_type !== "oauth" && !p.configured && (p.api_key_required ?? true) && !f.apiKey.trim())
    return { ok: false, field: "apiKey", code: "required" };
  if (p.is_custom && !f.displayName.trim()) return { ok: false, field: "displayName", code: "required" };
  const af = p.advanced_fields ?? [];
  if (af.includes("extra_headers") && !parseJsonObject(f.extraHeaders, { stringValues: true })) return { ok: false, field: "extraHeaders", code: "invalid" };
  if (af.includes("extra_query") && !parseJsonObject(f.extraQuery, { stringValues: true })) return { ok: false, field: "extraQuery", code: "invalid" };
  if (af.includes("extra_body") && !parseJsonObject(f.extraBody)) return { ok: false, field: "extraBody", code: "invalid" };
  return { ok: true };
}
