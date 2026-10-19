import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { NanobotFeaturesPayload } from "@/lib/types";
import { useT } from "../../i18n";
import { useSettings } from "../../settings/store";
import { useSession } from "../../state/sessionStore";
import { Button, Dialog, ListItem, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { Head } from "./common";
import { getPackagePlace, isSettingsFeatureVisible, type PackagePlace } from "./packagePlace";

const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type FeaturesProps = {
  names?: string[];
  place?: PackagePlace;
  title?: string;
};

export function Features({ names, place, title }: FeaturesProps) {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();
  const { mutate } = useSettings();
  const [list, setList] = useState<NanobotFeaturesPayload["features"]>([]);
  const [target, setTarget] = useState<{ name: string; enable: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    void (async () => {
      try {
        const payload = await session.get<NanobotFeaturesPayload>("/api/settings/nanobot-features");
        setList(payload.features ?? []);
      } catch {} // optional list: hidden when unavailable
    })();
  }, [session]);

  const shown = list.filter((f) => {
    if (!isSettingsFeatureVisible(f)) return false;
    if (names && !names.includes(f.name)) return false;
    if (place && getPackagePlace(f.name) !== place) return false;
    return true;
  });

  if (!shown.length) return null;

  const run = async () => {
    const x = target!;
    setTarget(null);
    setBusy(x.name);
    try {
      const r = await (x.enable
        ? mutate<NanobotFeaturesPayload>("settings.feature.enable", { name: x.name }, { timeoutMs: 150_000 })
        : mutate<NanobotFeaturesPayload>("settings.feature.disable", { name: x.name }));
      if (r?.features) setList(r.features);
    } catch (e) {
      toast.show(`${t("system.featureError")}: ${msgOf(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const headTitle = title ?? (place === "advanced" ? t("system.otherComponents", { defaultValue: "Altri componenti" }) : t("system.features"));

  return (
    <>
      {headTitle ? <Head>{headTitle}</Head> : null}
      <View style={{ ...th.surface, marginHorizontal: 16, overflow: "hidden" }}>
        {shown.map((f, idx) => (
          <View key={f.name} style={idx > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border } : undefined}>
            <ListItem
              title={f.display_name || (f as any).label || f.name}
              subtitle={f.status}
              right={
                <Button
                  title={f.enabled ? t("system.disable") : t("system.enable")}
                  variant="secondary"
                  loading={busy === f.name}
                  onPress={() => setTarget({ name: f.name, enable: !f.enabled })}
                />
              }
            />
          </View>
        ))}
      </View>
      <Dialog
        open={!!target}
        destructive={!!target?.enable}
        title={target?.enable ? t("system.featureConfirmTitle") : t("system.featureDisable")}
        message={target?.enable ? t("system.featureMessage") : t("system.featureDisableMessage")}
        confirmLabel={target?.enable ? t("system.featureInstall") : t("system.featureDisable")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setTarget(null)}
        onConfirm={() => void run()}
      />
    </>
  );
}
