import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NanobotSession } from "../../core/session";
import { listDevices, revokeDevice, type PairedDevice } from "../../core/pairing";
import { i18n, useT } from "../../i18n";
import { Button, Dialog, ListItem, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { Head } from "./common";

function formatLastSeen(secs: number | null, lang: string, neverLabel: string): string {
  if (secs == null) return neverLabel;
  return new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" }).format(new Date(secs * 1000));
}

export function DevicesCard({ session }: { session: NanobotSession }) {
  const t = useT();
  const th = useTheme();
  const [phase, setPhase] = useState<"loading" | "ok" | "404" | "error">("loading");
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [revokeTarget, setRevokeTarget] = useState<PairedDevice | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await listDevices(session);
      setDevices(list);
      setPhase("ok");
    } catch (e) {
      const status = (e as Error & { status?: number }).status;
      if (status === 404) setPhase("404");
      else setPhase("error");
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRevokeConfirm = async () => {
    if (!revokeTarget || revokeBusy) return;
    setRevokeBusy(true);
    try {
      await revokeDevice(session, revokeTarget.id);
      setRevokeTarget(null);
      await load();
    } catch {
      toast.show(t("common.error"));
    } finally {
      setRevokeBusy(false);
    }
  };

  if (phase === "404" || phase === "loading") return null;

  const live = devices.filter((d) => d.revoked !== true);

  return (
    <>
      <Head>{t("settings.devices")}</Head>
      <View style={{ backgroundColor: th.colors.card, borderRadius: th.radius.md, marginHorizontal: 16, overflow: "hidden" }}>
        {phase === "error" ? (
          <Text style={{ color: th.colors.destructive, fontFamily: th.font.regular, fontSize: 13, padding: 16 }}>{t("common.error")}</Text>
        ) : live.length === 0 ? (
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, padding: 16 }}>{t("settings.devicesEmpty")}</Text>
        ) : (
          live.map((d, i) => (
            <View key={d.id}>
              {i > 0 ? <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }} /> : null}
              <ListItem
                title={d.name}
                subtitle={formatLastSeen(d.last_seen, i18n.language, t("settings.deviceNever"))}
                right={
                  <Button
                    title={t("settings.revokeDevice")}
                    variant="destructive"
                    onPress={() => setRevokeTarget(d)}
                  />
                }
              />
            </View>
          ))
        )}
      </View>
      <Dialog
        open={!!revokeTarget}
        destructive
        title={t("settings.revokeDevice")}
        message={revokeTarget ? t("settings.revokeDeviceConfirm", { name: revokeTarget.name }) : undefined}
        confirmLabel={t("settings.revokeDevice")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void onRevokeConfirm()}
        onCancel={() => setRevokeTarget(null)}
      />
    </>
  );
}
