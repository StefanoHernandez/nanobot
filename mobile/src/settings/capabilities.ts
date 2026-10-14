import type {
  ImageGenerationSettingsUpdate, NetworkSafetySettingsUpdate, SettingsPayload,
  TranscriptionSettingsUpdate, WebSearchSettingsUpdate,
} from "@/lib/types";

export const ASPECT_RATIOS = ["1:1", "3:4", "9:16", "4:3", "16:9", "3:2", "2:3", "21:9"];
export const IMAGE_SIZES = ["1K", "2K", "4K", "1024x1024", "1536x1024", "1024x1536"];

/** Builders return wire (snake_case) payloads: store.ts sends them as-is via session.mutate. Never log them (api_key). */
export type Checked<T> = { ok: true; value: T } | { ok: false; code: string };
type Wire = Record<string, unknown>;

const intIn = (n: unknown, min: number, max: number) => typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

export function imageGenPayload(form: ImageGenerationSettingsUpdate): Checked<Wire> {
  if (!intIn(form.maxImagesPerTurn, 1, 8)) return { ok: false, code: "maxImagesPerTurn" };
  return {
    ok: true,
    value: {
      enabled: form.enabled, provider: form.provider, model: form.model,
      default_aspect_ratio: form.defaultAspectRatio, default_image_size: form.defaultImageSize,
      max_images_per_turn: form.maxImagesPerTurn,
      ...(form.extraHeaders !== undefined ? { extra_headers: form.extraHeaders } : {}),
      ...(form.extraBody !== undefined ? { extra_body: form.extraBody } : {}),
    },
  };
}

/** Changing provider resets the model to default_model ?? models[0] (and clears request overrides). Form stays camelCase. */
export function selectImageProvider(
  form: ImageGenerationSettingsUpdate, settings: SettingsPayload, provider: string,
): ImageGenerationSettingsUpdate {
  const row = settings.image_generation.providers.find((p) => p.name === provider);
  return {
    ...form, provider, model: row?.default_model || row?.models?.[0] || form.model,
    ...(settings.image_generation.request_overrides_supported && provider !== form.provider ? { extraHeaders: "", extraBody: "" } : {}),
  };
}

export type WebSearchForm = WebSearchSettingsUpdate & { keyEditing?: boolean };

export function webSearchPayload(form: WebSearchForm, current: SettingsPayload): Checked<Wire> {
  const provider = current.web_search.providers.find((p) => p.name === form.provider);
  const credential = provider?.credential;
  const apiKey = form.apiKey?.trim() ?? "";
  const baseUrl = form.baseUrl?.trim() ?? "";
  const hasSecret = form.provider === current.web_search.provider && !!current.web_search.api_key_hint;
  if (form.maxResults !== undefined && !intIn(form.maxResults, 1, 10)) return { ok: false, code: "maxResults" };
  if (form.timeout !== undefined && !intIn(form.timeout, 1, 120)) return { ok: false, code: "timeout" };
  if (credential === "api_key" && !apiKey && !hasSecret) return { ok: false, code: "apiKey" };
  if (credential === "base_url" && !baseUrl) return { ok: false, code: "baseUrl" };
  const out: Wire = { provider: form.provider };
  // optional key: editing then clearing sends "" to remove it; untouched sends nothing (keeps stored key)
  if (credential === "api_key" || credential === "optional_api_key") {
    if (apiKey) out.api_key = apiKey;
    else if (credential === "optional_api_key" && form.keyEditing) out.api_key = "";
  }
  if (form.baseUrl !== undefined) out.base_url = form.baseUrl;
  if (form.maxResults !== undefined) out.max_results = form.maxResults;
  if (form.timeout !== undefined) out.timeout = form.timeout;
  if (form.useJinaReader !== undefined) out.use_jina_reader = form.useJinaReader;
  return { ok: true, value: out };
}

export function transcriptionPayload(form: TranscriptionSettingsUpdate): Checked<Wire> {
  if (!intIn(form.maxDurationSec, 1, 600)) return { ok: false, code: "maxDurationSec" };
  if (!intIn(form.maxUploadMb, 1, 100)) return { ok: false, code: "maxUploadMb" };
  return {
    ok: true,
    value: {
      enabled: form.enabled, provider: form.provider, model: form.model, language: form.language.trim(),
      max_duration_sec: form.maxDurationSec, max_upload_mb: form.maxUploadMb,
    },
  };
}

/** Both fields are always sent. */
export function networkSafetyPayload(form: NetworkSafetySettingsUpdate): Wire {
  return {
    webui_allow_local_service_access: !!form.webuiAllowLocalServiceAccess,
    webui_default_access_mode: form.webuiDefaultAccessMode === "full" ? "full" : "default",
  };
}
