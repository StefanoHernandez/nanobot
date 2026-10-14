import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useT } from "../../../i18n";
import { Button, Dialog, Sheet, TextField } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { toast } from "../../../ui/components/Toast";
import { HintSecretField } from "../../settings/common";
import { toastEcosystemError } from "../../../ecosystem/common";
import type { McpPresetInfo } from "@/lib/types";

export function McpSheet({
  open,
  preset,
  gateAllowed = true,
  onClose,
  onOpenOAuth,
  enable: propEnable,
  tools: propTools,
}: {
  open: boolean;
  preset: McpPresetInfo | null;
  gateAllowed?: boolean;
  onClose: () => void;
  onOpenOAuth?: (presetName: string) => void;
  enable?: (name: string, values?: Record<string, string>) => Promise<any>;
  tools?: (name: string, enabledTools: string[]) => Promise<any>;
}) {
  const t = useT();
  const th = useTheme();

  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [editingSecrets, setEditingSecrets] = useState<Record<string, boolean>>({});
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showConfirmEnable, setShowConfirmEnable] = useState(false);

  useEffect(() => {
    if (preset) {
      setFieldValues({});
      setEditingSecrets({});
      setEnabledTools(preset.enabled_tools ?? preset.tool_names ?? []);
      setShowConfirmEnable(false);
    }
  }, [preset]);

  if (!preset || !open) return null;

  const doSave = async () => {
    setSaving(true);
    try {
      if (propEnable) {
        await propEnable(preset.name, fieldValues);
      }
      if (propTools && preset.tool_names && preset.tool_names.length > 0) {
        await propTools(preset.name, enabledTools);
      }
      onClose();
    } catch (e) {
      toastEcosystemError(e, t);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = () => {
    if (!preset.enabled) {
      setShowConfirmEnable(true);
    } else {
      void doSave();
    }
  };

  const toggleTool = (toolName: string) => {
    setEnabledTools((prev) =>
      prev.includes(toolName) ? prev.filter((n) => n !== toolName) : [...prev, toolName],
    );
  };

  const isOAuth = preset.auth === "oauth" || preset.transport === "oauth";
  const saveDisabled = !gateAllowed && !preset.enabled;

  return (
    <>
      <Sheet open={open} title={preset.display_name || preset.name} onClose={onClose}>
        <KeyboardAvoidingView behavior="padding">
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {preset.description ? (
              <Text style={[styles.description, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                {preset.description}
              </Text>
            ) : null}

            {isOAuth && onOpenOAuth ? (
              <View style={styles.oauthRow}>
                <Button
                  title={t("mcp.oauth")}
                  variant="secondary"
                  onPress={() => onOpenOAuth(preset.name)}
                />
              </View>
            ) : null}

            {preset.required_fields && preset.required_fields.length > 0 ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
                  {t("mcp.config")}
                </Text>
                {preset.required_fields.map((f) => {
                  if (f.secret) {
                    return (
                      <HintSecretField
                        key={f.name}
                        label={f.label || f.name}
                        hint={f.configured ? t("mcp.saved") : null}
                        value={fieldValues[f.name] || ""}
                        onChangeText={(v) => setFieldValues((prev) => ({ ...prev, [f.name]: v }))}
                        editing={!!editingSecrets[f.name]}
                        onEdit={(e) => setEditingSecrets((prev) => ({ ...prev, [f.name]: e }))}
                        labels={{
                          show: t("common.show", "Show"),
                          hide: t("common.hide", "Hide"),
                          edit: t("common.edit", "Edit"),
                          keep: t("common.keep", "Keep"),
                        }}
                      />
                    );
                  }
                  return (
                    <TextField
                      key={f.name}
                      label={f.label || f.name}
                      value={fieldValues[f.name] || ""}
                      onChangeText={(v) => setFieldValues((prev) => ({ ...prev, [f.name]: v }))}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  );
                })}
              </View>
            ) : null}

            {preset.tool_names && preset.tool_names.length > 0 ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
                  {t("mcp.tools")}
                </Text>
                {preset.tool_names.map((toolName) => (
                  <View key={toolName} style={styles.toolRow}>
                    <Text style={[styles.toolName, { color: th.colors.foreground, fontFamily: th.font.regular }]}>{toolName}</Text>
                    <Switch
                      value={enabledTools.includes(toolName)}
                      onValueChange={() => toggleTool(toolName)}
                      trackColor={{ false: th.colors.muted, true: th.colors.primary }}
                    />
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.actions}>
              <Button
                title={t("mcp.save")}
                variant="primary"
                disabled={saveDisabled}
                loading={saving}
                onPress={handleSaveClick}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Sheet>

      <Dialog
        open={showConfirmEnable}
        title={t("mcp.enableTitle")}
        message={t("mcp.enableMessage", { name: preset.display_name || preset.name })}
        confirmLabel={t("apps.confirm")}
        cancelLabel={t("apps.cancel")}
        onConfirm={() => {
          setShowConfirmEnable(false);
          void doSave();
        }}
        onCancel={() => setShowConfirmEnable(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 520,
  },
  description: {
    fontSize: 14,
    marginBottom: 16,
  },
  oauthRow: {
    marginBottom: 16,
  },
  section: {
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    marginBottom: 4,
  },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    minHeight: 48,
  },
  toolName: {
    fontSize: 15,
  },
  actions: {
    marginTop: 12,
    marginBottom: 24,
  },
});
