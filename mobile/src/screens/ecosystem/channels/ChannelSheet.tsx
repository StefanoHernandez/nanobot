import React, { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useT } from "../../../i18n";
import { useSettings } from "../../../settings/store";
import {
  channelConfigurePayload,
  channelFormFromContract,
  configureChannel,
  setChannelValue,
  setSecretCleared,
  validateChannelForm,
  validationMessageKey,
  type ChannelForm,
} from "../../../ecosystem/channels";
import { isPolicyError } from "../../../ecosystem/common";
import { Button, Dialog, Sheet, TextField, toast } from "../../../ui/components";
import { Chips, HintSecretField } from "../../settings/common";
import { useTheme } from "../../../ui/ThemeProvider";
import { ChannelConnect } from "./ChannelConnect";
import type { ChannelSetupContractField, NanobotFeatureInfo, NanobotFeaturesPayload } from "@/lib/types";

export type ChannelSheetProps = {
  open: boolean;
  channel: NanobotFeatureInfo | null;
  instanceId?: string;
  onClose: () => void;
  onSaved?: () => void;
  onFeatures?: (p: NanobotFeaturesPayload) => void;
};

export function ChannelSheet({ open, channel, instanceId, onClose, onSaved, onFeatures }: ChannelSheetProps) {
  const t = useT();
  const th = useTheme();
  const { mutate } = useSettings();

  const contract = channel?.setup;
  const configuredFields = useMemo(() => {
    return channel?.configured_fields ?? [];
  }, [channel]);

  const configValues = useMemo(() => {
    return channel?.config_values ?? {};
  }, [channel]);

  const [form, setForm] = useState<ChannelForm>(() =>
    contract ? channelFormFromContract(contract, configValues, configuredFields) : { values: {}, configured: [], touched: [], cleared: [] },
  );

  const [editingSecrets, setEditingSecrets] = useState<Record<string, boolean>>({});
  const [clearingSecretKey, setClearingSecretKey] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const lastResetRef = useRef<{ open: boolean; channelName?: string; instanceId?: string }>({
    open: false,
  });

  useEffect(() => {
    const wasOpen = lastResetRef.current.open;
    const sameChannel = lastResetRef.current.channelName === channel?.name;
    const sameInstance = lastResetRef.current.instanceId === instanceId;
    if (open && (!wasOpen || !sameChannel || !sameInstance)) {
      if (contract) {
        setForm(channelFormFromContract(contract, configValues, configuredFields));
        setEditingSecrets({});
        setFieldErrors({});
        setServerError(null);
      }
    }
    lastResetRef.current = { open, channelName: channel?.name, instanceId };
  }, [open, channel?.name, instanceId, contract, configValues, configuredFields]);

  if (!channel) return null;

  const handleSave = async () => {
    if (!contract) return;
    const errors = validateChannelForm(contract, form);
    if (Object.keys(errors).length > 0) {
      const errMap: Record<string, string> = {};
      for (const [k, v] of Object.entries(errors)) {
        errMap[k] = t(`channels.validation.${v}`);
      }
      setFieldErrors(errMap);
      return;
    }
    setFieldErrors({});
    setServerError(null);
    setSaving(true);
    try {
      const payload = channelConfigurePayload(contract, form);
      await configureChannel(mutate, channel.name, payload, { instanceId });
      onSaved?.();
      onClose();
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const keySuffix = validationMessageKey(msg);
      setServerError(keySuffix ? t(`channels.validation.${keySuffix}`) : t("common.operationFailed"));
      if (isPolicyError(e)) {
        toast.show(t("apps.gateBanner"));
      } else {
        toast.show(keySuffix ? t(`channels.validation.${keySuffix}`) : t("common.operationFailed"));
      }
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f: ChannelSetupContractField) => {
    const isSecret = f.kind === "secret";
    const isSaved = form.configured.includes(f.key) && !form.cleared.includes(f.key);
    const err = fieldErrors[f.key];

    if (isSecret) {
      const isEditing = editingSecrets[f.key] || !isSaved;
      return (
        <View key={f.key} style={styles.fieldContainer}>
          <HintSecretField
            label={f.field}
            hint={isSaved ? t("channels.saved") : undefined}
            value={form.values[f.key] ?? ""}
            onChangeText={(v) => {
              setForm((cur) => setChannelValue(cur, f.key, v));
              if (fieldErrors[f.key]) setFieldErrors((cur) => ({ ...cur, [f.key]: "" }));
            }}
            editing={isEditing}
            onEdit={(editing) => setEditingSecrets((cur) => ({ ...cur, [f.key]: editing }))}
            error={err}
            labels={{
              show: t("channels.showSecret"),
              hide: t("channels.hideSecret"),
              edit: t("channels.editSecret"),
              keep: t("channels.keepSecret"),
            }}
          />
          {isSaved ? (
            <Button
              title={t("channels.clear")}
              variant="destructive"
              onPress={() => setClearingSecretKey(f.key)}
            />
          ) : null}
        </View>
      );
    }

    if (f.kind === "bool") {
      const isTrue = ["true", "1", "yes", "on"].includes((form.values[f.key] ?? "").toLowerCase());
      return (
        <View key={f.key} style={styles.switchRow}>
          <Text style={{ color: th.colors.foreground, fontSize: 15, flex: 1 }}>{f.field}</Text>
          <Switch
            value={isTrue}
            onValueChange={(val) => setForm((cur) => setChannelValue(cur, f.key, val ? "true" : "false"))}
          />
        </View>
      );
    }

    if (f.kind === "enum" && f.choices?.length) {
      const currentVal = form.values[f.key] || f.choices[0] || "";
      const options = f.choices.map((c) => ({ value: c, label: c }));
      return (
        <View key={f.key} style={styles.fieldContainer}>
          <Text style={{ color: th.colors.foreground, fontSize: 13, marginBottom: 4 }}>{f.field}</Text>
          <Chips
            options={options}
            value={currentVal}
            onChange={(val) => setForm((cur) => setChannelValue(cur, f.key, val))}
          />
          {err ? <Text style={{ color: th.colors.destructive, fontSize: 12 }}>{err}</Text> : null}
        </View>
      );
    }

    return (
      <View key={f.key} style={styles.fieldContainer}>
        <TextField
          label={f.field}
          value={form.values[f.key] ?? ""}
          onChangeText={(v) => {
            setForm((cur) => setChannelValue(cur, f.key, v));
            if (fieldErrors[f.key]) setFieldErrors((cur) => ({ ...cur, [f.key]: "" }));
          }}
          keyboardType={f.kind === "int" ? "numeric" : "default"}
          error={err}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("channels.sheetTitle", { name: channel.display_name || channel.name })}
    >
      <KeyboardAvoidingView behavior="padding">
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {serverError ? (
            <View style={[styles.serverErrorBox, { backgroundColor: th.colors.destructive, borderRadius: th.radius.sm }]}>
              <Text style={{ color: th.colors.destructiveForeground, fontSize: 13 }}>{serverError}</Text>
            </View>
          ) : null}

          {contract?.fields?.map(renderField)}

          <Button
            title={t("channels.save")}
            onPress={() => void handleSave()}
            loading={saving}
          />

          <ChannelConnect channel={channel} instanceId={instanceId} onFeatures={onFeatures} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Dialog
        open={!!clearingSecretKey}
        title={t("channels.clearSecretTitle")}
        message={t("channels.clearSecretMessage")}
        confirmLabel={t("channels.clearSecretConfirm")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => {
          if (clearingSecretKey) {
            setForm((cur) => setSecretCleared(cur, clearingSecretKey, true));
            setClearingSecretKey(null);
          }
        }}
        onCancel={() => setClearingSecretKey(null)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: { gap: 12, paddingBottom: 24 },
  fieldContainer: { gap: 4 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingVertical: 4,
  },
  serverErrorBox: { padding: 10, marginBottom: 4 },
});
