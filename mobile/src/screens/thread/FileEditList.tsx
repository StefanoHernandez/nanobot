import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { UIFileEdit } from "@/lib/types";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import { DiffView } from "./DiffView";

export type FileEditListProps = {
  edits: UIFileEdit[];
};

export function FileEditList({ edits }: FileEditListProps) {
  if (!edits || edits.length === 0) return null;

  return (
    <View style={styles.container}>
      {edits.map((edit) => (
        <FileEditItem key={edit.call_id} edit={edit} />
      ))}
    </View>
  );
}

function FileEditItem({ edit }: { edit: UIFileEdit }) {
  const th = useTheme();
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  const hasDiffText = !!edit.diff?.text;
  const isExpandable = hasDiffText;

  const toggle = () => {
    if (isExpandable) {
      setExpanded((prev) => !prev);
    }
  };

  // Icon by operation
  let iconName: React.ComponentProps<typeof MaterialCommunityIcons>["name"] = "file-document-edit-outline";
  if (edit.operation === "create") {
    iconName = "file-plus-outline";
  } else if (edit.operation === "delete") {
    iconName = "file-remove-outline";
  }

  return (
    <View style={styles.itemWrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={toggle}
        disabled={!isExpandable}
        style={[
          styles.row,
          {
            backgroundColor: th.colors.muted,
            borderRadius: th.radius.sm,
          },
        ]}
      >
        <MaterialCommunityIcons
          name={iconName}
          size={18}
          color={th.colors.mutedForeground}
          style={styles.icon}
        />

        <Text
          numberOfLines={1}
          ellipsizeMode="middle"
          style={[styles.path, { color: th.colors.foreground, fontFamily: th.font.mono }]}
        >
          {edit.path}
        </Text>

        {edit.binary ? (
          <Text style={[styles.badge, { color: th.colors.mutedForeground }]}>
            {t("diff.binary")}
          </Text>
        ) : null}

        {edit.added > 0 ? (
          <Text style={[styles.addedText, { color: th.colors.success }]}>
            +{edit.added}
          </Text>
        ) : null}

        {edit.deleted > 0 ? (
          <Text style={[styles.deletedText, { color: th.colors.destructive }]}>
            −{edit.deleted}
          </Text>
        ) : null}

        {edit.status === "editing" ? (
          <ActivityIndicator size="small" color={th.colors.primary} style={styles.spinner} />
        ) : null}

        {isExpandable ? (
          <Text style={[styles.caret, { color: th.colors.mutedForeground }]}>
            {expanded ? "▾" : "▸"}
          </Text>
        ) : null}
      </Pressable>

      {edit.status === "error" && edit.error ? (
        <Text style={[styles.errorText, { color: th.colors.destructive }]}>
          {edit.error}
        </Text>
      ) : null}

      {expanded && edit.diff ? <DiffView diff={edit.diff} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    gap: 4,
  },
  itemWrapper: {
    marginVertical: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingHorizontal: 10,
    gap: 8,
  },
  icon: {
    marginRight: 2,
  },
  path: {
    flex: 1,
    fontSize: 13,
  },
  badge: {
    fontSize: 11,
    textTransform: "lowercase",
  },
  addedText: {
    fontSize: 12,
    fontWeight: "700",
  },
  deletedText: {
    fontSize: 12,
    fontWeight: "700",
  },
  spinner: {
    marginLeft: 4,
  },
  caret: {
    fontSize: 13,
    marginLeft: 2,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    paddingHorizontal: 8,
  },
});
