import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Cmd } from "../../extras/logic";
import type { SkillSummary } from "@/lib/types";
import { useTheme } from "../../ui/ThemeProvider";

export function SlashMenu({
  query,
  commands,
  skills = [],
  onSelect,
  onSelectSkill,
}: {
  query: string;
  commands: Cmd[];
  skills?: SkillSummary[];
  onSelect(c: Cmd): void;
  onSelectSkill?(s: SkillSummary): void;
}) {
  const th = useTheme();
  const isDollar = query.startsWith("$");
  const isSlash = query.startsWith("/");

  let filteredCommands: Cmd[] = [];
  let filteredSkills: SkillSummary[] = [];

  if (isDollar) {
    const q = query.slice(1).toLowerCase();
    filteredSkills = skills.filter((s) => s.name.toLowerCase().startsWith(q));
  } else if (isSlash) {
    const qCommands = query.toLowerCase();
    const qSkills = query.slice(1).toLowerCase();
    filteredCommands = commands.filter((c) => c.command.toLowerCase().startsWith(qCommands));
    filteredSkills = skills.filter((s) => s.name.toLowerCase().startsWith(qSkills));
  }

  if (filteredCommands.length === 0 && filteredSkills.length === 0) return null;

  return (
    <View
      testID="slash-menu"
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
        {filteredCommands.map((cmd) => (
          <Pressable
            key={cmd.command}
            testID={`slash-item-${cmd.command}`}
            onPress={() => onSelect(cmd)}
            accessibilityRole="button"
            accessibilityLabel={`${cmd.command} ${cmd.title}`}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: pressed ? th.colors.accent : "transparent",
              },
            ]}
          >
            <View style={styles.topLine}>
              <Text style={[styles.cmdText, { color: th.colors.primary, fontFamily: th.font.medium }]}>
                {cmd.command}
              </Text>
              {cmd.title ? (
                <Text style={[styles.titleText, { color: th.colors.foreground, fontFamily: th.font.regular }]}>
                  {cmd.title}
                </Text>
              ) : null}
            </View>
            {cmd.description ? (
              <Text
                numberOfLines={1}
                style={[styles.descText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}
              >
                {cmd.description}
              </Text>
            ) : null}
          </Pressable>
        ))}

        {filteredSkills.length > 0 ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionHeaderText, { color: th.colors.mutedForeground, fontFamily: th.font.medium }]}>
                Skill
              </Text>
            </View>
            {filteredSkills.map((skill) => (
              <Pressable
                key={`skill:${skill.name}`}
                testID={`slash-item-$${skill.name}`}
                onPress={() =>
                  onSelectSkill
                    ? onSelectSkill(skill)
                    : onSelect({ command: `$${skill.name}`, title: skill.name, description: skill.description } as any)
                }
                accessibilityRole="button"
                accessibilityLabel={`$${skill.name} ${skill.description || ""}`.trim()}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: pressed ? th.colors.accent : "transparent",
                  },
                ]}
              >
                <View style={styles.topLine}>
                  <Text style={[styles.cmdText, { color: th.colors.primary, fontFamily: th.font.medium }]}>
                    ${skill.name}
                  </Text>
                </View>
                {skill.description ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.descText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}
                  >
                    {skill.description}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </>
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
  sectionHeader: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  sectionHeaderText: {
    fontSize: 12,
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
  cmdText: {
    fontSize: 14,
  },
  titleText: {
    fontSize: 14,
  },
  descText: {
    fontSize: 12,
    marginTop: 2,
  },
});
