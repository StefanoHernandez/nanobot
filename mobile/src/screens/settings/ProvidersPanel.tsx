import React, { useState } from "react";
import { KeyboardAvoidingView, ScrollView, Switch, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import type { ModelRequestAPI } from "@/lib/types";
import { useT } from "../../i18n";
import { useOAuthFlow } from "../../settings/oauth";
import {
  providerFormFromRow, providerUpdatePayload, requiredFeature, validateProviderForm, type Provider, type ProviderForm,
} from "../../settings/providers";
import { SettingsError, useSettings } from "../../settings/store";
import { useSession } from "../../state/sessionStore";
import { Button, Dialog, IconButton, ListItem, Sheet, TextField, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { Chips, Head, HintSecretField, SecretField } from "./common";

const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const toCamel = (s: string) => s.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
const ADD_CUSTOM = "__new_custom__";

export function ProvidersPanel() {
  const t = useT();
  const { data } = useSettings();
  const [sel, setSel] = useState<string | null>(null); // provider name, "+" picker, ADD_CUSTOM create form
  if (!data) return null;
  const configured = data.providers.filter((p) => p.configured);
  const available = data.providers.filter((p) => !p.configured && !p.is_custom);
  const row = data.providers.find((p) => p.name === sel);
  return (
    <>
      <Head>{t("providers.title")}</Head>
      {configured.map((p) => (
        <ListItem key={p.name} title={p.label} subtitle={p.oauth_account ?? p.api_key_hint ?? t("providers.configured")} onPress={() => setSel(p.name)} />
      ))}
      <View style={{ padding: 16 }}>
        <Button title={t("providers.add")} variant="secondary" onPress={() => setSel("+")} />
      </View>
      <Sheet open={sel === "+"} onClose={() => setSel(null)} title={t("providers.add")}>
        <ScrollView style={{ maxHeight: 480 }}>
          {available.map((p) => (
            <ListItem key={p.name} title={p.label} subtitle={t("providers.notConfigured")} onPress={() => setSel(p.name)} />
          ))}
          <ListItem title={t("providers.addCustom")} onPress={() => setSel(ADD_CUSTOM)} />
        </ScrollView>
      </Sheet>
      {row ? <ProviderSheet key={row.name} p={row} onClose={() => setSel(null)} /> : null}
      {sel === ADD_CUSTOM ? <CustomProviderSheet onClose={() => setSel(null)} /> : null}
    </>
  );
}

function ProviderSheet({ p, onClose }: { p: Provider; onClose: () => void }) {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();
  const { mutate } = useSettings();
  const [f, setF] = useState<ProviderForm>(() => providerFormFromRow(p)); // apiKey starts empty: the server never sends it
  const [editKey, setEditKey] = useState(!p.api_key_hint);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const set = (k: keyof ProviderForm) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const af = p.advanced_fields ?? [];
  const apis = (p.request_apis ?? []).filter((a): a is ModelRequestAPI => ["chat_completions", "responses", "anthropic_messages"].includes(a));
  const supported = f.api?.supported_apis ?? apis;
  const preferred = f.api?.preferred_api && supported.includes(f.api.preferred_api) ? f.api.preferred_api : supported[0];
  const setApi = (s: ModelRequestAPI[], pref: ModelRequestAPI) =>
    setF((x) => ({ ...x, api: { supported_apis: s, preferred_api: s.includes(pref) ? pref : s[0] } }));
  const oauth = p.auth_type === "oauth";

  const isRendered = (k: string) => {
    if (k === "apiBase") return true;
    if (k === "apiKey") return !oauth;
    if (k === "displayName") return !!p.is_custom;
    if (k === "proxy") return af.includes("proxy");
    if (k === "thinkingStyle") return af.includes("thinking_style");
    if (k === "region") return af.includes("region");
    if (k === "profile") return af.includes("profile");
    if (k === "extraHeaders") return af.includes("extra_headers");
    return false;
  };

  const submit = async () => {
    const v = validateProviderForm(p, f);
    if (!v.ok) return setErrors({ [v.field]: t(v.code === "required" ? "models.err.required" : "models.err.invalid") });
    setErrors({});
    const feature = requiredFeature(p);
    if (feature) {
      let installed = false; // fail closed: an unknown state is treated as not installed
      try {
        const r = await session?.get<{ features?: { name: string; installed?: boolean }[] }>("/api/settings/nanobot-features");
        installed = !!r?.features?.find((x) => x.name === feature)?.installed;
      } catch {}
      if (!installed) return setInstalling(true);
    }
    await doSave();
  };

  const doSave = async (enable?: string) => {
    setSaving(true);
    try {
      if (enable) await mutate("settings.feature.enable", { name: enable }, { timeoutMs: 150_000 });
      await mutate("settings.provider.update", providerUpdatePayload(p, f));
      onClose(); // unmounts the sheet: the typed key is dropped with its state
    } catch (e) {
      const field = e instanceof SettingsError ? e.field : undefined;
      const target = field ? toCamel(field.split(".")[0]) : undefined;
      if (target && isRendered(target)) {
        setErrors({ [target]: msgOf(e) });
      } else {
        // Unrendered field -> generic copy; non-field failure (network, 5xx) -> server message, per spec.
        toast.show(field ? t("models.err.invalid") : msgOf(e));
      }
    } finally {
      setSaving(false);
    }
  };

  const text = (k: keyof ProviderForm, label: string, multiline = false) => (
    <TextField key={k} label={label} value={f[k] as string} onChangeText={set(k)} error={errors[k]} multiline={multiline} autoCapitalize="none" autoCorrect={false} />
  );

  return (
    <Sheet open onClose={onClose} title={p.label}>
      <KeyboardAvoidingView behavior="padding">
        <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
          {p.is_custom ? text("displayName", t("providers.displayName")) : null}
          {oauth ? (
            <OAuthControl p={p} />
          ) : (
            <HintSecretField
              label={t("providers.apiKey")} hint={p.api_key_hint} value={f.apiKey} onChangeText={set("apiKey")} editing={editKey} onEdit={setEditKey} error={errors.apiKey}
              labels={{ show: t("providers.show"), hide: t("providers.hide"), edit: t("providers.editKey"), keep: t("providers.cancelEdit") }}
            />
          )}
          {text("apiBase", t("providers.apiBase"))}
          {p.provider_api_configurable && apis.length > 1 ? (
            <>
              {apis.map((a) => (
                <ListItem
                  key={a} title={a}
                  right={<Switch accessibilityLabel={a} value={supported.includes(a)} disabled={supported.includes(a) && supported.length === 1} onValueChange={(on) => setApi(on ? [...supported, a] : supported.filter((x) => x !== a), preferred)} />}
                />
              ))}
              <Text style={{ color: th.colors.foreground, fontSize: 13, marginBottom: 4 }}>{t("providers.defaultApi")}</Text>
              <Chips options={supported.map((a) => ({ value: a, label: a }))} value={preferred} onChange={(a) => setApi(supported, a)} />
            </>
          ) : null}
          {af.includes("proxy") ? text("proxy", t("providers.proxy")) : null}
          {af.includes("thinking_style") ? text("thinkingStyle", t("providers.thinkingStyle")) : null}
          {af.includes("region") ? text("region", t("providers.region")) : null}
          {af.includes("profile") ? text("profile", t("providers.profile")) : null}
          {af.includes("extra_headers") ? text("extraHeaders", t("providers.headers"), true) : null}
          {af.includes("extra_query") ? text("extraQuery", t("providers.query"), true) : null}
          {af.includes("extra_body") ? text("extraBody", t("providers.body"), true) : null}
          <View style={{ alignItems: "flex-end", marginTop: 8 }}>
            <Button title={t("providers.save")} loading={saving} onPress={() => void submit()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Dialog
        open={installing} title={t("providers.featureTitle")} message={t("providers.featureMessage", { name: requiredFeature(p) })}
        confirmLabel={t("providers.featureConfirm")} cancelLabel={t("providers.cancel")}
        onCancel={() => setInstalling(false)} onConfirm={() => (setInstalling(false), void doSave(requiredFeature(p) ?? undefined))}
      />
    </Sheet>
  );
}

function OAuthControl({ p }: { p: Provider }) {
  const t = useT();
  const th = useTheme();
  const { mutate } = useSettings();
  const flow = useOAuthFlow(p.name);
  const [resp, setResp] = useState("");
  const live = flow.state === "awaiting_user" || flow.state === "polling";
  return (
    <View style={{ marginBottom: 12, gap: 8 }}>
      {p.oauth_account ? <Text style={{ color: th.colors.foreground }}>{t("providers.oauth.account", { a: p.oauth_account })}</Text> : null}
      {!live ? (
        <>
          <Button title={t("providers.oauth.login")} variant={p.oauth_account ? "secondary" : "primary"} onPress={() => void flow.start()} />
          {p.oauth_account ? (
            <Button title={t("providers.oauth.logout")} variant="ghost" onPress={() => void mutate("settings.provider.oauth_logout", { provider: p.name }).catch((e) => toast.show(msgOf(e)))} />
          ) : null}
        </>
      ) : (
        <>
          {flow.authUrl ? <Button title={t("providers.oauth.open")} variant="secondary" onPress={() => void WebBrowser.openBrowserAsync(flow.authUrl!)} /> : null}
          {flow.completionInput === "device_code" && flow.userCode ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text selectable style={{ flex: 1, color: th.colors.foreground, fontSize: 18 }}>{t("providers.oauth.code", { c: flow.userCode })}</Text>
              <IconButton icon="content-copy" accessibilityLabel={t("providers.oauth.copy")} onPress={() => void Clipboard.setStringAsync(flow.userCode!).then(() => toast.show(t("providers.oauth.copied")))} />
            </View>
          ) : flow.completionInput ? (
            <>
              <TextField label={t("providers.oauth.paste")} value={resp} onChangeText={setResp} autoCapitalize="none" autoCorrect={false} />
              <Button title={t("providers.oauth.submit")} disabled={!resp.trim()} loading={flow.state === "polling"} onPress={() => void flow.submit(resp)} />
            </>
          ) : null}
          {flow.state === "polling" ? <Text style={{ color: th.colors.mutedForeground }}>{t("providers.oauth.polling")}</Text> : null}
          <Button title={t("providers.oauth.cancel")} variant="ghost" onPress={() => void flow.cancel()} />
        </>
      )}
      {flow.state === "error" ? <Text style={{ color: th.colors.destructive }}>{flow.errorCode === "expired" ? t("providers.oauth.expired") : flow.error}</Text> : null}
    </View>
  );
}

function CustomProviderSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { mutate } = useSettings();
  const [name, setName] = useState("");
  const [base, setBase] = useState("");
  const [key, setKey] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const create = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t("models.err.required");
    if (!base.trim()) e.base = t("models.err.required");
    setErr(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await mutate("settings.provider.create", {
        name: name.trim(), api_base: base.trim(), ...(key.trim() ? { api_key: key.trim() } : {}),
        api: { supported_apis: ["chat_completions"], preferred_api: "chat_completions" }, proxy: "", extra_headers: "", extra_body: "", extra_query: "", thinking_style: "",
      });
      onClose();
    } catch (x) {
      toast.show(msgOf(x));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={t("providers.addCustom")}>
      <KeyboardAvoidingView behavior="padding">
        <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
          <TextField label={t("providers.name")} value={name} onChangeText={setName} error={err.name} autoCapitalize="none" autoCorrect={false} />
          <TextField label={t("providers.apiBase")} value={base} onChangeText={setBase} error={err.base} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <SecretField label={t("providers.apiKey")} value={key} onChangeText={setKey} showLabel={t("providers.show")} hideLabel={t("providers.hide")} />
          <View style={{ alignItems: "flex-end" }}>
            <Button title={t("providers.create")} loading={saving} onPress={() => void create()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Sheet>
  );
}
