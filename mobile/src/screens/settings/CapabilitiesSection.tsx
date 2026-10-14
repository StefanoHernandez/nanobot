import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Switch, Text, View } from "react-native";
import { useT } from "../../i18n";
import {
  ASPECT_RATIOS, IMAGE_SIZES, imageGenPayload, selectImageProvider, transcriptionPayload, webSearchPayload,
  type WebSearchForm,
} from "../../settings/capabilities";
import { coerceRuntimeValue, RUNTIME_FIELDS } from "../../settings/runtimeFields";
import { SettingsError, useSettings } from "../../settings/store";
import { useSession } from "../../state/sessionStore";
import { Button, Dialog, ListItem, TextField, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { Chips, Head, HintSecretField } from "./common";

const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const field = (p: string) => RUNTIME_FIELDS.find((f) => f.path === p)!;

function useSave() {
  const { mutate } = useSettings();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (e) {
      toast.show(msgOf(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const runtime = (values: Record<string, unknown>) => mutate("settings.runtime_config.update", { values });
  return { mutate, busy, run, runtime };
}

/** Reset a card from server data when it changes, unless the user has unsaved edits. */
function useResync(key: string, reset: () => void) {
  const edited = useRef(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) first.current = false;
    else if (!edited.current) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { touch: () => void (edited.current = true), clear: () => void (edited.current = false) };
}

const Row = ({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
  <ListItem title={label} right={<Switch accessibilityLabel={label} value={value} disabled={disabled} onValueChange={onChange} />} />
);

const Pad = ({ children }: { children: React.ReactNode }) => <View style={{ paddingHorizontal: 16 }}>{children}</View>;

export function CapabilitiesSection() {
  const { data } = useSettings();
  if (!data) return null;
  return (
    <KeyboardAvoidingView behavior="padding">
      <ImageCard />
      <WebCard />
      <TranscriptionCard />
      <MemoryCard />
    </KeyboardAvoidingView>
  );
}

function ImageCard() {
  const t = useT();
  const th = useTheme();
  const { data } = useSettings();
  const { mutate, busy, run, runtime } = useSave();
  const g = data!.image_generation;
  const initF = () => ({
    enabled: g.enabled, provider: g.provider, model: g.model, defaultAspectRatio: g.default_aspect_ratio,
    defaultImageSize: g.default_image_size, maxImagesPerTurn: g.max_images_per_turn,
  });
  const [f, setF] = useState(initF);
  const [max, setMax] = useState(String(g.max_images_per_turn));
  const [dir, setDir] = useState(g.save_dir ?? "");
  const { touch, clear } = useResync(JSON.stringify(g), () => (setF(initF()), setMax(String(g.max_images_per_turn)), setDir(g.save_dir ?? "")));
  const [err, setErr] = useState<Record<string, string>>({});
  const [hint, setHint] = useState(false);
  const configured = (name: string) => g.providers.find((p) => p.name === name)?.configured ?? false;
  const send = (next: typeof f, extra?: () => Promise<unknown>) => {
    const p = imageGenPayload({ ...next, maxImagesPerTurn: Number(max) });
    if (!p.ok) return setErr({ [p.code]: t("models.err.invalid") });
    setErr({});
    void run(async () => (await mutate("settings.image_generation.update", p.value), await extra?.())).then((ok) => ok && clear());
  };
  const apply = (next: typeof f) => (setF(next), send(next));
  return (
    <>
      <Head>{t("caps.image.title")}</Head>
      <Row
        label={t("caps.image.enable")} value={f.enabled}
        onChange={(v) => (v && !configured(f.provider) ? setHint(true) : (setHint(false), apply({ ...f, enabled: v })))}
      />
      {hint || (!f.enabled && !configured(f.provider)) ? <Pad><Text style={{ color: th.colors.destructive, marginBottom: 8 }}>{t("caps.configureProvider")}</Text></Pad> : null}
      <Pad>
        <Chips options={g.providers.map((p) => ({ value: p.name, label: p.label }))} value={f.provider} onChange={(p) => {
          if (f.enabled && !configured(p)) return setHint(true); // never send enabled:true for an unconfigured provider
          setHint(false);
          apply(selectImageProvider(f, data!, p));
        }} />
        <TextField label={t("caps.model")} value={f.model} onChangeText={(v) => (touch(), setF({ ...f, model: v }))} autoCapitalize="none" autoCorrect={false} />
        <Chips options={ASPECT_RATIOS.map((v) => ({ value: v, label: v }))} value={f.defaultAspectRatio} onChange={(v) => apply({ ...f, defaultAspectRatio: v })} />
        <Chips options={IMAGE_SIZES.map((v) => ({ value: v, label: v }))} value={f.defaultImageSize} onChange={(v) => apply({ ...f, defaultImageSize: v })} />
        <TextField label={t("caps.image.max")} value={max} onChangeText={(v) => (touch(), setMax(v))} keyboardType="number-pad" error={err.maxImagesPerTurn} />
        <TextField label={t("caps.image.saveDir")} value={dir} onChangeText={(v) => (touch(), setDir(v))} autoCapitalize="none" autoCorrect={false} />
        <View style={{ alignItems: "flex-end" }}>
          <Button
            title={t("caps.image.save")} loading={busy}
            onPress={() => {
              const c = coerceRuntimeValue(field("tools.image_generation.save_dir"), dir);
              send(f, c.ok && dir !== (g.save_dir ?? "") ? () => runtime({ "tools.image_generation.save_dir": c.value }) : undefined);
            }}
          />
        </View>
      </Pad>
    </>
  );
}

function WebCard() {
  const t = useT();
  const { data } = useSettings();
  const { session } = useSession();
  const { mutate, busy, run, runtime } = useSave();
  const w = data!.web_search;
  const web = data!.web;
  const initF = (): WebSearchForm => ({
    provider: w.provider, apiKey: "", baseUrl: w.base_url ?? "", maxResults: w.max_results, timeout: w.timeout,
    useJinaReader: web.fetch.use_jina_reader, keyEditing: false,
  });
  const [f, setF] = useState<WebSearchForm>(initF);
  const [nums, setNums] = useState({ maxResults: String(w.max_results), timeout: String(w.timeout) });
  const [proxy, setProxy] = useState(web.proxy ?? "");
  const [ua, setUa] = useState(web.user_agent ?? "");
  const [err, setErr] = useState<Record<string, string>>({});
  const { refresh } = useSettings();
  const { touch, clear } = useResync(JSON.stringify([w, web]), () => (
    setF(initF()), setNums({ maxResults: String(w.max_results), timeout: String(w.timeout) }), setProxy(web.proxy ?? ""), setUa(web.user_agent ?? "")));
  const edit = (fn: () => void) => (touch(), fn());
  const [installing, setInstalling] = useState(false);
  const cred = w.providers.find((p) => p.name === f.provider)?.credential ?? "none";
  const hint = f.provider === w.provider ? w.api_key_hint : null;

  const doSave = (enable?: boolean) =>
    run(async () => {
      const p = webSearchPayload({ ...f, maxResults: Number(nums.maxResults), timeout: Number(nums.timeout) }, data!);
      if (!p.ok) return setErr({ [p.code]: t(p.code === "apiKey" || p.code === "baseUrl" ? "models.err.required" : "models.err.invalid") });
      setErr({});
      if (enable) await mutate("settings.feature.enable", { name: "olostep" }, { timeoutMs: 150_000 });
      try {
        await mutate("settings.web_search.update", p.value);
      } catch (e) {
        if (e instanceof SettingsError && e.field) return setErr({ [e.field.split(".")[0]]: msgOf(e) });
        throw e;
      }
      const values: Record<string, unknown> = {};
      for (const [path, v, cur] of [["tools.web.proxy", proxy, web.proxy ?? ""], ["tools.web.user_agent", ua, web.user_agent ?? ""]] as const) {
        const c = coerceRuntimeValue(field(path), v);
        if (c.ok && v !== cur) values[path] = c.value;
      }
      if (Object.keys(values).length) {
        try {
          await runtime(values);
        } catch (e) {
          toast.show(t("caps.web.partial", { err: msgOf(e) }));
          clear();
          setF((x) => ({ ...x, apiKey: "", keyEditing: false }));
          await refresh();
          return;
        }
      }
      clear();
      setF((x) => ({ ...x, apiKey: "", keyEditing: false })); // drop the typed key
    });

  const submit = async () => {
    const p = webSearchPayload({ ...f, maxResults: Number(nums.maxResults), timeout: Number(nums.timeout) }, data!);
    if (!p.ok) return void doSave();
    if (f.provider === "olostep") {
      let installed = false; // fail closed: unknown state counts as not installed
      try {
        const r = await session?.get<{ features?: { name: string; installed?: boolean }[] }>("/api/settings/nanobot-features");
        installed = !!r?.features?.find((x) => x.name === "olostep")?.installed;
      } catch {}
      if (!installed) return setInstalling(true);
    }
    void doSave();
  };

  return (
    <>
      <Head>{t("caps.web.title")}</Head>
      <Row
        label={t("caps.web.enable")} value={web.enable}
        onChange={(v) => void run(() => runtime({ "tools.web.enable": v }))}
      />
      <Pad>
        <Chips options={w.providers.map((p) => ({ value: p.name, label: p.label }))} value={f.provider} onChange={(p) => edit(() => setF({ ...f, provider: p, apiKey: "", keyEditing: false }))} />
        {cred === "api_key" || cred === "optional_api_key" ? (
          <HintSecretField
            label={t("providers.apiKey")} hint={hint} value={f.apiKey ?? ""} onChangeText={(v) => edit(() => setF({ ...f, apiKey: v }))}
            editing={!!f.keyEditing} onEdit={(e) => edit(() => setF({ ...f, keyEditing: e }))} error={err.apiKey}
            labels={{ show: t("providers.show"), hide: t("providers.hide"), edit: t("providers.editKey"), keep: t("providers.cancelEdit") }}
          />
        ) : null}
        {cred === "base_url" ? <TextField label={t("providers.apiBase")} value={f.baseUrl ?? ""} onChangeText={(v) => edit(() => setF({ ...f, baseUrl: v }))} error={err.baseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" /> : null}
        <TextField label={t("caps.web.results")} value={nums.maxResults} onChangeText={(v) => edit(() => setNums({ ...nums, maxResults: v }))} keyboardType="number-pad" error={err.maxResults} />
        <TextField label={t("caps.web.timeout")} value={nums.timeout} onChangeText={(v) => edit(() => setNums({ ...nums, timeout: v }))} keyboardType="number-pad" error={err.timeout} />
      </Pad>
      <Row label={t("caps.web.jina")} value={!!f.useJinaReader} onChange={(v) => edit(() => setF({ ...f, useJinaReader: v }))} />
      <Pad>
        <TextField label={t("caps.web.proxy")} value={proxy} onChangeText={(v) => edit(() => setProxy(v))} autoCapitalize="none" autoCorrect={false} />
        <TextField label={t("caps.web.userAgent")} value={ua} onChangeText={(v) => edit(() => setUa(v))} autoCapitalize="none" autoCorrect={false} />
        <View style={{ alignItems: "flex-end" }}>
          <Button title={t("caps.web.save")} loading={busy} onPress={() => void submit()} />
        </View>
      </Pad>
      <Dialog
        open={installing} title={t("providers.featureTitle")} message={t("providers.featureMessage", { name: "olostep" })}
        confirmLabel={t("providers.featureConfirm")} cancelLabel={t("providers.cancel")}
        onCancel={() => setInstalling(false)} onConfirm={() => (setInstalling(false), void doSave(true))}
      />
    </>
  );
}

function TranscriptionCard() {
  const t = useT();
  const { data } = useSettings();
  const { mutate, busy, run } = useSave();
  const tr = data!.transcription;
  const initF = () => ({
    enabled: tr?.enabled ?? false, provider: tr?.provider ?? "", model: tr?.model ?? "", language: tr?.language ?? "",
    maxDurationSec: String(tr?.max_duration_sec ?? 60), maxUploadMb: String(tr?.max_upload_mb ?? 25),
  });
  const [f, setF] = useState(initF);
  const [err, setErr] = useState<Record<string, string>>({});
  const { touch, clear } = useResync(JSON.stringify(tr ?? null), () => setF(initF()));
  if (!tr) return null;
  const send = (n: typeof f) => {
    const p = transcriptionPayload({ ...n, maxDurationSec: Number(n.maxDurationSec), maxUploadMb: Number(n.maxUploadMb) });
    if (!p.ok) return setErr({ [p.code]: t("models.err.invalid") });
    setErr({});
    void run(() => mutate("settings.transcription.update", p.value)).then((ok) => ok && clear());
  };
  const apply = (n: typeof f) => (setF(n), send(n));
  const txt = (k: "model" | "language" | "maxDurationSec" | "maxUploadMb", label: string, num = false) => (
    <TextField label={label} value={f[k]} onChangeText={(v) => (touch(), setF({ ...f, [k]: v }))} error={err[k]} autoCapitalize="none" autoCorrect={false} keyboardType={num ? "number-pad" : "default"} />
  );
  return (
    <>
      <Head>{t("caps.tr.title")}</Head>
      <Row label={t("caps.tr.enable")} value={f.enabled} onChange={(v) => apply({ ...f, enabled: v })} />
      <Pad>
        <Chips options={tr.providers.map((p) => ({ value: p.name, label: p.label ?? p.name }))} value={f.provider} onChange={(p) => apply({ ...f, provider: p })} />
        {txt("model", t("caps.model"))}
        {txt("language", t("caps.tr.language"))}
        {txt("maxDurationSec", t("caps.tr.duration"), true)}
        {txt("maxUploadMb", t("caps.tr.upload"), true)}
        <View style={{ alignItems: "flex-end" }}>
          <Button title={t("caps.tr.save")} loading={busy} onPress={() => send(f)} />
        </View>
      </Pad>
    </>
  );
}

function MemoryCard() {
  const t = useT();
  const { data } = useSettings();
  const { busy, run, runtime } = useSave();
  return (
    <>
      <Head>{t("caps.memory.title")}</Head>
      <Row
        label={t("caps.memory.dream")} value={data!.runtime_config?.["agents.defaults.dream.enabled"] === true} disabled={busy}
        onChange={(v) => void run(() => runtime({ "agents.defaults.dream.enabled": v }))}
      />
    </>
  );
}
