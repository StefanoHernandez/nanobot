import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useT } from "../i18n";
import { useTheme } from "../ui/ThemeProvider";
import { useEffort } from "./effort";
import { EffortSheet } from "./EffortSheet";

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
          <Text
            style={[
              styles.pillText,
              {
                color: th.colors.foreground,
                fontFamily: th.font.medium,
              },
            ]}
          >
            ⚡ {label}
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
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 12,
  },
});
