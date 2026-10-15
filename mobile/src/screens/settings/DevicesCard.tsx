import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NanobotSession } from "../../core/session";
import { listDevices, revokeDevice, type PairedDevice } from "../../core/pairing";
import { i18n, useT } from "../../i18n";
import { Button, Dialog, ListItem, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { Head } from "./common";
import { sessionStore } from "../../state/sessionStore";
import { pairedDevice } from "../../core/pairing";

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
  const genRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      genRef.current++;
    };
  }, []);

  const load = useCallback(async () => {
    const currentGen = ++genRef.current;
    const profileId = sessionStore?.getState ? sessionStore.getState()?.profile?.id : null;
    try {
      const list = await listDevices(session);
      if (!mountedRef.current || currentGen !== genRef.current) return;
      if (sessionStore?.getState && sessionStore.getState()?.profile?.id !== profileId) return;
      setDevices(list);
      setPhase("ok");
    } catch (e) {
      if (!mountedRef.current || currentGen !== genRef.current) return;
      if (sessionStore?.getState && sessionStore.getState()?.profile?.id !== profileId) return;
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
  const activeProfileId = sessionStore?.getState ? sessionStore.getState()?.profile?.id : null;
  const storedId = activeProfileId ? pairedDevice.get(activeProfileId) : null;
  const isRevokingSelf = Boolean(storedId && revokeTarget && revokeTarget.id === storedId);

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
        message={
          revokeTarget
            ? isRevokingSelf
              ? `${t("settings.revokeDeviceConfirm", { name: revokeTarget.name })}\n\n${t("devices.revokeSelf")}`
              : t("settings.revokeDeviceConfirm", { name: revokeTarget.name })
            : undefined
        }
        confirmLabel={t("settings.revokeDevice")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void onRevokeConfirm()}
        onCancel={() => setRevokeTarget(null)}
      />
    </>
  );
}
