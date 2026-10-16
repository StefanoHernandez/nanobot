import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useT } from "../../i18n";
import { useRestart } from "../../settings/store";
import { Button, Dialog, IconButton, ListItem } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { useBackups, type BackupItem } from "../../extras/backup";
import { formatByteSize } from "../../extras/exportChat";
import { Head } from "./common";

function formatBackupDate(ms: number): string {
  if (!ms || isNaN(ms)) return "—";
  try {
    const d = new Date(ms);
    if (isNaN(d.getTime())) return "—";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  } catch {
    return "—";
  }
}

export function BackupSection() {
  const t = useT();
  const th = useTheme();
  const { data, loading, creating, acting, error, refresh, create, remove, restore } = useBackups();
  const { run: runRestart } = useRestart();

  const [toDelete, setToDelete] = useState<string | null>(null);
  const [toRestore, setToRestore] = useState<BackupItem | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const backups = data?.backups ?? [];
  const diskFreeText = data?.disk_free != null ? formatByteSize(data.disk_free) : null;
  const showWorkspaceWarning = data?.workspace_included === false;

  return (
    <>
      {error ? (
        <View
          style={{
            backgroundColor: th.colors.card,
            borderColor: th.colors.destructive,
            borderWidth: 1,
            padding: 12,
            marginHorizontal: 16,
            marginTop: 12,
            borderRadius: th.radius.md,
          }}
        >
          <Text style={{ color: th.colors.destructive, fontFamily: th.font.regular, fontSize: 13 }}>
            {t(error)}
          </Text>
        </View>
      ) : null}

      {showWorkspaceWarning ? (
        <View
          style={{
            backgroundColor: th.colors.card,
            borderColor: th.colors.brand,
            borderWidth: 1,
            padding: 12,
            marginHorizontal: 16,
            marginTop: 12,
            borderRadius: th.radius.md,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <MaterialCommunityIcons name="alert-outline" size={20} color={th.colors.brand} />
          <Text
            style={{
              flex: 1,
              color: th.colors.foreground,
              fontFamily: th.font.regular,
              fontSize: 13,
              lineHeight: 18,
            }}
          >
            {t("backup.workspaceExcludedWarning")}
          </Text>
        </View>
      ) : null}

      {diskFreeText ? (
        <View style={{ marginHorizontal: 16, marginTop: 12 }}>
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
            {t("backup.diskFree")}: {diskFreeText}
          </Text>
        </View>
      ) : null}

      <View style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
        <Button
          title={creating ? t("backup.creating") : t("backup.createNow")}
          loading={creating}
          disabled={creating || !!acting}
          onPress={() => void create()}
        />
      </View>

      <Head>{t("backup.title")}</Head>
      <View
        style={{
          backgroundColor: th.colors.card,
          borderRadius: th.radius.md,
          marginHorizontal: 16,
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        {loading && backups.length === 0 ? (
          <View style={{ padding: 24, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={th.colors.primary} />
          </View>
        ) : backups.length === 0 ? (
          <View style={{ padding: 16, minHeight: 48, justifyContent: "center" }}>
            <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 14 }}>
              {t("backup.empty")}
            </Text>
          </View>
        ) : (
          backups.map((b, idx) => {
            const isFirst = idx === 0;
            const dateStr = formatBackupDate(b.created_at);
            const sizeStr = formatByteSize(b.size);
            const subtitle = `${dateStr} · ${sizeStr}`;
            const isActing = acting === b.name;

            return (
              <View
                key={b.name}
                testID="backup-item"
                style={
                  idx > 0
                    ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }
                    : undefined
                }
              >
                <ListItem
                  title={b.name}
                  subtitle={subtitle}
                  right={
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      {isFirst ? (
                        <View
                          style={{
                            backgroundColor: th.colors.brandSoft,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 12,
                            marginRight: 4,
                          }}
                        >
                          <Text
                            style={{
                              color: th.colors.brandSoftForeground,
                              fontFamily: th.font.medium,
                              fontSize: 11,
                            }}
                          >
                            {t("backup.latest")}
                          </Text>
                        </View>
                      ) : null}

                      {isActing ? (
                        <ActivityIndicator size="small" color={th.colors.primary} />
                      ) : (
                        <>
                          <View testID="backup-restore-btn">
                            <IconButton
                              icon="backup-restore"
                              accessibilityLabel={t("backup.restore")}
                              onPress={() => setToRestore(b)}
                              disabled={creating || !!acting}
                            />
                          </View>
                          <View testID="backup-delete-btn">
                            <IconButton
                              icon="delete-outline"
                              accessibilityLabel={t("backup.delete")}
                              onPress={() => setToDelete(b.name)}
                              disabled={creating || !!acting}
                            />
                          </View>
                        </>
                      )}
                    </View>
                  }
                />
              </View>
            );
          })
        )}
      </View>

      {/* Delete confirmation dialog */}
      <Dialog
        open={toDelete !== null}
        destructive
        title={t("backup.deleteConfirmTitle")}
        message={t("backup.deleteConfirmMessage", { name: toDelete ?? "" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          const name = toDelete;
          setToDelete(null);
          if (name) {
            await remove(name);
          }
        }}
      />

      {/* Strong restore confirmation dialog */}
      <Dialog
        open={toRestore !== null}
        destructive
        title={t("backup.restoreConfirmTitle")}
        message={t("backup.restoreConfirmMessage", {
          date: toRestore ? formatBackupDate(toRestore.created_at) : "",
        })}
        confirmLabel={t("backup.restoreConfirm")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setToRestore(null)}
        onConfirm={async () => {
          const item = toRestore;
          setToRestore(null);
          if (item) {
            const res = await restore(item.name);
            if (res?.restart_required) {
              void runRestart();
            }
          }
        }}
      />
    </>
  );
}
