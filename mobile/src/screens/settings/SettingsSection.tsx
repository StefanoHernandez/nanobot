import React from "react";
import { router } from "expo-router";
import { Text } from "react-native";
import { useT } from "../../i18n";
import { resolveSettingsSection } from "./SettingsScreen";
import { SettingsShell } from "./SettingsShell";
import { AboutSection } from "./AboutSection";
import { AppearanceSection } from "./AppearanceSection";
import { ModelsSection } from "./ModelsSection";
import { CapabilitiesSection } from "./CapabilitiesSection";
import { AdvancedSection, BehaviorSection } from "./RuntimeConfigSection";
import { ServerSection } from "./MachineSection";
import { SecuritySection } from "./SecuritySection";
import { BackupSection } from "./BackupSection";
import { OverviewSection } from "./OverviewSection";
import { CostsSection } from "./CostsSection";
import { PromptsSection } from "./PromptsSection";
import { useTheme } from "../../ui/ThemeProvider";
import { goBackOr } from "../../ui/components";

export function SettingsSection({ section }: { section: string }) {
  const t = useT();
  const th = useTheme();
  const s = resolveSettingsSection(section);
  return (
    <SettingsShell title={s ? t(`settings.sections.${s}`) : t("settings.title")} onBack={() => goBackOr(router, "/settings")}>
      {s === "overview" ? <OverviewSection /> :
       s === "models" ? <ModelsSection /> :
       s === "features" ? <CapabilitiesSection /> :
       s === "prompts" ? <PromptsSection /> :
       s === "behavior" ? <BehaviorSection /> :
       s === "security" ? <SecuritySection /> :
       s === "costs" ? <CostsSection /> :
       s === "server" ? <ServerSection /> :
       s === "backup" ? <BackupSection /> :
       s === "advanced" ? <AdvancedSection /> :
       s === "app" ? <AppearanceSection /> :
       s === "about" ? <AboutSection /> : (
        <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 16, padding: 16 }}>{t("settings.comingSoon")}</Text>
      )}
    </SettingsShell>
  );
}
