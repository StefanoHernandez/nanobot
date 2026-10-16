import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import type { NanobotSession } from "../../core/session";
import { listDevices, revokeDevice, setFullPower, type PairedDevice } from "../../core/pairing";
import { webLogout } from "../../core/cookieBootstrap";
import { profiles } from "../../core/profiles";
import { i18n, useT } from "../../i18n";
import { Button, Dialog, ListItem, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { Head } from "./common";
import { sessionStore } from "../../state/sessionStore";
import { pairedDevice } from "../../core/pairing";
import { isServerBrowser } from "../../platform/serverMode";

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
  const [fullPowerTarget, setFullPowerTarget] = useState<PairedDevice | null>(null);
  const [fullPowerBusy, setFullPowerBusy] = useState(false);
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

  const isWeb = Platform.OS === "web";
  const isServer = isServerBrowser();
  const activeProfile = sessionStore?.getState ? sessionStore.getState()?.profile : null;
  const activeProfileId = activeProfile?.id ?? null;
  const storedId = activeProfileId ? pairedDevice.get(activeProfileId) : null;
  const live = devices.filter((d) => d.revoked !== true);
  const showFallbackBrowserLogout =
    isWeb &&
    activeProfile?.auth === "cookie" &&
    (!storedId || !live.some((d) => d.id === storedId));
  const isRevokingSelf = Boolean(
    (storedId && revokeTarget && revokeTarget.id === storedId) ||
    (isWeb && revokeTarget && revokeTarget.id === "__self_browser__")
  );

  const onRevokeConfirm = async () => {
    if (!revokeTarget || revokeBusy) return;
    setRevokeBusy(true);
    try {
      if (isWeb && (revokeTarget.id === "__self_browser__" || (storedId && revokeTarget.id === storedId))) {
        await webLogout(session.baseUrl);
        if (activeProfileId) {
          await profiles.remove(activeProfileId);
          pairedDevice.clear(activeProfileId);
        }
        sessionStore.getState().close();
        setRevokeTarget(null);
        router.replace("/connect");
        return;
      }
      await revokeDevice(session, revokeTarget.id);
      setRevokeTarget(null);
      await load();
    } catch {
      toast.show(t("common.operationFailed"));
    } finally {
      setRevokeBusy(false);
    }
  };

  const onToggleFullPowerOff = async (d: PairedDevice) => {
    try {
      await setFullPower(session, d.id, false);
      await load();
    } catch (e) {
      const err = (e as { error?: string; status?: number }).error;
      const status = (e as { error?: string; status?: number }).status;
      if (status === 403 || err === "local_browser_only") {
        toast.show(t("devices.fullPowerLocalOnly"));
      } else {
        toast.show(t("common.operationFailed"));
      }
    }
  };

  const onFullPowerConfirm = async () => {
    if (!fullPowerTarget || fullPowerBusy) return;
    setFullPowerBusy(true);
    try {
      await setFullPower(session, fullPowerTarget.id, true);
      setFullPowerTarget(null);
      await load();
    } catch (e) {
      setFullPowerTarget(null);
      const err = (e as { error?: string; status?: number }).error;
      const status = (e as { error?: string; status?: number }).status;
      if (status === 403 || err === "local_browser_only") {
        toast.show(t("devices.fullPowerLocalOnly"));
      } else {
        toast.show(t("common.operationFailed"));
      }
    } finally {
      setFullPowerBusy(false);
    }
  };

  if (phase === "404" || phase === "loading") return null;

  return (
    <>
      <Head>{isWeb ? t("about.devicesAll", { defaultValue: t("settings.devicesAll") }) : t("settings.devices")}</Head>
      <View style={{ ...th.surface, marginHorizontal: 16, overflow: "hidden" }}>
        {phase === "error" ? (
          <>
            <Text style={{ color: th.colors.destructive, fontFamily: th.font.regular, fontSize: 13, padding: 16 }}>{t("common.error")}</Text>
            {showFallbackBrowserLogout ? (
              <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }}>
                <ListItem
                  title={t("devices.thisBrowser")}
                  right={
                    <Button
                      title={t("devices.logoutBrowser")}
                      variant="destructive"
                      onPress={() => setRevokeTarget({ id: "__self_browser__", name: t("devices.thisBrowser"), created: 0, last_seen: null, revoked: false, full_power: false })}
                    />
                  }
                />
              </View>
            ) : null}
          </>
        ) : (
          <>
            {live.length === 0 && !showFallbackBrowserLogout ? (
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, padding: 16 }}>{t("settings.devicesEmpty")}</Text>
            ) : null}
            {live.map((d, i) => {
              const isSelf = storedId != null && d.id === storedId;
              const title = isSelf && isWeb ? `${d.name} (${t("devices.thisBrowser")})` : d.name;
              const buttonTitle = isSelf && isWeb ? t("devices.logoutBrowser") : t("settings.revokeDevice");

              return (
                <View key={d.id}>
                  {i > 0 ? <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }} /> : null}
                  <ListItem
                    title={title}
                    subtitle={formatLastSeen(d.last_seen, i18n.language, t("settings.deviceNever"))}
                    right={
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        {isServer ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
                              {t("devices.fullPower")}
                            </Text>
                            <Switch
                              accessibilityLabel={t("devices.fullPower")}
                              value={d.full_power === true}
                              onValueChange={(val) => {
                                if (val) {
                                  setFullPowerTarget(d);
                                } else {
                                  void onToggleFullPowerOff(d);
                                }
                              }}
                            />
                          </View>
                        ) : d.full_power ? (
                          <View
                            style={{
                              backgroundColor: th.colors.accent,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: th.radius.sm,
                            }}
                          >
                            <Text style={{ color: th.colors.foreground, fontFamily: th.font.regular, fontSize: 12 }}>
                              {t("devices.fullPower")}
                            </Text>
                          </View>
                        ) : null}
                        <Button
                          title={buttonTitle}
                          variant="destructive"
                          onPress={() => setRevokeTarget(d)}
                        />
                      </View>
                    }
                  />
                </View>
              );
            })}
            {showFallbackBrowserLogout ? (
              <View style={live.length > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border } : undefined}>
                <ListItem
                  title={t("devices.thisBrowser")}
                  right={
                    <Button
                      title={t("devices.logoutBrowser")}
                      variant="destructive"
                      onPress={() => setRevokeTarget({ id: "__self_browser__", name: t("devices.thisBrowser"), created: 0, last_seen: null, revoked: false, full_power: false })}
                    />
                  }
                />
              </View>
            ) : null}
          </>
        )}
      </View>
      <Dialog
        open={!!fullPowerTarget}
        title={t("devices.fullPower")}
        message={t("devices.fullPowerConfirm")}
        confirmLabel={t("common.ok")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void onFullPowerConfirm()}
        onCancel={() => setFullPowerTarget(null)}
      />
      <Dialog
        open={!!revokeTarget}
        destructive
        title={isRevokingSelf && isWeb ? t("devices.logoutBrowser") : t("settings.revokeDevice")}
        message={
          revokeTarget
            ? isRevokingSelf
              ? isWeb
                ? t("devices.logoutConfirm")
                : `${t("settings.revokeDeviceConfirm", { name: revokeTarget.name })}\n\n${t("devices.revokeSelf")}`
              : t("settings.revokeDeviceConfirm", { name: revokeTarget.name })
            : undefined
        }
        confirmLabel={isRevokingSelf && isWeb ? t("devices.logoutBrowser") : t("settings.revokeDevice")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void onRevokeConfirm()}
        onCancel={() => setRevokeTarget(null)}
      />
    </>
  );
}
