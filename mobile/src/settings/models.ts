import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelAPIConfig, ProviderModelsPayload, SettingsPayload } from "@/lib/types";
import { basePresetName } from "../extras/logic";
import { useSession } from "../state/sessionStore";

export type Preset = SettingsPayload["model_presets"][number];
export type Mutate = <T = SettingsPayload>(action: string, payload: object) => Promise<T>;

export type PresetForm = {
  name: string;
  provider: string;
  model: string;
  maxTokens: number;
  contextWindowTokens: number;
  temperature: number;
  reasoningEffort: string;
  api: ModelAPIConfig | null;
  extraHeaders: string;
  extraQuery: string;
  extraBody: string;
};

/** Port of upstream parseContextWindowTokens: `128k`, `1m`, `1.5m`, digits. */
export function parseContextWindowTokens(s: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*([km]?)$/i.exec(s.trim());
  if (!m) return null;
  const exp = { k: 3, m: 6 }[m[2].toLowerCase() as "k" | "m"] ?? 0;
  const n = Number(`${m[1]}e${exp}`);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const posInt = (n: number) => Number.isSafeInteger(n) && n > 0;

export type PresetValidation = { ok: true } | { ok: false; field: string; code: "required" | "duplicate" | "invalid" };

export function validatePreset(form: PresetForm, existingNames: string[], editingName?: string): PresetValidation {
  const name = form.name.trim();
  if (!name) return { ok: false, field: "name", code: "required" };
  const lower = name.toLowerCase();
  const own = editingName?.toLowerCase();
  if (existingNames.some((n) => n.toLowerCase() !== own && n.toLowerCase() === lower)) return { ok: false, field: "name", code: "duplicate" };
  if (!form.provider.trim()) return { ok: false, field: "provider", code: "required" };
  if (!form.model.trim()) return { ok: false, field: "model", code: "required" };
  if (!posInt(form.maxTokens)) return { ok: false, field: "maxTokens", code: "invalid" };
  if (!posInt(form.contextWindowTokens)) return { ok: false, field: "contextWindowTokens", code: "invalid" };
  if (!(form.temperature >= 0 && form.temperature <= 2)) return { ok: false, field: "temperature", code: "invalid" };
  return { ok: true };
}

const json = (v: Record<string, unknown> | null | undefined) => (v && Object.keys(v).length ? JSON.stringify(v, null, 2) : "");
const apiSel = (a?: ModelAPIConfig | null) => a?.preferred_api ?? "";

/** Wire payload (snake_case, without `name`) with only the changed fields. */
export function presetUpdateDiff(original: Preset, form: PresetForm, opts: { overrides?: boolean } = {}): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  const name = form.name.trim();
  if (name !== original.name) d.new_name = name;
  if (form.provider !== original.provider) d.provider = form.provider;
  if (form.model !== original.model) d.model = form.model;
  if (form.maxTokens !== original.max_tokens) d.max_tokens = form.maxTokens;
  if (form.contextWindowTokens !== original.context_window_tokens) d.context_window_tokens = form.contextWindowTokens;
  if (form.temperature !== original.temperature) d.temperature = form.temperature;
  if ((form.reasoningEffort || null) !== (original.reasoning_effort || null)) d.reasoning_effort = form.reasoningEffort;
  if (apiSel(form.api) !== apiSel(original.api)) d.api = form.api;
  if (opts.overrides ?? true) {
    if (form.extraHeaders !== json(original.extra_headers)) d.extra_headers = form.extraHeaders;
    if (form.extraQuery !== json(original.extra_query)) d.extra_query = form.extraQuery;
    if (form.extraBody !== json(original.extra_body)) d.extra_body = form.extraBody;
  }
  return d;
}

export const suggestPresetName = (model: string) => model.trim().split("/").filter(Boolean).pop() ?? "";

export type PresetGroup = { preset: Preset; variants: Preset[] };

/** Hides the legacy `is_default` preset; folds effort-derived `<base>·<level>` presets under an existing base. */
export function visiblePresets(p: Pick<SettingsPayload, "model_presets">): PresetGroup[] {
  const list = p.model_presets.filter((x) => !x.is_default);
  const names = new Set(list.map((x) => x.name));
  const groups = new Map<string, PresetGroup>();
  const variants: Preset[] = [];
  for (const x of list) {
    const base = basePresetName(x.name);
    if (base !== x.name && names.has(base)) variants.push(x);
    else groups.set(x.name, { preset: x, variants: [] });
  }
  for (const v of variants) groups.get(basePresetName(v.name))!.variants.push(v);
  return [...groups.values()];
}

export const callOrderOps = {
  moveUp: (o: string[], i: number) => (i <= 0 || i >= o.length ? o : swap(o, i, i - 1)),
  moveDown: (o: string[], i: number) => (i < 0 || i >= o.length - 1 ? o : swap(o, i, i + 1)),
  remove: (o: string[], i: number) => (o.length <= 1 || i < 0 || i >= o.length ? o : o.filter((_, k) => k !== i)),
  add: (o: string[], name: string) => [...o, name],
};
function swap(o: string[], a: number, b: number) {
  const n = [...o];
  [n[a], n[b]] = [n[b], n[a]];
  return n;
}

export const canSaveOrder = (prev: string[], next: string[]) =>
  next.length > 0 && (prev.length !== next.length || prev.some((v, i) => v !== next[i]));

export const canDelete = (name: string, order: string[]) => order[0] !== name;

/** Wire payload for create (extras sent only when the host supports overrides). */
export function createPayload(form: PresetForm, overrides = true): Record<string, unknown> {
  return {
    name: form.name.trim(),
    provider: form.provider.trim(),
    model: form.model.trim(),
    max_tokens: form.maxTokens,
    context_window_tokens: form.contextWindowTokens,
    temperature: form.temperature,
    reasoning_effort: form.reasoningEffort,
    ...(form.api ? { api: form.api } : {}),
    ...(overrides ? { extra_headers: form.extraHeaders, extra_query: form.extraQuery, extra_body: form.extraBody } : {}),
  };
}

/** Create the preset, then append it to the call order (upstream two-step). */
export async function createPresetAndOrder(mutate: Mutate, form: PresetForm, order: string[], overrides = true) {
  const created = await mutate<SettingsPayload>("settings.model_configuration.create", createPayload(form, overrides));
  const name = created.created_model_preset;
  if (!name) return created;
  return mutate<SettingsPayload>("settings.model_call_order.update", { order: callOrderOps.add(order, name) });
}

// ---- provider model catalogue -------------------------------------------------

/** Catalogues searched (not listed) until 2 characters are typed. */
export const DEFERRED_PROVIDERS = ["ollama", "openrouter", "lm_studio"];

const catalogCache = new Map<string, ProviderModelsPayload>();
let catalogGen = 0; // bumped on profile switch: an in-flight fetch must not repopulate the new profile's cache
export const clearCatalogCache = () => {
  catalogCache.clear();
  catalogGen++;
};

type Get = <T>(path: string) => Promise<T>;

/** Cached per provider; a failed refresh keeps the previous list. */
export async function loadProviderModels(get: Get, provider: string, refresh = false): Promise<ProviderModelsPayload> {
  const hit = catalogCache.get(provider);
  if (hit && !refresh) return hit;
  const gen = catalogGen;
  try {
    const q = `provider=${encodeURIComponent(provider)}${refresh ? "&refresh=1" : ""}`;
    const r = await get<ProviderModelsPayload>(`/api/settings/provider-models?${q}`);
    if (gen === catalogGen) catalogCache.set(provider, r);
    return r;
  } catch (e) {
    if (hit) return hit;
    throw e;
  }
}

export function useProviderModels(provider: string | null | undefined) {
  const { session } = useSession();
  const [data, setData] = useState<ProviderModelsPayload | null>(() => (provider ? catalogCache.get(provider) ?? null : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0); // bumped per request, provider switch and unmount: stale results are dropped
  useEffect(() => () => void reqId.current++, []);
  const load = useCallback(
    async (refresh: boolean) => {
      const id = ++reqId.current;
      if (!session || !provider) return setLoading(false);
      setLoading(true);
      try {
        const r = await loadProviderModels((p) => session.get(p), provider, refresh);
        if (reqId.current === id) (setData(r), setError(null));
      } catch (e) {
        if (reqId.current === id) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (reqId.current === id) setLoading(false);
      }
    },
    [session, provider],
  );
  useEffect(() => {
    setData(provider ? catalogCache.get(provider) ?? null : null);
    void load(false);
  }, [load, provider]);
  const refresh = useCallback(() => load(true), [load]);
  return { data, models: data?.models ?? [], loading, error, refresh };
}
