import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../ThemeProvider";

export type SegmentedTab<T extends string> = {
  value: T;
  label: string;
  accessibilityLabel?: string;
  icon?: React.ReactNode;
};

/** The pill tab bar shared by the ecosystem and gallery screens. */
export function SegmentedTabs<T extends string>({ tabs, value, onChange }: { tabs: readonly SegmentedTab<T>[]; value: T; onChange: (value: T) => void }) {
  const th = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: th.colors.well, borderColor: th.colors.border, borderWidth: 1 }]}>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <Pressable
            key={tab.value}
            accessibilityRole="tab"
            accessibilityLabel={tab.accessibilityLabel ?? tab.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.value)}
            style={[
              styles.segment,
              selected
                ? { backgroundColor: th.colors.thumb, borderWidth: 1, borderColor: th.colors.borderStrong }
                : { backgroundColor: "transparent", borderWidth: 1, borderColor: "transparent" },
            ]}
          >
            <View style={styles.segmentInner}>
              {tab.icon}
              <Text
                style={{
                  color: selected ? th.colors.foreground : th.colors.textSecondary,
                  fontFamily: selected ? th.font.label : th.font.regular,
                  fontSize: 15,
                }}
              >
                {tab.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { marginHorizontal: 16, marginVertical: 8, padding: 4, flexDirection: "row", gap: 4, borderRadius: 999 },
  segment: { flex: 1, minHeight: 48, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  segmentInner: { flexDirection: "row", alignItems: "center", gap: 6 },
});
