import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ChatSummary, CliAppInfo, McpPresetInfo } from "@/lib/types";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import {
  cliAppCandidates,
  filterCandidates,
  mcpCandidates,
  sessionCandidates,
  type MentionCandidate,
} from "./mentions";

export type MentionMenuProps = {
  chats: ChatSummary[];
  apps: CliAppInfo[];
  presets: McpPresetInfo[];
  query: string;
  onSelect(c: MentionCandidate): void;
};

export function MentionMenu({
  chats,
  apps,
  presets,
  query,
  onSelect,
}: MentionMenuProps) {
  const t = useT();
  const th = useTheme();

  const matchingChats = filterCandidates(sessionCandidates(chats), query);
  const matchingApps = filterCandidates(cliAppCandidates(apps), query);
  const matchingPresets = filterCandidates(mcpCandidates(presets), query);

  const totalMatches =
    matchingChats.length + matchingApps.length + matchingPresets.length;

  if (totalMatches === 0) return null;

  const renderCandidate = (item: MentionCandidate) => {
    const iconName: React.ComponentProps<typeof MaterialCommunityIcons>["name"] =
      item.kind === "chat"
        ? "chat-outline"
        : item.kind === "app"
          ? "console"
          : "puzzle-outline";

    return (
      <Pressable
        key={`${item.kind}-${item.name}`}
        onPress={() => onSelect(item)}
        accessibilityRole="button"
        accessibilityLabel={`@${item.name} ${item.title}`}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: pressed ? th.colors.accent : "transparent",
          },
        ]}
      >
        <View style={styles.topLine}>
          <MaterialCommunityIcons
            name={iconName}
            size={18}
            color={th.colors.primary}
            style={styles.icon}
          />
          <Text
            style={[
              styles.nameText,
              { color: th.colors.primary, fontFamily: th.font.medium },
            ]}
          >
            @{item.name}
          </Text>
          {item.title && item.title !== item.name ? (
            <Text
              numberOfLines={1}
              style={[
                styles.titleText,
                { color: th.colors.foreground, fontFamily: th.font.regular },
              ]}
            >
              {item.title}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: th.colors.popover,
          borderColor: th.colors.border,
          borderRadius: th.radius.md,
        },
      ]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {matchingChats.length > 0 ? (
          <View style={styles.section}>
            <Text
              style={[
                styles.sectionHeader,
                {
                  color: th.colors.mutedForeground,
                  fontFamily: th.font.medium,
                },
              ]}
            >
              {t("mentions.section.chat")}
            </Text>
            {matchingChats.map(renderCandidate)}
          </View>
        ) : null}

        {matchingApps.length > 0 ? (
          <View style={styles.section}>
            <Text
              style={[
                styles.sectionHeader,
                {
                  color: th.colors.mutedForeground,
                  fontFamily: th.font.medium,
                },
              ]}
            >
              {t("mentions.section.app")}
            </Text>
            {matchingApps.map(renderCandidate)}
          </View>
        ) : null}

        {matchingPresets.length > 0 ? (
          <View style={styles.section}>
            <Text
              style={[
                styles.sectionHeader,
                {
                  color: th.colors.mutedForeground,
                  fontFamily: th.font.medium,
                },
              ]}
            >
              {t("mentions.section.mcp")}
            </Text>
            {matchingPresets.map(renderCandidate)}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 240,
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
  },
  scroll: {
    maxHeight: 240,
  },
  scrollContent: {
    paddingVertical: 4,
  },
  section: {
    marginBottom: 4,
  },
  sectionHeader: {
    fontSize: 11,
    textTransform: "uppercase",
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 2,
    letterSpacing: 0.5,
  },
  row: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: "center",
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  icon: {
    marginRight: 2,
  },
  nameText: {
    fontSize: 14,
  },
  titleText: {
    fontSize: 13,
    flexShrink: 1,
  },
});
