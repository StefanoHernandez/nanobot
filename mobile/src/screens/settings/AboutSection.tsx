import React, { useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { VersionCheckResult } from "@/lib/api";
import { useT } from "../../i18n";
import { VENDOR_COMMIT, VENDOR_DATE } from "../../platform/vendorVersion";
import { useSettings } from "../../settings/store";
import { useSession } from "../../state/sessionStore";
import { mintPairingCode, pairingQrValue } from "../../core/pairing";
import { Button, Dialog, ListItem, toast } from "../../ui/components";
import { PairQrView } from "../../ui/PairQrView";
import { useTheme } from "../../ui/ThemeProvider";
import { DevicesCard } from "./DevicesCard";
import { Head } from "./common";

const appVersion: string = require("../../../app.json").expo.version;
const REPO = "https://github.com/HKUDS/nanobot";
const DOCS = "https://nanobot.wiki";

export function AboutSection() {
  const t = useT();
  const th = useTheme();
  const { session, profile } = useSession();
  const { data } = useSettings();
  const [check, setCheck] = useState<"idle" | "busy" | "latest" | "failed" | string>("idle");
  const [pair, setPair] = useState<{ code: string; qr: string } | null>(null);
  const [pairBusy, setPairBusy] = useState(false);

  const onPairPhone = async () => {
    if (!session || pairBusy) return;
    setPairBusy(true);
    try {
      const minted = await mintPairingCode(session);
      const qr = pairingQrValue(session.baseUrl, minted.code);
      if (!qr) throw new Error("mint failed");
      setPair({ code: minted.code, qr });
    } catch {
      toast.show(t("common.error"));
    } finally {
      setPairBusy(false);
    }
  };

  const onCheck = async () => {
    if (!session) return;
    setCheck("busy");
    try {
      const r = await session.get<VersionCheckResult>("/api/settings/version-check");
      setCheck(r?.updateAvailable ? `v:${r.updateAvailable.latestVersion}` : "latest");
    } catch {
      setCheck("failed");
    }
  };
  const open = (u: string) => () => void Linking.openURL(u).catch(() => {});
  const env = data?.environment;

  return (
    <>
      <Head>{t("settings.server")}</Head>
      <View style={{ backgroundColor: th.colors.card, borderRadius: th.radius.md, marginHorizontal: 16, overflow: "hidden" }}>
        <ListItem title={profile?.name ?? "-"} subtitle={profile?.baseUrl} />
        <View style={{ padding: 16, paddingTop: 4, gap: 8 }}>
          <Button title={t("settings.changeServer")} variant="secondary" onPress={() => router.push("/connect")} />
          {session ? (
            Platform.OS === "web" ? (
              <View style={{ gap: 4 }}>
                <Button title={t("settings.pairPhone")} variant="secondary" disabled onPress={() => {}} />
                <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
                  {t("devices.pairFromServer")}
                </Text>
              </View>
            ) : (
              <Button title={t("settings.pairPhone")} variant="secondary" loading={pairBusy} onPress={() => void onPairPhone()} />
            )
          ) : null}
        </View>
      </View>
      {session ? <DevicesCard session={session} /> : null}

      <Head>{t("settings.about")}</Head>
      <View style={{ backgroundColor: th.colors.card, borderRadius: th.radius.md, marginHorizontal: 16, padding: 16, gap: 6, overflow: "hidden" }}>
        <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 15 }}>
          {`${t("settings.appName")} - ${t("settings.version", { v: appVersion })}`}
        </Text>
        <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
          {t("settings.based", { sha: VENDOR_COMMIT.slice(0, 7), date: VENDOR_DATE })}
        </Text>
        {data?.version ? (
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
            {t("settings.serverVersion", { v: data.version.current, sha: (data.version.commit ?? "-").slice(0, 7) })}
          </Text>
        ) : null}
        {env ? (
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
            {`${env.os} ${env.os_version} · ${env.architecture} · Python ${env.python_version}`}
          </Text>
        ) : null}
        <View style={{ paddingTop: 8 }}>
          <Button title={t("settings.checkUpdates")} variant="secondary" loading={check === "busy"} onPress={() => void onCheck()} />
        </View>
        {check === "latest" ? <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, paddingTop: 4 }}>{t("settings.upToDate")}</Text> : null}
        {check === "failed" ? <Text style={{ color: th.colors.destructive, fontFamily: th.font.regular, fontSize: 13, paddingTop: 4 }}>{t("settings.checkFailed")}</Text> : null}
        {check.startsWith("v:") ? <Text style={{ color: th.colors.brand, fontFamily: th.font.medium, fontSize: 13, paddingTop: 4 }}>{t("settings.updateAvailable", { v: check.slice(2) })}</Text> : null}
      </View>

      <View style={{ backgroundColor: th.colors.card, borderRadius: th.radius.md, marginHorizontal: 16, marginTop: 12, overflow: "hidden" }}>
        <ListItem title={t("settings.repo")} subtitle={REPO} onPress={open(REPO)} />
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }}>
          <ListItem title={t("settings.docs")} subtitle={data?.docs?.base_url ?? DOCS} onPress={open(data?.docs?.base_url ?? DOCS)} />
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 4 }}>
        <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>{t("settings.unofficial")}</Text>
        <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>{t("settings.license")}</Text>
      </View>

      <Dialog
        open={!!pair}
        title={t("settings.pairPhone")}
        message={t("settings.pairHint")}
        confirmLabel={t("common.close")}
        onConfirm={() => setPair(null)}
        onCancel={() => setPair(null)}
      >
        {pair ? (
          <View style={{ alignItems: "center", gap: 16 }}>
            <PairQrView value={pair.qr} size={200} />
            <Text
              selectable
              style={{ color: th.colors.foreground, fontFamily: th.font.mono, fontSize: 18, letterSpacing: 1 }}
            >
              {pair.code}
            </Text>
          </View>
        ) : null}
      </Dialog>
    </>
  );
}
