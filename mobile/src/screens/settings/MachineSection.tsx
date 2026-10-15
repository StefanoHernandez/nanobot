import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useT, i18n } from "../../i18n";
import { useRestart } from "../../settings/store";
import { Dialog, ListItem } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { formatDuration, temperatureColor, useSystemStats } from "../../extras/system";
import { Head } from "./common";

function GaugeRow({
  label,
  value,
  pct,
  testID,
  valueColor,
}: {
  label: string;
  value: string;
  pct?: number | null;
  testID?: string;
  valueColor?: string;
}) {
  const th = useTheme();
  const widthPct = pct != null ? Math.min(100, Math.max(0, pct)) : null;

  return (
    <View testID={testID} style={{ paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, justifyContent: "center" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: widthPct != null ? 8 : 0 }}>
        <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 14 }}>{label}</Text>
        <Text style={{ color: valueColor ?? th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 14 }}>{value}</Text>
      </View>
      {widthPct != null ? (
        <View style={{ height: 6, backgroundColor: th.colors.muted, borderRadius: 3, overflow: "hidden" }}>
          <View style={{ height: "100%", width: `${widthPct}%`, backgroundColor: th.colors.primary, borderRadius: 3 }} />
        </View>
      ) : null}
    </View>
  );
}

export function MachineSection() {
  const t = useT();
  const th = useTheme();
  const { data, error } = useSystemStats();
  const { run } = useRestart();
  const [confirmRestart, setConfirmRestart] = useState(false);

  const lang = i18n.language.startsWith("it") ? "it" : "en";

  const cpuText = data?.cpu_percent != null ? `${data.cpu_percent}%` : "—";
  const ramText = data?.memory ? `${data.memory.used_mb} / ${data.memory.total_mb} MB` : "—";
  const ramPct = data?.memory?.total_mb ? (data.memory.used_mb / data.memory.total_mb) * 100 : null;

  const hasSwap = (data?.memory?.swap_total_mb ?? 0) > 0;
  const swapText = data?.memory && hasSwap ? `${data.memory.swap_used_mb} / ${data.memory.swap_total_mb} MB` : "—";
  const swapPct = data?.memory && hasSwap ? (data.memory.swap_used_mb / data.memory.swap_total_mb) * 100 : null;

  const diskText = data?.disk
    ? `${data.disk.used_gb} / ${data.disk.total_gb} GB (${data.disk.free_gb} GB ${t("machine.free")})`
    : "—";
  const diskPct = data?.disk?.total_gb ? (data.disk.used_gb / data.disk.total_gb) * 100 : null;

  const tempText = data?.temperature_c != null ? `${data.temperature_c} °C` : "—";
  const tempColor = temperatureColor(data?.temperature_c, th);

  const loadText = data?.load ? data.load.join("  ·  ") : "—";
  const coresText = data?.cores != null ? t("machine.cores", { count: data.cores }) : undefined;

  const machineUptime = formatDuration(data?.uptime_s, lang);
  const gatewayUptime = formatDuration(data?.gateway_uptime_s, lang);

  const logErrors = Array.isArray(data?.log_errors) ? [...data.log_errors].reverse().slice(0, 20) : [];

  return (
    <>
      {error ? (
        <View style={{ backgroundColor: th.colors.card, borderColor: th.colors.destructive, borderWidth: 1, padding: 12, marginHorizontal: 16, marginTop: 12, borderRadius: th.radius.md }}>
          <Text style={{ color: th.colors.destructive, fontFamily: th.font.regular, fontSize: 13 }}>{t(error)}</Text>
        </View>
      ) : null}

      <Head>{t("machine.cpu")}</Head>
      <View style={{ backgroundColor: th.colors.card, borderRadius: th.radius.md, marginHorizontal: 16, overflow: "hidden" }}>
        <GaugeRow label={t("machine.cpu")} value={cpuText} pct={data?.cpu_percent} />
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }}>
          <GaugeRow label={t("machine.memory")} value={ramText} pct={ramPct} />
        </View>
        {hasSwap ? (
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }}>
            <GaugeRow testID="swap-gauge" label={t("machine.swap")} value={swapText} pct={swapPct} />
          </View>
        ) : null}
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }}>
          <GaugeRow label={t("machine.disk")} value={diskText} pct={diskPct} />
        </View>
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }}>
          <GaugeRow label={t("machine.temperature")} value={tempText} valueColor={tempColor} />
        </View>
      </View>

      <Head>{t("machine.load")}</Head>
      <View style={{ backgroundColor: th.colors.card, borderRadius: th.radius.md, marginHorizontal: 16, overflow: "hidden" }}>
        <ListItem
          title={loadText}
          subtitle={coresText}
        />
      </View>

      <Head>{t("machine.uptime")}</Head>
      <View style={{ backgroundColor: th.colors.card, borderRadius: th.radius.md, marginHorizontal: 16, overflow: "hidden" }}>
        <ListItem
          title={t("machine.uptime")}
          right={<Text style={{ color: th.colors.foreground, fontFamily: th.font.regular, fontSize: 14 }}>{machineUptime}</Text>}
        />
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }}>
          <ListItem
            title={t("machine.gatewayUptime")}
            right={<Text style={{ color: th.colors.foreground, fontFamily: th.font.regular, fontSize: 14 }}>{gatewayUptime}</Text>}
          />
        </View>
      </View>

      <Head>{t("machine.gateway")}</Head>
      <View style={{ backgroundColor: th.colors.card, borderRadius: th.radius.md, marginHorizontal: 16, overflow: "hidden" }}>
        <ListItem
          title={t("machine.restart")}
          subtitle={t("machine.restartHint")}
          onPress={() => setConfirmRestart(true)}
        />
      </View>

      <Head>{t("machine.recentErrors")}</Head>
      <View style={{ backgroundColor: th.colors.card, borderRadius: th.radius.md, marginHorizontal: 16, overflow: "hidden", marginBottom: 16 }}>
        {logErrors.length === 0 ? (
          <View style={{ padding: 16, minHeight: 48, justifyContent: "center" }}>
            <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
              {t("machine.noErrors")}
            </Text>
          </View>
        ) : (
          logErrors.map((err, idx) => (
            <View
              key={idx}
              style={{
                padding: 12,
                minHeight: 48,
                justifyContent: "center",
                borderTopWidth: idx > 0 ? StyleSheet.hairlineWidth : 0,
                borderTopColor: th.colors.border,
              }}
            >
              <Text
                testID="log-error-item"
                selectable
                style={{
                  color: th.colors.foreground,
                  fontFamily: th.font.mono,
                  fontSize: 12,
                  lineHeight: 18,
                }}
              >
                {err}
              </Text>
            </View>
          ))
        )}
      </View>

      <Dialog
        open={confirmRestart}
        destructive
        title={t("machine.restartConfirmTitle")}
        message={t("machine.restartConfirmMessage")}
        confirmLabel={t("machine.restartConfirm")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setConfirmRestart(false)}
        onConfirm={() => {
          setConfirmRestart(false);
          void run();
        }}
      />
    </>
  );
}
