import React, { useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useT } from "../../../i18n";
import { Button, Dialog } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { toast } from "../../../ui/components/Toast";
import { useCliApps } from "../../../ecosystem/apps";
import { isPolicyError } from "../../../ecosystem/common";
import type { CliAppInfo } from "@/lib/types";

export function CliAppsTab({ gateAllowed }: { gateAllowed: boolean }) {
  const t = useT();
  const th = useTheme();
  const { apps, loading, refresh, install, update, uninstall, test: testApp } = useCliApps();

  const [loadingApp, setLoadingApp] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "install" | "update" | "uninstall";
    app: CliAppInfo | null;
  }>({
    open: false,
    type: "install",
    app: null,
  });

  const handleOpenConfirm = (type: "install" | "update" | "uninstall", app: CliAppInfo) => {
    setConfirmDialog({ open: true, type, app });
  };

  const handleConfirmAction = async () => {
    const { type, app } = confirmDialog;
    setConfirmDialog({ open: false, type: "install", app: null });
    if (!app) return;

    setLoadingApp(app.name);
    try {
      let res: { timedOut: boolean; result?: any } | undefined;
      if (type === "install") {
        res = await install(app.name);
      } else if (type === "update") {
        res = await update(app.name);
      } else if (type === "uninstall") {
        res = await uninstall(app.name);
      }

      if (res?.timedOut) {
        toast.show(t("apps.timedOut"));
      }
    } catch (e) {
      if (isPolicyError(e)) {
        toast.show(t("apps.gateBanner"));
      } else {
        toast.show(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoadingApp(null);
    }
  };

  const handleTest = async (app: CliAppInfo) => {
    setLoadingApp(app.name);
    try {
      await testApp(app.name);
      toast.show(t("common.success", "Success"));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingApp(null);
    }
  };

  const appName = confirmDialog.app?.display_name || confirmDialog.app?.name || "";
  const getDialogTitle = () => {
    switch (confirmDialog.type) {
      case "install":
        return t("apps.installTitle");
      case "update":
        return t("apps.updateTitle");
      case "uninstall":
        return t("apps.uninstallTitle");
    }
  };
  const getDialogMessage = () => {
    switch (confirmDialog.type) {
      case "install":
        return t("apps.installMessage", { name: appName });
      case "update":
        return t("apps.updateMessage", { name: appName });
      case "uninstall":
        return t("apps.uninstallMessage", { name: appName });
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
      >
        {apps.length === 0 && !loading ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: th.colors.mutedForeground }]}>
              {t("apps.empty")}
            </Text>
          </View>
        ) : (
          apps.map((app) => {
            const isOperating = loadingApp === app.name;
            const version = app.manifest?.version || (app as any).version;
            const statusKey = `apps.status.${app.status}`;
            const statusLabel = t(statusKey, app.status);

            return (
              <View
                key={app.name}
                style={[
                  styles.card,
                  { backgroundColor: th.colors.card, borderColor: th.colors.border },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderTexts}>
                    <Text
                      style={[
                        styles.appName,
                        { color: th.colors.foreground, fontFamily: th.font.medium },
                      ]}
                    >
                      {app.display_name || app.name}
                    </Text>
                    {version ? (
                      <Text style={[styles.appVersion, { color: th.colors.mutedForeground }]}>
                        {t("apps.version", { version })}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          app.installed || app.status === "installed"
                            ? th.colors.accent
                            : th.colors.muted,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color:
                            app.installed || app.status === "installed"
                              ? th.colors.accentForeground
                              : th.colors.mutedForeground,
                        },
                      ]}
                    >
                      {statusLabel}
                    </Text>
                  </View>
                </View>

                {app.description ? (
                  <Text
                    style={[styles.appDescription, { color: th.colors.mutedForeground }]}
                    numberOfLines={2}
                  >
                    {app.description}
                  </Text>
                ) : null}

                <View style={styles.cardActions}>
                  {isOperating ? (
                    <View style={styles.spinnerWrapper}>
                      <ActivityIndicator color={th.colors.primary} />
                    </View>
                  ) : app.installed || app.status === "installed" ? (
                    <View style={styles.buttonsRow}>
                      <Button
                        title={t("apps.test")}
                        variant="secondary"
                        onPress={() => void handleTest(app)}
                      />
                      <Button
                        title={t("apps.update")}
                        variant="secondary"
                        disabled={!gateAllowed}
                        onPress={() => handleOpenConfirm("update", app)}
                      />
                      <Button
                        title={t("apps.uninstall")}
                        variant="destructive"
                        disabled={!gateAllowed}
                        onPress={() => handleOpenConfirm("uninstall", app)}
                      />
                    </View>
                  ) : (
                    <View style={styles.buttonsRow}>
                      <Button
                        title={t("apps.install")}
                        variant="primary"
                        disabled={!gateAllowed}
                        onPress={() => handleOpenConfirm("install", app)}
                      />
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Dialog
        open={confirmDialog.open}
        title={getDialogTitle()}
        message={getDialogMessage()}
        destructive={confirmDialog.type === "uninstall"}
        confirmLabel={t("apps.confirm")}
        cancelLabel={t("apps.cancel")}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmDialog({ open: false, type: "install", app: null })}
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
  },
  appName: {
    fontSize: 16,
  },
  appVersion: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500",
  },
  appDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
    minHeight: 48,
    alignItems: "center",
  },
  spinnerWrapper: {
    paddingHorizontal: 16,
  },
  buttonsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
});
