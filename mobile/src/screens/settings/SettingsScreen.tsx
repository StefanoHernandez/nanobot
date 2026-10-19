import React from "react";
import { StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useT } from "../../i18n";
import { ListItem, goBackOr } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { Head } from "./common";
import { SettingsShell } from "./SettingsShell";

export const SECTIONS = [
  "overview",
  "models",
  "features",
  "prompts",
  "behavior",
  "security",
  "costs",
  "server",
  "backup",
  "advanced",
  "app",
  "about",
] as const;
export type Section = (typeof SECTIONS)[number];

export const SETTINGS_REDIRECTS: Record<string, Section> = {
  capabilities: "features",
  system: "server",
  machine: "server",
  appearance: "app",
};

export function resolveSettingsSection(id: string): Section | null {
  if ((SECTIONS as readonly string[]).includes(id)) return id as Section;
  if (id in SETTINGS_REDIRECTS) return SETTINGS_REDIRECTS[id];
  return null;
}

export type SectionGroup = {
  groupKey?: string;
  sections: Section[];
};

export const SECTION_GROUPS: SectionGroup[] = [
  { sections: ["overview"] },
  { groupKey: "bot", sections: ["models", "features", "prompts", "behavior"] },
  { groupKey: "security", sections: ["security"] },
  { groupKey: "costs", sections: ["costs"] },
  { groupKey: "server", sections: ["server", "backup", "advanced"] },
  { groupKey: "thisPhone", sections: ["app", "about"] },
];

const SECTION_ICONS: Record<Section, React.ComponentProps<typeof MaterialCommunityIcons>["name"]> = {
  overview: "view-dashboard-outline",
  models: "cube-outline",
  features: "puzzle-outline",
  prompts: "text-box-multiple-outline",
  behavior: "robot-outline",
  security: "shield-check-outline",
  costs: "cash",
  server: "chip",
  backup: "backup-restore",
  advanced: "tune-vertical",
  app: "palette-outline",
  about: "information-outline",
};

/** Section list (route /settings). */
export function SettingsScreen() {
  const t = useT();
  const th = useTheme();
  return (
    <SettingsShell title={t("settings.title")} onBack={() => goBackOr(router)} guard>
      <View style={{ paddingBottom: 24 }}>
        {SECTION_GROUPS.map((group, gIdx) => (
          <View key={group.groupKey ?? `group-${gIdx}`}>
            {group.groupKey ? <Head>{t(`settings.groups.${group.groupKey}`)}</Head> : null}
            <View
              style={{
                ...th.surface,
                marginHorizontal: 16,
                marginTop: group.groupKey ? 0 : 12,
                overflow: "hidden",
              }}
            >
              {group.sections.map((s, idx) => (
                <View
                  key={s}
                  style={
                    idx > 0
                      ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }
                      : undefined
                  }
                >
                  <ListItem
                    title={t(`settings.sections.${s}`)}
                    subtitle={t(`settings.sectionSubtitles.${s}`)}
                    left={<MaterialCommunityIcons name={SECTION_ICONS[s]} size={24} color={th.colors.foreground} />}
                    onPress={() => router.push(`/settings/${s}` as never)}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </SettingsShell>
  );
}
