import React, { useState } from "react";
import { Linking, Text, View } from "react-native";
import { router } from "expo-router";
import type { VersionCheckResult } from "@/lib/api";
import { useT } from "../../i18n";
import { VENDOR_COMMIT, VENDOR_DATE } from "../../platform/vendorVersion";
import { useSettings } from "../../settings/store";
import { useSession } from "../../state/sessionStore";
import { Button, ListItem } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
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
  const line = (s: string) => <Text style={{ color: th.colors.mutedForeground, fontSize: 13, paddingHorizontal: 16, paddingVertical: 2 }}>{s}</Text>;
  const env = data?.environment;

  return (
    <>
      <Head>{t("settings.server")}</Head>
      <ListItem title={profile?.name ?? "-"} subtitle={profile?.baseUrl} />
      <View style={{ paddingHorizontal: 16 }}>
        <Button title={t("settings.changeServer")} variant="secondary" onPress={() => router.push("/connect")} />
      </View>
      <Head>{t("settings.about")}</Head>
      {line(`${t("settings.appName")} - ${t("settings.version", { v: appVersion })}`)}
      {line(t("settings.based", { sha: VENDOR_COMMIT.slice(0, 7), date: VENDOR_DATE }))}
      {data?.version ? line(t("settings.serverVersion", { v: data.version.current, sha: (data.version.commit ?? "-").slice(0, 7) })) : null}
      {env ? line(`${env.os} ${env.os_version} · ${env.architecture} · Python ${env.python_version}`) : null}
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Button title={t("settings.checkUpdates")} variant="secondary" loading={check === "busy"} onPress={() => void onCheck()} />
      </View>
      {check === "latest" ? line(t("settings.upToDate")) : null}
      {check === "failed" ? line(t("settings.checkFailed")) : null}
      {check.startsWith("v:") ? line(t("settings.updateAvailable", { v: check.slice(2) })) : null}
      <ListItem title={t("settings.repo")} subtitle={REPO} onPress={open(REPO)} />
      <ListItem title={t("settings.docs")} subtitle={data?.docs?.base_url ?? DOCS} onPress={open(data?.docs?.base_url ?? DOCS)} />
      {line(t("settings.unofficial"))}
      {line(t("settings.license"))}
    </>
  );
}
