import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useT } from "../../../i18n";
import { Button } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import type { MarketplaceSkillSummary, SkillSummary } from "@/lib/types";

export type SkillItem = {
  name: string;
  description?: string;
  source?: string;
  version?: string;
  update_available?: boolean;
  installed?: boolean;
  provider?: string;
  skill_id?: string;
  id?: string;
} & (Partial<SkillSummary> | Partial<MarketplaceSkillSummary>);

export function SkillRow({
  item,
  isInstalled,
  gateAllowed,
  isOperating,
  onPress,
  onInstall,
  onUpdate,
}: {
  item: SkillItem;
  isInstalled: boolean;
  gateAllowed: boolean;
  isOperating: boolean;
  onPress: (item: SkillItem) => void;
  onInstall: (item: SkillItem) => void;
  onUpdate: (item: SkillItem) => void;
}) {
  const t = useT();
  const th = useTheme();

  const name = item.name;
  const description = item.description || "";
  const source = item.source || "";
  const version = item.version;
  const updateAvailable = item.update_available;

  return (
    <Pressable
      style={[
        styles.card,
        { backgroundColor: th.colors.card, borderColor: th.colors.border },
      ]}
      onPress={() => onPress(item)}
      accessibilityRole="button"
    >
      <View style={styles.header}>
        <View style={styles.headerTexts}>
          <Text style={[styles.name, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
            {name}
          </Text>
          <View style={styles.metaRow}>
            {source ? (
              <Text style={[styles.metaText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                {t("skills.source", { source })}
              </Text>
            ) : null}
            {version ? (
              <Text style={[styles.metaText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                {t("skills.version", { version })}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.badges}>
          {updateAvailable ? (
            <View style={[styles.badge, { backgroundColor: th.colors.brandSoft }]}>
              <Text style={[styles.badgeText, { color: th.colors.brandSoftForeground, fontFamily: th.font.medium }]}>
                {t("skills.updateAvailable")}
              </Text>
            </View>
          ) : isInstalled ? (
            <View style={[styles.badge, { backgroundColor: th.colors.muted }]}>
              <Text style={[styles.badgeText, { color: th.colors.mutedForeground, fontFamily: th.font.medium }]}>
                {t("skills.installedBadge")}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {description ? (
        <Text
          style={[styles.description, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}
          numberOfLines={2}
        >
          {description}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {isOperating ? (
          <ActivityIndicator color={th.colors.primary} />
        ) : updateAvailable ? (
          <Button
            title={t("skills.update")}
            variant="secondary"
            disabled={!gateAllowed}
            onPress={() => onUpdate(item)}
          />
        ) : !isInstalled ? (
          <Button
            title={t("skills.install")}
            variant="primary"
            disabled={!gateAllowed}
            onPress={() => onInstall(item)}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerTexts: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 17,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  metaText: {
    fontSize: 13,
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 13,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    minHeight: 48,
    marginTop: 4,
  },
});
