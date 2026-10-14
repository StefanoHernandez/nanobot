import React from "react";
import { router } from "expo-router";
import { Text } from "react-native";
import { useT } from "../../i18n";
import { SECTIONS, type Section } from "./SettingsScreen";
import { SettingsShell } from "./SettingsShell";
import { AboutSection } from "./AboutSection";
import { AppearanceSection } from "./AppearanceSection";
import { ModelsSection } from "./ModelsSection";
import { CapabilitiesSection } from "./CapabilitiesSection";
import { AdvancedSection, SystemSection } from "./RuntimeConfigSection";
import { OverviewSection } from "./OverviewSection";
import { useTheme } from "../../ui/ThemeProvider";
import { goBackOr } from "../../ui/components";

export function SettingsSection({ section }: { section: string }) {
  const t = useT();
  const th = useTheme();
  const s = (SECTIONS as readonly string[]).includes(section) ? (section as Section) : null;
  return (
    <SettingsShell title={s ? t(`settings.sections.${s}`) : t("settings.title")} onBack={() => goBackOr(router, "/settings")}>
      {s === "overview" ? <OverviewSection /> : s === "appearance" ? <AppearanceSection /> : s === "about" ? <AboutSection /> : s === "models" ? <ModelsSection /> : s === "capabilities" ? <CapabilitiesSection /> : s === "system" ? <SystemSection /> : s === "advanced" ? <AdvancedSection /> : (
        <Text style={{ color: th.colors.mutedForeground, padding: 16 }}>{t("settings.comingSoon")}</Text>
      )}
    </SettingsShell>
  );
}
