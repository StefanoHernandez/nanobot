import React from "react";
import { router } from "expo-router";
import { useT } from "../../i18n";
import { ListItem, goBackOr } from "../../ui/components";
import { SettingsShell } from "./SettingsShell";

export const SECTIONS = ["overview", "appearance", "models", "capabilities", "system", "advanced", "about"] as const;
export type Section = (typeof SECTIONS)[number];

/** Section list (route /settings). */
export function SettingsScreen() {
  const t = useT();
  return (
    <SettingsShell title={t("settings.title")} onBack={() => goBackOr(router)} guard>
      {SECTIONS.map((s) => (
        <ListItem key={s} title={t(`settings.sections.${s}`)} onPress={() => router.push(`/settings/${s}` as never)} />
      ))}
    </SettingsShell>
  );
}
