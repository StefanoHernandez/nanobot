import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import type { SettingsPayload } from "@/lib/types";
import { useT } from "../../i18n";
import { useSettings } from "../../settings/store";
import { useSession } from "../../state/sessionStore";
import { ListItem } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { Head } from "./common";

type Usage = NonNullable<SettingsPayload["usage"]>;

export function OverviewSection() {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();
  const { data } = useSettings();
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    if (!session) return;
    let live = true;
    session.get<Usage>("/api/settings/usage").then((u) => live && setUsage(u), () => {});
    return () => {
      live = false;
    };
  }, [session]);

  const days = usage?.days ?? [];
  const peak = usage?.peak_day_tokens ?? Math.max(0, ...days.map((d) => d.total_tokens));
  const total = usage?.total_tokens_30d ?? usage?.total_tokens ?? 0;
  const a = data?.agent;
  const on = (v?: boolean) => t(v ? "settings.on" : "settings.off");
  const go = (s: string) => () => router.push(`/settings/${s}` as never);

  return (
    <>
      <Head>{t("settings.usage30")}</Head>
      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        <View testID="usage-bars" style={{ flexDirection: "row", alignItems: "flex-end", height: 72, gap: 2 }}>
          {days.map((d) => (
            <View
              key={d.date}
              style={{ flex: 1, height: `${Math.max(2, peak ? (d.total_tokens / peak) * 100 : 0)}%`, backgroundColor: th.colors.primary, borderRadius: 2 }}
            />
          ))}
        </View>
        <Text style={{ color: th.colors.foreground, fontSize: 14 }}>{t("settings.usageTotal", { n: total.toLocaleString() })}</Text>
        <Text style={{ color: th.colors.mutedForeground, fontSize: 13 }}>{t("settings.usagePeak", { n: peak.toLocaleString() })}</Text>
      </View>
      <Head>{t("settings.currentModel")}</Head>
      <ListItem
        title={a?.model ?? "-"}
        subtitle={[a?.resolved_provider ?? a?.provider, a?.model_preset].filter(Boolean).join(" · ")}
        onPress={go("models")}
      />
      <Head>{t("settings.sections.capabilities")}</Head>
      <ListItem title={t("settings.web")} subtitle={on(data?.web?.enable)} onPress={go("capabilities")} />
      <ListItem title={t("settings.image")} subtitle={on(data?.image_generation?.enabled)} onPress={go("capabilities")} />
      <ListItem title={t("settings.voice")} subtitle={on(data?.transcription?.enabled)} onPress={go("capabilities")} />
    </>
  );
}
