import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Cmd } from "../../extras/logic";
import { useTheme } from "../../ui/ThemeProvider";

export function SlashMenu({
  query,
  commands,
  onSelect,
}: {
  query: string;
  commands: Cmd[];
  onSelect(c: Cmd): void;
}) {
  const th = useTheme();
  const q = query.toLowerCase();
  const filtered = commands.filter((c) => c.command.toLowerCase().startsWith(q));

  if (filtered.length === 0) return null;

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
        {filtered.map((cmd) => (
          <Pressable
            key={cmd.command}
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
