import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { usePrivileged } from "../../../ecosystem/privilege";
import { useT } from "../../../i18n";
import { Button, Dialog, TextField } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { toast } from "../../../ui/components/Toast";
import { useMcp } from "../../../ecosystem/mcp";
import { toastEcosystemError } from "../../../ecosystem/common";
import { filterEcosystemItems } from "./search";
import { McpSheet } from "./McpSheet";
import { McpOAuthSheet } from "./McpOAuthSheet";
import type { McpPresetInfo } from "@/lib/types";

// MCP changes may start host commands: the server allows them from the local browser or a full-power device.
export function McpTab() {
  const privileged = usePrivileged();
  const t = useT();
  const th = useTheme();
  const { presets, loading, refresh, enable, disable, remove, test: testPreset, reconnect, tools } = useMcp();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<McpPresetInfo | null>(null);
  const [oauthPresetName, setOauthPresetName] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<McpPresetInfo | null>(null);
  const [enableTarget, setEnableTarget] = useState<McpPresetInfo | null>(null);
  const [mcpErrors, setMcpErrors] = useState<Record<string, { code?: string; message?: string }>>({});

  const handleToggle = async (preset: McpPresetInfo, value: boolean) => {
    if (value) {
      setEnableTarget(preset);
    } else {
      try {
        await disable(preset.name);
        setMcpErrors((prev) => {
          const next = { ...prev };
          delete next[preset.name];
          return next;
        });
      } catch (e) {
        const code = (e as any)?.code;
        const message = (e as any)?.message;
        setMcpErrors((prev) => ({ ...prev, [preset.name]: { code, message } }));
        toastEcosystemError(e, t);
      }
    }
  };

  const handleConfirmEnable = async () => {
    const target = enableTarget;
    setEnableTarget(null);
    if (!target) return;

    try {
      await enable(target.name);
      setMcpErrors((prev) => {
        const next = { ...prev };
        delete next[target.name];
        return next;
      });
    } catch (e) {
      const code = (e as any)?.code;
      const message = (e as any)?.message;
      setMcpErrors((prev) => ({ ...prev, [target.name]: { code, message } }));
      toastEcosystemError(e, t);
    }
  };

  const handleTest = async (preset: McpPresetInfo) => {
    try {
      const res = await testPreset(preset.name);
      const action = (res as any)?.last_action;
      if (action && !action.ok) {
        setMcpErrors((prev) => ({
          ...prev,
          [preset.name]: {
            code: action.error_hint,
            message: action.failure_reason || action.error,
          },
        }));
      } else {
        setMcpErrors((prev) => {
          const next = { ...prev };
          delete next[preset.name];
          return next;
        });
        toast.show(t("common.success", "Success"));
      }
    } catch (e) {
      const code = (e as any)?.code;
      const message = (e as any)?.message;
      setMcpErrors((prev) => ({ ...prev, [preset.name]: { code, message } }));
      toastEcosystemError(e, t);
    }
  };

  const handleReconnect = async (preset: McpPresetInfo) => {
    try {
      await reconnect(preset.name);
      toast.show(t("common.success", "Success"));
    } catch (e) {
      const code = (e as any)?.code;
      const message = (e as any)?.message;
      setMcpErrors((prev) => ({ ...prev, [preset.name]: { code, message } }));
      toastEcosystemError(e, t);
    }
  };

  const handleConfirmRemove = async () => {
    const target = removeTarget;
    setRemoveTarget(null);
    if (!target) return;

    try {
      await remove(target.name);
      setMcpErrors((prev) => {
        const next = { ...prev };
        delete next[target.name];
        return next;
      });
    } catch (e) {
      toastEcosystemError(e, t);
    }
  };

  const getLockReason = (preset: McpPresetInfo): string | null => {
    const err = mcpErrors[preset.name];
    const code = err?.code;
    if (code === "full_power_required") return t("apps.lockFullPower");
    if (code === "remote_install_disabled") return t("apps.lockRemoteDisabled");
    if (code === "unsupported_install_env") {
      const rawMsg = err?.message || "";
      const cmdMatch = rawMsg.match(/`([^`]+)`/);
      return t("apps.lockUnsupportedEnv", { command: cmdMatch ? cmdMatch[1] : "" });
    }
    if (!privileged) return t("apps.lockFullPower");
    return null;
  };

  const filteredPresets = filterEcosystemItems(presets, searchQuery);

  return (
    <View style={styles.container}>
      <View style={styles.searchSection}>
        <TextField
          label=""
          placeholder={t("apps.searchPlaceholder")}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
      >
        {filteredPresets.length === 0 && !loading ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
              {searchQuery.trim()
                ? t("apps.searchEmpty", { query: searchQuery.trim() })
                : t("mcp.empty")}
            </Text>
          </View>
        ) : (
          filteredPresets.map((preset) => {
            const isOAuth = preset.auth === "oauth" || preset.transport === "oauth";
            const toolCount = preset.tool_count ?? preset.tool_names?.length ?? 0;
            const failureReason = (preset as any).failure_reason || preset.error;
            const isFailed = preset.runtime_status === "failed" || !!failureReason;
            const isNpxCacheBroken =
              (preset as any).error_hint === "npx_cache_broken" ||
              failureReason?.includes("ERR_MODULE_NOT_FOUND") ||
              failureReason?.includes("npm ERR");
            const lockReason = getLockReason(preset);

            return (
              <Pressable
                key={preset.name}
                style={[
                  styles.card,
                  { backgroundColor: th.colors.card, borderColor: th.colors.border, borderRadius: th.radius.md },
                ]}
                onPress={() => setSelectedPreset(preset)}
                accessibilityRole="button"
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderTexts}>
                    <Text
                      style={[
                        styles.presetName,
                        { color: th.colors.foreground, fontFamily: th.font.displayBold },
                      ]}
                    >
                      {preset.display_name || preset.name}
                    </Text>
                    <View style={styles.badgeRow}>
                      <View
                        style={[
                          styles.badge,
                          {
                            backgroundColor: preset.enabled ? th.colors.brandSoft : th.colors.muted,
                            borderRadius: th.radius.sm,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            {
                              color: preset.enabled
                                ? th.colors.brandSoftForeground
                                : th.colors.mutedForeground,
                              fontFamily: th.font.medium,
                            },
                          ]}
                        >
                          {preset.enabled ? t("mcp.enabled") : t("mcp.disabled")}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.badge,
                          {
                            backgroundColor: preset.configured
                              ? th.colors.brandSoft
                              : th.colors.muted,
                            borderRadius: th.radius.sm,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            {
                              color: preset.configured
                                ? th.colors.brandSoftForeground
                                : th.colors.mutedForeground,
                              fontFamily: th.font.medium,
                            },
                          ]}
                        >
                          {preset.configured ? t("mcp.configured") : t("mcp.notConfigured")}
                        </Text>
                      </View>
                      <Text style={[styles.toolCount, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                        {t("mcp.toolsCount", { count: toolCount })}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={!!preset.enabled}
                    disabled={!privileged}
                    onValueChange={(val) => void handleToggle(preset, val)}
                    trackColor={{ false: th.colors.muted, true: th.colors.primary }}
                  />
                </View>

                {preset.description ? (
                  <Text
                    style={[styles.description, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}
                    numberOfLines={2}
                  >
                    {preset.description}
                  </Text>
                ) : null}

                {isFailed && failureReason ? (
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
                ) : null}

                {lockReason ? (
                  <View style={styles.lockRow}>
                    <MaterialCommunityIcons name="lock-outline" size={14} color={th.colors.mutedForeground} />
                    <Text style={[styles.lockText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                      {lockReason}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.actionsRow}>
                  {isOAuth ? (
                    <Button
                      title={t("mcp.oauth")}
                      variant="secondary"
                      onPress={() => setOauthPresetName(preset.name)}
                    />
                  ) : null}
                  <Button
                    title={t("mcp.test")}
                    variant="secondary"
                    onPress={() => void handleTest(preset)}
                  />
                  <Button
                    title={t("mcp.reconnect")}
                    variant="secondary"
                    onPress={() => void handleReconnect(preset)}
                  />
                  <Button
                    title={t("mcp.remove")}
                    variant="destructive"
                    onPress={() => setRemoveTarget(preset)}
                  />
                </View>
              </Pressable>
            );
          })
        )}

        <View style={styles.noteContainer}>
          <Text style={[styles.noteText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
            {t("mcp.note")}
          </Text>
        </View>
      </ScrollView>

      <McpSheet
        open={!!selectedPreset}
        preset={selectedPreset}
        enable={enable}
        test={testPreset}
        tools={tools}
        onClose={() => setSelectedPreset(null)}
        onOpenOAuth={(name) => {
          setSelectedPreset(null);
          setOauthPresetName(name);
        }}
      />

      <McpOAuthSheet
        open={!!oauthPresetName}
        presetName={oauthPresetName || ""}
        onClose={() => setOauthPresetName(null)}
        onDone={() => void refresh()}
      />

      <Dialog
        open={!!enableTarget}
        title={t("mcp.enableTitle")}
        message={t("mcp.enableMessage", { name: enableTarget?.display_name || enableTarget?.name || "" })}
        confirmLabel={t("apps.confirm")}
        cancelLabel={t("apps.cancel")}
        onConfirm={() => void handleConfirmEnable()}
        onCancel={() => setEnableTarget(null)}
      />

      <Dialog
        open={!!removeTarget}
        title={t("mcp.removeTitle")}
        message={t("mcp.removeMessage", { name: removeTarget?.display_name || removeTarget?.name || "" })}
        destructive
        confirmLabel={t("apps.confirm")}
        cancelLabel={t("apps.cancel")}
        onConfirm={() => void handleConfirmRemove()}
        onCancel={() => setRemoveTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
  },
  card: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  cardHeaderTexts: {
    flex: 1,
    marginRight: 12,
  },
  presetName: {
    fontSize: 17,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 13,
  },
  toolCount: {
    fontSize: 13,
    marginLeft: 2,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  failureBox: {
    padding: 10,
    gap: 4,
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
  lockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  lockText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
    minHeight: 48,
    alignItems: "center",
  },
  noteContainer: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  noteText: {
    fontSize: 13,
    textAlign: "center",
  },
});
