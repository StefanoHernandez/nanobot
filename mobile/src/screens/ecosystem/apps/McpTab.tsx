import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useT } from "../../../i18n";
import { Button, Dialog } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { toast } from "../../../ui/components/Toast";
import { useMcp } from "../../../ecosystem/mcp";
import { toastEcosystemError } from "../../../ecosystem/common";
import { McpSheet } from "./McpSheet";
import { McpOAuthSheet } from "./McpOAuthSheet";
import type { McpPresetInfo } from "@/lib/types";

export function McpTab({ gateAllowed }: { gateAllowed: boolean }) {
  const t = useT();
  const th = useTheme();
  const { presets, loading, refresh, enable, disable, remove, test: testPreset, reconnect, tools } = useMcp();

  const [selectedPreset, setSelectedPreset] = useState<McpPresetInfo | null>(null);
  const [oauthPresetName, setOauthPresetName] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<McpPresetInfo | null>(null);
  const [enableTarget, setEnableTarget] = useState<McpPresetInfo | null>(null);

  const handleToggle = async (preset: McpPresetInfo, value: boolean) => {
    if (value) {
      setEnableTarget(preset);
    } else {
      try {
        await disable(preset.name);
      } catch (e) {
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
    } catch (e) {
      toastEcosystemError(e, t);
    }
  };

  const handleTest = async (preset: McpPresetInfo) => {
    try {
      await testPreset(preset.name);
      toast.show(t("common.success", "Success"));
    } catch (e) {
      toastEcosystemError(e, t);
    }
  };

  const handleReconnect = async (preset: McpPresetInfo) => {
    try {
      await reconnect(preset.name);
      toast.show(t("common.success", "Success"));
    } catch (e) {
      toastEcosystemError(e, t);
    }
  };

  const handleConfirmRemove = async () => {
    const target = removeTarget;
    setRemoveTarget(null);
    if (!target) return;

    try {
      await remove(target.name);
    } catch (e) {
      toastEcosystemError(e, t);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
      >
        {presets.length === 0 && !loading ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
              {t("mcp.empty")}
            </Text>
          </View>
        ) : (
          presets.map((preset) => {
            const isOAuth = preset.auth === "oauth" || preset.transport === "oauth";
            const toolCount = preset.tool_count ?? preset.tool_names?.length ?? 0;
            const switchDisabled = !gateAllowed && !preset.enabled;

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
                    disabled={switchDisabled}
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
        gateAllowed={gateAllowed}
        enable={enable}
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
        message={t("mcp.enableMessage", {
          name: enableTarget?.display_name || enableTarget?.name || "",
        })}
        confirmLabel={t("apps.confirm")}
        cancelLabel={t("apps.cancel")}
        onConfirm={() => void handleConfirmEnable()}
        onCancel={() => setEnableTarget(null)}
      />

      <Dialog
        open={!!removeTarget}
        title={t("mcp.removeTitle")}
        message={t("mcp.removeMessage", {
          name: removeTarget?.display_name || removeTarget?.name || "",
        })}
        destructive={true}
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
