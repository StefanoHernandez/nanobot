import React from "react";
import { router } from "expo-router";
import { useT } from "../../src/i18n";
import { ListItem, goBackOr } from "../../src/ui/components";
import { SettingsShell } from "../../src/screens/settings/SettingsShell";

export default function EcosystemIndex() {
  const t = useT();
  return (
    <SettingsShell title={t("ecosystem.title")} onBack={() => goBackOr(router, "/")}>
      <ListItem
        title={t("ecosystem.channels")}
        onPress={() => router.push("/ecosystem/channels")}
      />
      <ListItem
        title={t("ecosystem.apps")}
        onPress={() => router.push("/ecosystem/apps")}
      />
      <ListItem
        title={t("ecosystem.skills")}
        onPress={() => router.push("/ecosystem/skills")}
      />
      <ListItem
        title={t("ecosystem.automations")}
        onPress={() => router.push("/ecosystem/automations")}
      />
    </SettingsShell>
  );
}
