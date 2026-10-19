import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useT } from "../../../i18n";
import { Button, Dialog, Sheet, TextField } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { toast } from "../../../ui/components/Toast";
import { HintSecretField } from "../../settings/common";
import { toastEcosystemError } from "../../../ecosystem/common";
import { mcpIsOn } from "../../../ecosystem/mcpState";
import { usePrivileged } from "../../../ecosystem/privilege";
import type { McpPresetInfo } from "@/lib/types";

export function McpSheet({
  open,
  preset,
  onClose,
  onOpenOAuth,
  enable: propEnable,
  test: propTest,
  tools: propTools,
}: {
  open: boolean;
  preset: McpPresetInfo | null;
  onClose: () => void;
  onOpenOAuth?: (presetName: string) => void;
  enable?: (name: string, values?: Record<string, string>) => Promise<any>;
  test?: (name: string) => Promise<any>;
  tools?: (name: string, enabledTools: string[]) => Promise<any>;
}) {
  const t = useT();
  const th = useTheme();

  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [editingSecrets, setEditingSecrets] = useState<Record<string, boolean>>({});
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message?: string;
    failure_reason?: string;
    error_hint?: string;
  } | null>(null);
  const [showConfirmEnable, setShowConfirmEnable] = useState(false);

  useEffect(() => {
    if (preset) {
      setFieldValues({});
      setEditingSecrets({});
      setEnabledTools(preset.enabled_tools ?? preset.tool_names ?? []);
      setShowConfirmEnable(false);
      setTestResult(null);
    }
  }, [preset]);

  const privileged = usePrivileged();
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

  const handleTestInSheet = async () => {
    if (!propTest) return;
    setTesting(true);
    try {
      const res = await propTest(preset.name);
      const action = (res as any)?.last_action;
      if (action) {
        setTestResult({
          ok: !!action.ok,
          message: action.message,
          failure_reason: action.failure_reason || action.error,
          error_hint: action.error_hint,
        });
        if (action.ok) {
          toast.show(action.message || t("mcp.testSuccess", "Test completato con successo"));
        }
      } else {
        setTestResult({ ok: true, message: t("mcp.testSuccess", "Test completato con successo") });
        toast.show(t("mcp.testSuccess", "Test completato con successo"));
      }
    } catch (e) {
      const code = (e as any)?.code;
      const msg = (e as any)?.message || String(e);
      setTestResult({ ok: false, failure_reason: msg, error_hint: code });
      toastEcosystemError(e, t);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveClick = () => {
    if (!mcpIsOn(preset)) {
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

  const failureReason = testResult
    ? (!testResult.ok ? testResult.failure_reason : null)
    : (preset.runtime_status === "failed" || (preset as any).failure_reason || preset.error
        ? ((preset as any).failure_reason || preset.error)
        : null);
  const isNpxCacheBroken = testResult
    ? testResult.error_hint === "npx_cache_broken" ||
      testResult.failure_reason?.includes("ERR_MODULE_NOT_FOUND") ||
      testResult.failure_reason?.includes("npm ERR")
    : (preset as any).error_hint === "npx_cache_broken" ||
      failureReason?.includes("ERR_MODULE_NOT_FOUND") ||
      failureReason?.includes("npm ERR");

  return (
    <>
      <Sheet open={open} title={preset.display_name || preset.name} onClose={onClose} scroll={false}>
        <KeyboardAvoidingView behavior="padding">
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {preset.description ? (
              <Text style={[styles.description, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                {preset.description}
              </Text>
            ) : null}

            {failureReason ? (
              <View style={[styles.failureBox, { backgroundColor: th.colors.muted, borderRadius: th.radius.sm }]}>
                <Text style={[styles.failureText, { color: th.colors.destructive, fontFamily: th.font.regular }]}>
                  {t("mcp.failureReason", { reason: failureReason })}
                </Text>
                {isNpxCacheBroken ? (
                  <Text style={[styles.hintText, { color: th.colors.foreground, fontFamily: th.font.medium }]}>
                    {t("mcp.npxCacheBroken")}
                  </Text>
                ) : null}
              </View>
            ) : testResult?.ok ? (
              <View style={[styles.successBox, { backgroundColor: th.colors.brandSoft, borderRadius: th.radius.sm }]}>
                <Text style={[styles.successText, { color: th.colors.brandSoftForeground, fontFamily: th.font.medium }]}>
                  {testResult.message || t("mcp.testSuccess", "Test completato con successo")}
                </Text>
              </View>
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
              {propTest ? (
                <Button
                  title={t("mcp.test")}
                  variant="secondary"
                  loading={testing}
                  disabled={!privileged}
                  onPress={() => void handleTestInSheet()}
                />
              ) : null}
              <Button
                title={t("mcp.save")}
                variant="primary"
                loading={saving}
                disabled={!privileged}
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
  failureBox: {
    padding: 10,
    gap: 4,
    marginBottom: 16,
  },
  failureText: {
    fontSize: 13,
    lineHeight: 18,
  },
  hintText: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  successBox: {
    padding: 10,
    marginBottom: 16,
  },
  successText: {
    fontSize: 13,
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
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    marginTop: 12,
    marginBottom: 24,
  },
});
