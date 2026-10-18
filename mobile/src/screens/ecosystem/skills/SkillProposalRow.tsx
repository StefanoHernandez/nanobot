import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useT } from "../../../i18n";
import { useTheme } from "../../../ui/ThemeProvider";
import type { SkillProposal } from "./proposalsApi";

export function SkillProposalRow({
  item,
  onPress,
}: {
  item: SkillProposal;
  onPress: (item: SkillProposal) => void;
}) {
  const t = useT();
  const th = useTheme();

  const isUpdate = !!item.updates;
  const dateStr = item.date || item.created_at || "";

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
        <Text style={[styles.name, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
          {item.name}
        </Text>
        <View style={[styles.badge, { backgroundColor: isUpdate ? th.colors.brandSoft : th.colors.secondary }]}>
          <Text
            style={[
              styles.badgeText,
              {
                color: isUpdate ? th.colors.brandSoftForeground : th.colors.secondaryForeground,
                fontFamily: th.font.medium,
              },
            ]}
          >
            {isUpdate ? t("skills.updateBadge", "Aggiornamento") : t("skills.proposalBadge", "Proposta")}
          </Text>
        </View>
      </View>

      {item.summary ? (
        <Text style={[styles.summary, { color: th.colors.foreground, fontFamily: th.font.regular }]}>
          {item.summary}
        </Text>
      ) : null}

      {item.reason ? (
        <Text style={[styles.reason, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
          {item.reason}
        </Text>
      ) : null}

      {dateStr ? (
        <Text style={[styles.date, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
          {dateStr}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    minHeight: 48,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: {
    fontSize: 17,
    flex: 1,
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
  },
  summary: {
    fontSize: 14,
    lineHeight: 20,
  },
  reason: {
    fontSize: 13,
    lineHeight: 18,
  },
  date: {
    fontSize: 12,
    marginTop: 2,
  },
});
