import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useT } from "../i18n";
import { withAlpha } from "../ui/theme";
import { useTheme } from "../ui/ThemeProvider";
import { useEffort } from "./effort";
import { EffortSheet } from "./EffortSheet";

/** How many of the 3 notches a level fills: none = 0, then spread over the ranked levels; adaptive sits in the middle. */
export function effortNotches(level: string, levels: string[]): number {
  if (level === "none") return 0;
  if (level === "adaptive") return 2;
  const ranked = levels.filter((l) => l !== "none" && l !== "adaptive");
  const i = ranked.indexOf(level);
  if (i < 0 || ranked.length === 0) return 1;
  return Math.max(1, Math.ceil((3 * (i + 1)) / ranked.length));
}

function Notches({ filled }: { filled: number }) {
  const th = useTheme();
  return (
    <View testID="effort-notches" style={styles.notches} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[6, 9, 12].map((h, i) => (
        <View
          key={h}
          testID={i < filled ? "notch-on" : "notch-off"}
          style={{ width: 3, height: h, borderRadius: 1.5, backgroundColor: i < filled ? th.colors.foreground : withAlpha(th.colors.mutedForeground, 0.4) }}
        />
      ))}
    </View>
  );
}

export function EffortPill({ chatKey }: { chatKey: string }) {
  const t = useT();
  const th = useTheme();
  const { state } = useEffort(chatKey);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!state) return null;

  const level = state.current ?? state.levels[0];
  const label = t(`extras.effort.${level}`, { defaultValue: level });

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("extras.reasoning")}: ${label}`}
        onPress={() => setSheetOpen(true)}
        hitSlop={4}
        style={styles.pressable}
      >
        <View
          style={[
            styles.pill,
            {
              backgroundColor: th.colors.muted,
              borderRadius: th.radius.sm,
            },
          ]}
        >
          <Notches filled={effortNotches(level, state.levels)} />
          <Text
            style={[
              styles.pillText,
              {
                color: th.colors.foreground,
                fontFamily: th.font.medium,
              },
            ]}
          >
            {label}
          </Text>
        </View>
      </Pressable>
      {sheetOpen ? (
        <EffortSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          chatKey={chatKey}
          state={state}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  notches: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    height: 12,
  },
  pillText: {
    fontSize: 12,
  },
});
