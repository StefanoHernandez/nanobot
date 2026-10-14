import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { UIFileDiff } from "@/lib/types";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import { withAlpha } from "../../ui/theme";
import { parseUnifiedDiff } from "./diff";

const MAX_DIFF_LINES = 400;

export type DiffViewProps = {
  diff?: UIFileDiff;
};

export function DiffView({ diff }: DiffViewProps) {
  const th = useTheme();
  const t = useT();

  const lines = useMemo(() => {
    if (!diff?.text) return [];
    return parseUnifiedDiff(diff.text);
  }, [diff?.text]);

  if (!diff?.text) return null;

  const totalLines = lines.length;
  const isCapped = totalLines > MAX_DIFF_LINES;
  const displayLines = isCapped ? lines.slice(0, MAX_DIFF_LINES) : lines;
  const remainingCount = totalLines - MAX_DIFF_LINES;

  // Background colors with subtle opacity
  const alpha = th.scheme === "dark" ? 0.18 : 0.12;
  const addBg = withAlpha(th.colors.success, alpha);
  const delBg = withAlpha(th.colors.destructive, alpha);
  const hunkBg = th.colors.muted;

  return (
    <View style={[styles.container, { backgroundColor: th.colors.background, borderColor: th.colors.border }]}>
      {diff.truncated ? (
        <View style={[styles.banner, { backgroundColor: th.colors.muted }]}>
          <Text style={{ color: th.colors.mutedForeground, fontSize: 12 }}>
            {t("diff.truncated")}
          </Text>
        </View>
      ) : null}

      <ScrollView horizontal style={styles.scroll}>
        <View style={styles.content}>
          {displayLines.map((line, idx) => {
            let bg = "transparent";
            let color = th.colors.foreground;

            if (line.kind === "add") {
              bg = addBg;
              color = th.colors.success;
            } else if (line.kind === "del") {
              bg = delBg;
              color = th.colors.destructive;
            } else if (line.kind === "hunk") {
              bg = hunkBg;
              color = th.colors.mutedForeground;
            } else if (line.kind === "meta") {
              color = th.colors.mutedForeground;
            }

            return (
              <View key={idx} style={[styles.lineRow, { backgroundColor: bg }]}>
                <Text
                  selectable
                  style={[
                    styles.lineText,
                    {
                      color,
                      fontFamily: th.font.mono,
                    },
                  ]}
                >
                  {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
                  {line.text}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {isCapped ? (
        <View style={[styles.banner, { backgroundColor: th.colors.muted, borderTopWidth: 1, borderTopColor: th.colors.border }]}>
          <Text style={{ color: th.colors.mutedForeground, fontSize: 12 }}>
            {t("diff.moreLines", { count: remainingCount })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 6,
    marginVertical: 4,
    overflow: "hidden",
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    paddingVertical: 4,
    minWidth: "100%",
  },
  lineRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 1,
    minHeight: 18,
  },
  lineText: {
    fontSize: 12,
    lineHeight: 16,
  },
  banner: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
  },
});
