import React, { useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useT } from "../../../i18n";
import { Button, Dialog, TextField } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { toast } from "../../../ui/components/Toast";
import { useCliApps } from "../../../ecosystem/apps";
import { toastEcosystemError } from "../../../ecosystem/common";
import { usePrivileged } from "../../../ecosystem/privilege";
import { filterEcosystemItems } from "./search";
import type { CliAppInfo } from "@/lib/types";

export function CliAppsTab({ gateAllowed }: { gateAllowed: boolean }) {
  const t = useT();
  const th = useTheme();
  const { apps, loading, refresh, install, update, uninstall, test: testApp } = useCliApps();
  const privileged = usePrivileged();

  const [searchQuery, setSearchQuery] = useState("");
  const [inFlightApps, setInFlightApps] = useState<Set<string>>(new Set());
  const [appErrors, setAppErrors] = useState<Record<string, { code?: string; message?: string }>>({});
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

    setInFlightApps((prev) => new Set(prev).add(app.name));
    try {
      let res: { timedOut: boolean; result?: any } | undefined;
      if (type === "install") {
        res = await install(app.name);
      } else if (type === "update") {
        res = await update(app.name);
      } else if (type === "uninstall") {
        res = await uninstall(app.name);
      }
      setAppErrors((prev) => {
        const next = { ...prev };
        delete next[app.name];
        return next;
      });

      if (res?.timedOut) {
        toast.show(t("apps.timedOut"));
      }
    } catch (e) {
      const code = (e as any)?.code;
      const message = (e as any)?.message;
      setAppErrors((prev) => ({ ...prev, [app.name]: { code, message } }));
      toastEcosystemError(e, t);
    } finally {
      setInFlightApps((prev) => {
        const next = new Set(prev);
        next.delete(app.name);
        return next;
      });
    }
  };

  const handleTest = async (app: CliAppInfo) => {
    setInFlightApps((prev) => new Set(prev).add(app.name));
    try {
      await testApp(app.name);
      setAppErrors((prev) => {
        const next = { ...prev };
        delete next[app.name];
        return next;
      });
      toast.show(t("common.success", "Success"));
    } catch (e) {
      const code = (e as any)?.code;
      const message = (e as any)?.message;
      setAppErrors((prev) => ({ ...prev, [app.name]: { code, message } }));
      toastEcosystemError(e, t);
    } finally {
      setInFlightApps((prev) => {
        const next = new Set(prev);
        next.delete(app.name);
        return next;
      });
    }
  };

  const getLockReason = (app: CliAppInfo): string | null => {
    const isInstalled = app.installed || app.status === "installed";
    const err = appErrors[app.name];
    const code = err?.code;
    if (code === "full_power_required") return t("apps.lockFullPower");
    if (code === "remote_install_disabled") return t("apps.lockRemoteDisabled");
    if (code === "unsupported_install_env") {
      const rawMsg = err?.message || "";
      const cmdMatch = rawMsg.match(/`([^`]+)`/);
      return t("apps.lockUnsupportedEnv", { command: cmdMatch ? cmdMatch[1] : "" });
    }
    if (!isInstalled) {
      if (!privileged) return t("apps.lockFullPower");
      if (!gateAllowed) return t("apps.lockRemoteDisabled");
    }
    return null;
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

  const filteredApps = filterEcosystemItems(apps, searchQuery);

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
        {filteredApps.length === 0 && !loading ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
              {searchQuery.trim()
                ? t("apps.searchEmpty", { query: searchQuery.trim() })
                : t("apps.empty")}
            </Text>
          </View>
        ) : (
          filteredApps.map((app) => {
            const isOperating = inFlightApps.has(app.name);
            const version = app.manifest?.version || (app as any).version;
            const statusKey = `apps.status.${app.status}`;
            const statusLabel = t(statusKey, app.status);
            const lockReason = getLockReason(app);

            return (
              <View
                key={app.name}
                style={[
                  styles.card,
                  { backgroundColor: th.colors.card, borderColor: th.colors.border, borderRadius: th.radius.md },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderTexts}>
                    <Text
                      style={[
                        styles.appName,
                        { color: th.colors.foreground, fontFamily: th.font.displayBold },
                      ]}
                    >
                      {app.display_name || app.name}
                    </Text>
                    {version ? (
                      <Text style={[styles.appVersion, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
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
                            ? th.colors.brandSoft
                            : th.colors.muted,
                        borderRadius: th.radius.sm,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color:
                            app.installed || app.status === "installed"
                              ? th.colors.brandSoftForeground
                              : th.colors.mutedForeground,
                          fontFamily: th.font.medium,
                        },
                      ]}
                    >
                      {statusLabel}
                    </Text>
                  </View>
                </View>

                {app.description ? (
                  <Text
                    style={[styles.appDescription, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}
                    numberOfLines={2}
                  >
                    {app.description}
                  </Text>
                ) : null}

                {lockReason ? (
                  <View style={styles.lockRow}>
                    <MaterialCommunityIcons name="lock-outline" size={14} color={th.colors.mutedForeground} />
                    <Text style={[styles.lockText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                      {lockReason}
                    </Text>
                  </View>
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
  },
  appName: {
    fontSize: 17,
  },
  appVersion: {
    fontSize: 13,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 13,
  },
  appDescription: {
    fontSize: 14,
    lineHeight: 20,
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
