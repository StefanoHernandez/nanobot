import React, { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useT } from "../../../i18n";
import { useSettings } from "../../../settings/store";
import { channelDisable, channelEnable } from "../../../ecosystem/channels";
import { Dialog, toast } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { installGate, toastEcosystemError } from "../../../ecosystem/common";
import type { NanobotFeatureInfo } from "@/lib/types";

export type ChannelRowProps = {
  channel: NanobotFeatureInfo;
  onPress: () => void;
  onRefresh?: () => void;
};

export function ChannelRow({ channel, onPress, onRefresh }: ChannelRowProps) {
  const t = useT();
  const th = useTheme();
  const { mutate, data: settings } = useSettings();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const gateAllowed = installGate(settings).allowed;

  const isFailed = !!channel.runtime_error || channel.runtime_status === "failed";
  const isRunning = !!channel.running || channel.runtime_status === "running";
  const isStarting = channel.runtime_status === "starting";
  const isDisabled = !channel.enabled;

  let statusLabel = t("channels.status.stopped");
  let statusBg = th.colors.muted;
  let statusFg = th.colors.mutedForeground;

  if (isFailed) {
    statusLabel = t("channels.status.failed");
    statusBg = th.colors.destructive;
    statusFg = th.colors.destructiveForeground;
  } else if (isRunning) {
    statusLabel = t("channels.status.running");
    statusBg = th.colors.brandSoft;
    statusFg = th.colors.brandSoftForeground;
  } else if (isStarting) {
    statusLabel = t("channels.status.starting");
    statusBg = th.colors.brandSoft;
    statusFg = th.colors.brandSoftForeground;
  } else if (isDisabled) {
    statusLabel = t("channels.status.disabled");
    statusBg = th.colors.muted;
    statusFg = th.colors.mutedForeground;
  }

  const doToggle = async (value: boolean) => {
    setLoading(true);
    try {
      if (value) {
        const res = await channelEnable(mutate, channel.name);
        if (res?.timedOut) {
          toast.show(t("apps.timedOut"));
        }
      } else {
        await channelDisable(mutate, channel.name);
      }
      onRefresh?.();
    } catch (e: any) {
      toastEcosystemError(e, t);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (value: boolean) => {
    if (value) {
      setConfirmOpen(true);
    } else {
      void doToggle(false);
    }
  };

  const handleConfirmEnable = () => {
    setConfirmOpen(false);
    void doToggle(true);
  };

  const instancesText =
    channel.instances && channel.instances.length > 0
      ? `${t("channels.instances")}: ${channel.instances.map((i) => i.display_name || i.name).join(", ")}`
      : null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: pressed ? th.colors.accent : "transparent",
          },
        ]}
      >
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={[styles.name, { color: th.colors.foreground, fontFamily: th.font.medium }]}>
              {channel.display_name || channel.name}
            </Text>
            <View style={[styles.chip, { backgroundColor: statusBg, borderRadius: th.radius.sm }]}>
              <Text style={[styles.chipText, { color: statusFg, fontFamily: th.font.medium }]}>{statusLabel}</Text>
            </View>
          </View>
          {instancesText ? (
            <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, marginTop: 4 }}>
              {instancesText}
            </Text>
          ) : null}
          {!gateAllowed && !channel.enabled ? (
            <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, marginTop: 4 }}>
              {t("apps.gateBanner")}
            </Text>
          ) : null}
        </View>
        <View style={styles.switchWrapper}>
          <Switch
            value={channel.enabled}
            disabled={loading || (!channel.enabled && !gateAllowed)}
            accessibilityHint={!gateAllowed && !channel.enabled ? t("apps.gateBanner") : undefined}
            onValueChange={(val) => void handleToggle(val)}
            trackColor={{ false: th.colors.muted, true: th.colors.primary }}
          />
        </View>
      </Pressable>

      <Dialog
        open={confirmOpen}
        title={t("channels.enableTitle")}
        message={t("channels.enableMessage", { name: channel.display_name || channel.name })}
        confirmLabel={t("apps.confirm")}
        cancelLabel={t("apps.cancel")}
        onConfirm={handleConfirmEnable}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  body: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 16 },
  chip: { paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 13 },
  switchWrapper: { minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center" },
});
