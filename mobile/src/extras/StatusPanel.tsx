import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { SettingsPayload } from "@/lib/types";
import type { VersionCheckResult } from "@/lib/api";
import { useT } from "../i18n";
import { useSession } from "../state/sessionStore";
import { Sheet } from "../ui/components/Sheet";
import { useTheme } from "../ui/ThemeProvider";

export type StatusPanelProps = {
  open: boolean;
  onClose: () => void;
};

type StatusData = {
  version: string;
  activePreset: string;
  updateAvailable: string | null;
  totalTokens: string;
};

export function StatusPanel({ open, onClose }: StatusPanelProps) {
  const t = useT();
  const th = useTheme();
  const { session, state, profile } = useSession();

  const [data, setData] = useState<StatusData>({
    version: "—",
    activePreset: "—",
    updateAvailable: null,
    totalTokens: "—",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !session) return;
    setLoading(true);

    const fetchSettings = session
      .get<SettingsPayload>("/api/settings")
      .then((res) => ({
        version: res?.version?.current ?? "—",
        activePreset: res?.model_presets?.find((p) => p.active)?.name ?? "—",
      }))
      .catch(() => ({ version: "—", activePreset: "—" }));

    const fetchVersionCheck = session
      .get<VersionCheckResult>("/api/settings/version-check")
      .then((res) => res?.updateAvailable?.latestVersion ?? null)
      .catch(() => null);

    const fetchUsage = session
      .get<NonNullable<SettingsPayload["usage"]>>("/api/settings/usage")
      .then((res) => {
        const tokens = res?.total_tokens ?? res?.total_tokens_30d;
        return tokens != null ? tokens.toLocaleString() : "—";
      })
      .catch(() => "—");

    Promise.all([fetchSettings, fetchVersionCheck, fetchUsage]).then(
      ([settings, updateVer, tokens]) => {
        setData({
          version: settings.version,
          activePreset: settings.activePreset,
          updateAvailable: updateVer,
          totalTokens: tokens,
        });
        setLoading(false);
      },
    );
  }, [open, session]);

  return (
    <Sheet open={open} onClose={onClose} title={t("extras.status.title")}>
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: th.colors.mutedForeground }]}>
            {t("extras.status.connectionState")}
          </Text>
          <Text style={[styles.value, { color: th.colors.foreground, fontFamily: th.font.medium }]}>
            {t(`extras.status.${state}`, { defaultValue: state })}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={[styles.label, { color: th.colors.mutedForeground }]}>
            {t("extras.status.serverUrl")}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.value, { color: th.colors.foreground, fontFamily: th.font.regular }]}
          >
            {profile?.baseUrl ?? "—"}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={[styles.label, { color: th.colors.mutedForeground }]}>
            {t("extras.status.version")}
          </Text>
          <Text style={[styles.value, { color: th.colors.foreground, fontFamily: th.font.regular }]}>
            {loading ? "…" : data.version}
          </Text>
        </View>

        {data.updateAvailable ? (
          <View style={[styles.updateBox, { backgroundColor: th.colors.accent, borderRadius: th.radius.sm }]}>
            <Text style={{ color: th.colors.accentForeground, fontFamily: th.font.medium, fontSize: 13 }}>
              {t("extras.status.updateAvailable", { version: data.updateAvailable })}
            </Text>
          </View>
        ) : null}

        <View style={styles.row}>
          <Text style={[styles.label, { color: th.colors.mutedForeground }]}>
            {t("extras.status.activePreset")}
          </Text>
          <Text style={[styles.value, { color: th.colors.foreground, fontFamily: th.font.regular }]}>
            {loading ? "…" : data.activePreset}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={[styles.label, { color: th.colors.mutedForeground }]}>
            {t("extras.status.usage")}
          </Text>
          <Text style={[styles.value, { color: th.colors.foreground, fontFamily: th.font.regular }]}>
            {loading ? "…" : data.totalTokens}
          </Text>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingVertical: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 14,
  },
  value: {
    fontSize: 14,
    maxWidth: "60%",
    textAlign: "right",
  },
  updateBox: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
