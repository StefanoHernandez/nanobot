import React from "react";
import { StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useT } from "../../i18n";
import { ListItem, goBackOr } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { SettingsShell } from "./SettingsShell";

export const SECTIONS = ["overview", "costs", "appearance", "models", "capabilities", "prompts", "system", "machine", "backup", "advanced", "about"] as const;
export type Section = (typeof SECTIONS)[number];

const SECTION_ICONS: Record<Section, React.ComponentProps<typeof MaterialCommunityIcons>["name"]> = {
  overview: "view-dashboard-outline",
  costs: "cash",
  appearance: "palette-outline",
  models: "cube-outline",
  capabilities: "puzzle-outline",
  prompts: "text-box-multiple-outline",
  system: "cog-outline",
  machine: "chip",
  backup: "backup-restore",
  advanced: "tune-vertical",
  about: "information-outline",
};

/** Section list (route /settings). */
export function SettingsScreen() {
  const t = useT();
  const th = useTheme();
  return (
    <SettingsShell title={t("settings.title")} onBack={() => goBackOr(router)} guard>
      <View style={{ backgroundColor: th.colors.card, borderRadius: th.radius.md, marginHorizontal: 16, marginTop: 12, overflow: "hidden" }}>
        {SECTIONS.map((s, idx) => (
          <View key={s} style={idx > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border } : undefined}>
            <ListItem
              title={t(`settings.sections.${s}`)}
              left={<MaterialCommunityIcons name={SECTION_ICONS[s]} size={24} color={th.colors.foreground} />}
              onPress={() => router.push(`/settings/${s}` as never)}
            />
          </View>
        ))}
      </View>
    </SettingsShell>
  );
}
