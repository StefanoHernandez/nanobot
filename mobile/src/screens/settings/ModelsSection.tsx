import React, { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, ScrollView, Text, View } from "react-native";
import type { ModelRequestAPI } from "@/lib/types";
import { useT } from "../../i18n";
import {
  callOrderOps, canDelete, DEFERRED_PROVIDERS, canSaveOrder, createPresetAndOrder, parseContextWindowTokens, presetUpdateDiff, suggestPresetName,
  useProviderModels, validatePreset, visiblePresets, type Preset, type PresetForm,
} from "../../settings/models";
import { parseJsonObject } from "../../settings/providers";
import { SettingsError, useSettings } from "../../settings/store";
import { useSession } from "../../state/sessionStore";
import { Button, Dialog, IconButton, ListItem, Sheet, TextField, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { Chips, Head } from "./common";
import { ProvidersPanel } from "./ProvidersPanel";

const jsonText = (v: Record<string, unknown> | null | undefined) => (v && Object.keys(v).length ? JSON.stringify(v, null, 2) : "");
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ModelsSection() {
  const t = useT();
  const th = useTheme();
  const { data, mutate } = useSettings();
  const [editing, setEditing] = useState<Preset | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => (data ? visiblePresets(data) : []), [data]);
  if (!data) return null;
  const order = data.model_call_order;
  const editable = data.model_call_order_editable !== false;
  const byName = new Map(data.model_presets.map((p) => [p.name, p]));
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.show(msgOf(e));
    } finally {
      setBusy(false);
    }
  };
  const setOrder = (next: string[]) => {
    if (canSaveOrder(order, next)) void run(() => mutate("settings.model_call_order.update", { order: next }));
  };
  const disabled = groups.filter((g) => !order.includes(g.preset.name));

  return (
    <>
      <Head>{t("models.title")}</Head>
      {order.map((name, i) => (
        <ListItem
          key={`${name}-${i}`}
          title={name}
          subtitle={byName.get(name)?.model}
          left={i === 0 ? <Text style={{ backgroundColor: th.colors.primary, color: th.colors.primaryForeground, fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: th.radius.md, overflow: "hidden" }}>{t("models.primary")}</Text> : undefined}
          onPress={byName.get(name) ? () => setEditing(byName.get(name)!) : undefined}
          right={
            editable ? (
              <View style={{ flexDirection: "row" }}>
                <IconButton icon="chevron-up" accessibilityLabel={t("models.moveUp", { name })} disabled={busy || i === 0} onPress={() => setOrder(callOrderOps.moveUp(order, i))} />
                <IconButton icon="chevron-down" accessibilityLabel={t("models.moveDown", { name })} disabled={busy || i === order.length - 1} onPress={() => setOrder(callOrderOps.moveDown(order, i))} />
                <IconButton icon="close" accessibilityLabel={t("models.remove", { name })} disabled={busy || order.length <= 1} onPress={() => setOrder(callOrderOps.remove(order, i))} />
              </View>
            ) : undefined
          }
        />
      ))}
      {disabled.length > 0 && editable ? <Head>{t("models.disabled")}</Head> : null}
      {editable &&
        disabled.map((g) => (
          <ListItem
            key={g.preset.name}
            title={g.preset.name}
            subtitle={[g.preset.model, g.variants.length ? t("models.variants", { n: g.variants.length }) : null].filter(Boolean).join(" · ")}
            onPress={() => setEditing(g.preset)}
            right={<Button title={t("models.addToOrder")} variant="secondary" disabled={busy} onPress={() => setOrder(callOrderOps.add(order, g.preset.name))} />}
          />
        ))}
      <View style={{ padding: 16, gap: 8 }}>
        <Button title={t("models.addPreset")} variant="secondary" onPress={() => setEditing("new")} />
        {data.model_configuration_migratable ? (
          <Button title={t("models.migrate")} variant="secondary" loading={busy} onPress={() => void run(() => mutate("settings.model_configuration.migrate", {}))} />
        ) : null}
      </View>
      {editing ? <PresetEditor key={editing === "new" ? "new" : editing.name} preset={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      <ProvidersPanel />
    </>
  );
}

type Errors = Partial<Record<keyof PresetForm, string>>;

function PresetEditor({ preset, onClose }: { preset: Preset | null; onClose: () => void }) {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();
  const { data, mutate } = useSettings();
  const d = data!;
  const overrides = !!d.model_request_overrides_supported;
  const configured = d.providers.filter((p) => p.configured);
  const [name, setName] = useState(preset?.name ?? "");
  const [nameTouched, setNameTouched] = useState(!!preset);
  const [provider, setProvider] = useState(preset?.provider ?? configured[0]?.name ?? "");
  const [model, setModel] = useState(preset?.model ?? "");
  const [effort, setEffort] = useState(preset?.reasoning_effort ?? "");
  const [ctx, setCtx] = useState(String(preset?.context_window_tokens ?? 200000));
  const [maxTokens, setMaxTokens] = useState(String(preset?.max_tokens ?? 8192));
  const [temp, setTemp] = useState(String(preset?.temperature ?? 0.1));
  const [apiPref, setApiPref] = useState<string>(preset?.api?.preferred_api ?? "");
  const [headers, setHeaders] = useState(jsonText(preset?.extra_headers));
  const [query, setQuery] = useState(jsonText(preset?.extra_query));
  const [body, setBody] = useState(jsonText(preset?.extra_body));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [autoApi, setAutoApi] = useState<string | null>(null);

  const row = d.providers.find((p) => p.name === provider);
  const catalogued = !!row && row.model_catalog !== "unsupported" && row.configured;
  const cat = useProviderModels(catalogued ? provider : null);
  const info = cat.models.find((m) => m.id === model);
  const deferred = DEFERRED_PROVIDERS.includes(provider);
  const q = model.trim().toLowerCase();
  const matches = catalogued && (!deferred || q.length >= 2) ? cat.models.filter((m) => !q || m.id.toLowerCase().includes(q) || (m.label ?? "").toLowerCase().includes(q)).filter((m) => m.id !== model).slice(0, 8) : [];
  const efforts = info?.reasoning_efforts?.length ? info.reasoning_efforts : preset?.reasoning_effort_values ?? [];
  const supported = (info?.api ?? preset?.api)?.supported_apis ?? ((row?.request_apis ?? []).filter((a) => ["chat_completions", "responses", "anthropic_messages"].includes(a)) as ModelRequestAPI[]);

  useEffect(() => {
    if (!d.model_api_resolution_supported || !session || !provider || !model) return setAutoApi(null);
    let live = true;
    const qs = `provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}&reasoning_effort=${encodeURIComponent(effort)}`;
    session.get<{ api: string }>(`/api/settings/model-api?${qs}`).then((r) => live && setAutoApi(r?.api ?? null), () => live && setAutoApi(null));
    return () => void (live = false);
  }, [session, provider, model, effort, d.model_api_resolution_supported]);

  const pickModel = (id: string) => {
    setModel(id);
    if (!nameTouched) setName(suggestPresetName(id));
    const m = cat.models.find((x) => x.id === id);
    if (m?.context_window && !preset) setCtx(String(m.context_window));
  };

  const save = async () => {
    const form: PresetForm = {
      name, provider, model, maxTokens: Number(maxTokens), contextWindowTokens: parseContextWindowTokens(ctx) ?? NaN, temperature: Number(temp),
      reasoningEffort: effort, api: apiPref ? { supported_apis: supported, preferred_api: apiPref as ModelRequestAPI } : null,
      extraHeaders: headers.trim(), extraQuery: query.trim(), extraBody: body.trim(),
    };
    const v = validatePreset(form, d.model_presets.map((p) => p.name), preset?.name);
    const e: Errors = {};
    if (!v.ok) e[v.field as keyof PresetForm] = t(`models.err.${v.code}`);
    if (overrides) {
      if (!parseJsonObject(headers, { stringValues: true })) e.extraHeaders = t("models.err.invalid");
      if (!parseJsonObject(query, { stringValues: true })) e.extraQuery = t("models.err.invalid");
      if (!parseJsonObject(body)) e.extraBody = t("models.err.invalid");
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      if (preset) {
        const diff = presetUpdateDiff(preset, form, { overrides });
        if (Object.keys(diff).length) await mutate("settings.model_configuration.update", { name: preset.name, ...diff });
      } else await createPresetAndOrder(mutate, form, d.model_call_order, overrides);
      onClose();
    } catch (err) {
      const f = err instanceof SettingsError ? err.field : undefined;
      if (f) setErrors({ [f.replace(/_(\w)/g, (_, c: string) => c.toUpperCase())]: msgOf(err) });
      else toast.show(msgOf(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    try {
      await mutate("settings.model_configuration.delete", { name: preset!.name });
      onClose();
    } catch (err) {
      toast.show(msgOf(err));
    }
  };

  const apiOptions = [{ value: "", label: autoApi ? t("models.apiAuto", { api: autoApi }) : t("models.apiAutoPlain") }, ...supported.map((a) => ({ value: a as string, label: a }))];

  return (
    <Sheet open onClose={onClose} title={t(preset ? "models.editPreset" : "models.newPreset")}>
      <KeyboardAvoidingView behavior="padding">
        <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
          <TextField label={t("models.name")} value={name} onChangeText={(v) => (setNameTouched(true), setName(v))} error={errors.name} autoCapitalize="none" autoCorrect={false} />
          {configured.length ? (
            <>
              <Text style={{ color: th.colors.foreground, fontSize: 13, marginBottom: 4 }}>{t("models.provider")}</Text>
              <Chips options={configured.map((p) => ({ value: p.name, label: p.label }))} value={provider} onChange={setProvider} />
            </>
          ) : (
            <Text style={{ color: th.colors.destructive, marginBottom: 12 }}>{t("models.noProviders")}</Text>
          )}
          <TextField
            label={t("models.model")} value={model} onChangeText={pickTyped(setModel)} error={errors.model} autoCapitalize="none" autoCorrect={false}
            helper={deferred && q.length < 2 ? t("models.searchHint") : undefined}
            right={catalogued ? <IconButton icon="refresh" accessibilityLabel={t("models.refresh")} disabled={cat.loading} onPress={() => void cat.refresh()} /> : undefined}
          />
          {matches.map((m) => (
            <ListItem key={m.id} title={m.id} subtitle={m.label && m.label !== m.id ? m.label : undefined} onPress={() => pickModel(m.id)} />
          ))}
          {efforts.length ? (
            <>
              <Text style={{ color: th.colors.foreground, fontSize: 13, marginTop: 8, marginBottom: 4 }}>{t("models.effort")}</Text>
              <Chips options={[{ value: "", label: t("models.effortDefault") }, ...efforts.map((x) => ({ value: x, label: x }))]} value={effort} onChange={setEffort} />
            </>
          ) : null}
          <TextField label={t("models.context")} value={ctx} onChangeText={setCtx} error={errors.contextWindowTokens} autoCapitalize="none" />
          <TextField label={t("models.maxTokens")} value={maxTokens} onChangeText={setMaxTokens} error={errors.maxTokens} keyboardType="number-pad" />
          <TextField label={t("models.temperature")} value={temp} onChangeText={setTemp} error={errors.temperature} keyboardType="decimal-pad" />
          {supported.length > 1 ? (
            <>
              <Text style={{ color: th.colors.foreground, fontSize: 13, marginBottom: 4 }}>{t("models.api")}</Text>
              <Chips options={apiOptions} value={apiPref} onChange={setApiPref} />
            </>
          ) : null}
          {overrides ? (
            <>
              <TextField label={t("models.headers")} value={headers} onChangeText={setHeaders} error={errors.extraHeaders} multiline autoCapitalize="none" autoCorrect={false} />
              <TextField label={t("models.query")} value={query} onChangeText={setQuery} error={errors.extraQuery} multiline autoCapitalize="none" autoCorrect={false} />
              <TextField label={t("models.body")} value={body} onChangeText={setBody} error={errors.extraBody} multiline autoCapitalize="none" autoCorrect={false} />
            </>
          ) : null}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            {preset ? (
              <Button title={t("models.delete")} variant="destructive" disabled={!canDelete(preset.name, d.model_call_order)} onPress={() => setConfirmDelete(true)} />
            ) : null}
            <Button title={t("models.save")} loading={saving} disabled={!configured.length} onPress={() => void save()} />
          </View>
          {preset && !canDelete(preset.name, d.model_call_order) ? <Text style={{ color: th.colors.mutedForeground, fontSize: 12, textAlign: "right", marginTop: 4 }}>{t("models.primaryNoDelete")}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <Dialog
        open={confirmDelete} destructive title={t("models.deleteTitle")} message={t("models.deleteMessage", { name: preset?.name })}
        confirmLabel={t("models.delete")} cancelLabel={t("models.cancel")} onConfirm={() => void remove()} onCancel={() => setConfirmDelete(false)}
      />
    </Sheet>
  );

  function pickTyped(set: (v: string) => void) {
    return (v: string) => {
      set(v);
      if (!nameTouched) setName(suggestPresetName(v));
    };
  }
}
