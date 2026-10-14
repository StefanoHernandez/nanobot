import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Switch, Text, View } from "react-native";
import type { NanobotFeaturesPayload, RuntimeConfigValue } from "@/lib/types";
import { useT } from "../../i18n";
import {
  coerceRuntimeValue, fieldFromError, isDangerous, visibleFields, type FieldPage, type RuntimeField,
} from "../../settings/runtimeFields";
import { useRestart, useSettings } from "../../settings/store";
import { useSession } from "../../state/sessionStore";
import { Button, Dialog, ListItem, TextField, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { Chips, Head } from "./common";
import { NetworkSafetyCard } from "./NetworkSafetyCard";

const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const asText = (v: RuntimeConfigValue | undefined) => (Array.isArray(v) ? v.join("\n") : v == null ? "" : String(v));
const RISK: Record<string, string> = {
  "tools.exec.enable": "exec", "tools.restrict_to_workspace": "workspace", "tools.ssrf_whitelist": "ssrf",
  "tools.webui_allow_remote_package_install": "package", "tools.exec.sandbox": "sandbox",
};
const IMMEDIATE = ["toggle", "boolean", "select"];

/** Renders every visible runtime field of a page, grouped; `lead` is placed before the first group. */
function RuntimeGroups({ page, lead }: { page: FieldPage; lead?: React.ReactNode }) {
  const t = useT();
  const th = useTheme();
  const { data, mutate } = useSettings();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busyGroups, setBusyGroups] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<Record<string, RuntimeConfigValue> | null>(null);
  const values = (data?.runtime_config ?? {}) as Record<string, RuntimeConfigValue>;
  const fields = visibleFields(page, values);
  if (!data) return null;

  const send = async (vals: Record<string, RuntimeConfigValue>, group: string) => {
    setBusyGroups((prev) => ({ ...prev, [group]: true }));
    const paths = Object.keys(vals);
    try {
      await mutate("settings.runtime_config.update", { values: vals });
      setEdits((e) => Object.fromEntries(Object.entries(e).filter(([p]) => !paths.includes(p))));
      setErrors((e) => Object.fromEntries(Object.entries(e).filter(([p]) => !paths.includes(p))));
    } catch (e) {
      const m = msgOf(e);
      const f = fieldFromError(m, fields);
      if (f) setErrors((x) => ({ ...x, [f.path]: m }));
      else toast.show(m);
    } finally {
      setBusyGroups((prev) => {
        const next = { ...prev };
        delete next[group];
        return next;
      });
    }
  };
  const request = (vals: Record<string, RuntimeConfigValue>, group: string) => {
    if (Object.entries(vals).some(([p, v]) => isDangerous({ path: p }, v))) setConfirm(vals);
    else void send(vals, group);
  };
  const riskText = (vals: Record<string, RuntimeConfigValue>) => {
    const p = Object.keys(vals).find((k) => isDangerous({ path: k }, vals[k]) && RISK[k]);
    return p ? t(`system.risk.${RISK[p]}`) : t("system.confirmMessage");
  };
  const groupOf = (vals: Record<string, RuntimeConfigValue>) => fields.find((f) => f.path in vals)?.group ?? "";

  const saveGroup = (group: string) => {
    const vals: Record<string, RuntimeConfigValue> = {};
    const errs: Record<string, string> = {};
    for (const f of fields.filter((x) => x.group === group && x.path in edits)) {
      const r = coerceRuntimeValue(f, edits[f.path]);
      if (r.ok) vals[f.path] = r.value;
      else errs[f.path] = t(`system.err.${r.code}`, { min: f.min, max: f.max });
    }
    setErrors((e) => ({ ...e, ...errs }));
    if (Object.keys(errs).length === 0 && Object.keys(vals).length) request(vals, group);
  };

  const row = (f: RuntimeField) => {
    const label = t(`system.fields.${f.path}`);
    const cur = values[f.path];
    const err = errors[f.path];
    const errText = err ? <Text style={{ color: th.colors.destructive, fontSize: 12, paddingHorizontal: 16 }}>{err}</Text> : null;
    if (f.disabledOnRemote) {
      return <ListItem key={f.path} title={label} subtitle={t("system.remoteOnly")} right={<Switch accessibilityLabel={label} value={cur === true} disabled />} />;
    }
    if (f.kind === "boolean") {
      return (
        <View key={f.path}>
          <ListItem title={label} right={<Switch accessibilityLabel={label} value={cur === true} onValueChange={(v) => request({ [f.path]: v }, f.group)} />} />
          {errText}
        </View>
      );
    }
    if (IMMEDIATE.includes(f.kind)) {
      return (
        <View key={f.path} style={{ paddingHorizontal: 16 }}>
          <Text style={{ color: th.colors.foreground, fontSize: 13, marginBottom: 4 }}>{label}</Text>
          <Chips
            options={(f.options ?? []).map((o) => ({ value: o, label: o || t("system.empty") }))} value={String(cur ?? "")}
            onChange={(v) => v !== String(cur ?? "") && request({ [f.path]: v }, f.group)}
          />
          {err ? <Text style={{ color: th.colors.destructive, fontSize: 12 }}>{err}</Text> : null}
        </View>
      );
    }
    return (
      <View key={f.path} style={{ paddingHorizontal: 16 }}>
        <TextField
          label={label} value={edits[f.path] ?? asText(cur)} error={err} autoCapitalize="none" autoCorrect={false}
          keyboardType={f.kind === "number" ? "numeric" : undefined} multiline={f.kind === "list"}
          onChangeText={(v) => setEdits((e) => ({ ...e, [f.path]: v }))}
        />
      </View>
    );
  };

  const groups = [...new Set(fields.map((f) => f.group))];
  return (
    <KeyboardAvoidingView behavior="padding">
      {lead}
      {groups.map((g) => {
        const gf = fields.filter((f) => f.group === g);
        const dirty = gf.some((f) => f.path in edits);
        const title = t(`system.groups.${g}`);
        return (
          <View key={g}>
            <Head>{title}</Head>
            {gf.map(row)}
            {gf.some((f) => !IMMEDIATE.includes(f.kind) && !f.disabledOnRemote) ? (
              <View style={{ paddingHorizontal: 16 }}>
                <Button title={t("system.save", { group: title })} disabled={!dirty} loading={!!busyGroups[g]} onPress={() => saveGroup(g)} />
              </View>
            ) : null}
          </View>
        );
      })}
      <Dialog
        open={!!confirm} destructive title={t("system.confirmTitle")} message={confirm ? riskText(confirm) : undefined}
        confirmLabel={t("system.confirmApply")} cancelLabel={t("common.cancel")}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm!;
          setConfirm(null);
          void send(c, groupOf(c));
        }}
      />
    </KeyboardAvoidingView>
  );
}

function Features() {
  const t = useT();
  const { session } = useSession();
  const { mutate } = useSettings();
  const [list, setList] = useState<NanobotFeaturesPayload["features"]>([]);
  const [target, setTarget] = useState<{ name: string; enable: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;
    void (async () => {
      try {
        setList((await session.get<NanobotFeaturesPayload>("/api/settings/nanobot-features")).features ?? []);
      } catch {} // optional list: hidden when unavailable
    })();
  }, [session]);
  const shown = list.filter((f) => f.type !== "channel" && f.settings_visible !== false);
  if (!shown.length) return null;
  const run = async () => {
    const x = target!;
    setTarget(null);
    setBusy(x.name);
    try {
      const r = await (x.enable
        ? mutate<NanobotFeaturesPayload>("settings.feature.enable", { name: x.name }, { timeoutMs: 150_000 })
        : mutate<NanobotFeaturesPayload>("settings.feature.disable", { name: x.name }));
      if (r?.features) setList(r.features);
    } catch (e) {
      toast.show(`${t("system.featureError")}: ${msgOf(e)}`);
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <Head>{t("system.features")}</Head>
      {shown.map((f) => (
        <ListItem
          key={f.name} title={f.display_name} subtitle={f.status}
          right={<Button title={f.enabled ? t("system.disable") : t("system.enable")} variant="secondary" loading={busy === f.name} onPress={() => setTarget({ name: f.name, enable: !f.enabled })} />}
        />
      ))}
      <Dialog
        open={!!target} destructive={!!target?.enable}
        title={target?.enable ? t("system.featureConfirmTitle") : t("system.featureDisable")}
        message={target?.enable ? t("system.featureMessage") : t("system.featureDisableMessage")}
        confirmLabel={target?.enable ? t("system.featureInstall") : t("system.featureDisable")} cancelLabel={t("common.cancel")}
        onCancel={() => setTarget(null)} onConfirm={() => void run()}
      />
    </>
  );
}

export function SystemSection() {
  const t = useT();
  const { data } = useSettings();
  const { run } = useRestart();
  if (!data) return null;
  return (
    <>
      <ListItem title={t("system.configPath")} subtitle={data.runtime?.config_path} />
      <ListItem title={t("system.applyState")} subtitle={data.apply_state?.status ?? "idle"} />
      <ListItem title={t("system.restartRow")} subtitle={t("system.restartHint")} onPress={() => void run()} />
      <RuntimeGroups page="runtime" />
      <Features />
    </>
  );
}

export const AdvancedSection = () => <RuntimeGroups page="advanced" lead={<NetworkSafetyCard />} />;
