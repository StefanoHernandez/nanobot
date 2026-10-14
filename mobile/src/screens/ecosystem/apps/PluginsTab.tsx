import React, { useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useT } from "../../../i18n";
import { Button, Dialog } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { toast } from "../../../ui/components/Toast";
import { useRestart } from "../../../settings/store";
import { useFeatures } from "../../../ecosystem/apps";
import { toastEcosystemError } from "../../../ecosystem/common";
import type { NanobotFeatureInfo } from "@/lib/types";

export function PluginsTab({ gateAllowed }: { gateAllowed: boolean }) {
  const t = useT();
  const th = useTheme();
  const { features, requiresRestart, loading, refresh, enable, disable } = useFeatures();
  const { run: runRestart, state: restartState } = useRestart();

  const [confirmFeature, setConfirmFeature] = useState<NanobotFeatureInfo | null>(null);
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (restartState === "done") {
      void refresh();
    }
  }, [restartState, refresh]);

  const handleToggle = async (feature: NanobotFeatureInfo, value: boolean) => {
    if (inFlight.has(feature.name)) return;
    if (value) {
      setConfirmFeature(feature);
    } else {
      setInFlight((prev) => new Set(prev).add(feature.name));
      try {
        await disable(feature.name);
      } catch (e) {
        toastEcosystemError(e, t);
      } finally {
        setInFlight((prev) => {
          const next = new Set(prev);
          next.delete(feature.name);
          return next;
        });
      }
    }
  };

  const handleConfirmEnable = async () => {
    const f = confirmFeature;
    setConfirmFeature(null);
    if (!f || inFlight.has(f.name)) return;

    setInFlight((prev) => new Set(prev).add(f.name));
    try {
      const res = await enable(f.name);
      if (res?.timedOut) {
        toast.show(t("apps.timedOut"));
      }
    } catch (e) {
      toastEcosystemError(e, t);
    } finally {
      setInFlight((prev) => {
        const next = new Set(prev);
        next.delete(f.name);
        return next;
      });
    }
  };

  const isRestarting = restartState === "restarting";

  return (
    <View style={styles.container}>
      {requiresRestart ? (
        <View style={[styles.restartBanner, { backgroundColor: th.colors.brandSoft, borderRadius: th.radius.md }]}>
          <Text style={[styles.restartText, { color: th.colors.brandSoftForeground, fontFamily: th.font.medium }]}>
            {t("plugins.restartRequired")}
          </Text>
          <Button
            title={t("plugins.restart")}
            variant="secondary"
            loading={isRestarting}
            onPress={() => void runRestart()}
          />
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
      >
        {features.length === 0 && !loading ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
              {t("plugins.empty")}
            </Text>
          </View>
        ) : (
          features.map((feature) => {
            const isInFlight = inFlight.has(feature.name);
            const canEnable = gateAllowed;
            const switchDisabled = (!feature.enabled && !canEnable) || isInFlight;

            return (
              <View
                key={feature.name}
                style={[
                  styles.card,
                  { backgroundColor: th.colors.card, borderColor: th.colors.border, borderRadius: th.radius.md },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.texts}>
                    <Text
                      style={[
                        styles.featureName,
                        { color: th.colors.foreground, fontFamily: th.font.displayBold },
                      ]}
                    >
                      {feature.display_name || feature.name}
                    </Text>
                    {(feature as any).description ? (
                      <Text
                        style={[styles.featureDesc, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}
                        numberOfLines={2}
                      >
                        {(feature as any).description}
                      </Text>
                    ) : null}
                  </View>
                  {isInFlight ? (
                    <ActivityIndicator color={th.colors.primary} style={{ marginRight: 8 }} />
                  ) : null}
                  <Switch
                    value={feature.enabled}
                    disabled={switchDisabled}
                    onValueChange={(val) => void handleToggle(feature, val)}
                    trackColor={{ false: th.colors.muted, true: th.colors.primary }}
                  />
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Dialog
        open={!!confirmFeature}
        title={t("plugins.enableTitle")}
        message={t("plugins.enableMessage", {
          name: confirmFeature?.display_name || confirmFeature?.name || "",
        })}
        confirmLabel={t("apps.confirm")}
        cancelLabel={t("apps.cancel")}
        onConfirm={() => void handleConfirmEnable()}
        onCancel={() => setConfirmFeature(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  restartBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 14,
    gap: 8,
  },
  restartText: {
    fontSize: 15,
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
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
  },
  texts: {
    flex: 1,
    marginRight: 12,
  },
  featureName: {
    fontSize: 17,
  },
  featureDesc: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
});
