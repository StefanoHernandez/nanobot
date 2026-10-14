import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { LocalFile } from "../../core/upload";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import { formatFileSize } from "./attachments";

export type AttachmentBarProps = {
  files: LocalFile[];
  onRemove: (file: LocalFile, index: number) => void;
};

function getFileIcon(mime: string): React.ComponentProps<typeof MaterialCommunityIcons>["name"] {
  if (mime === "application/pdf") return "file-pdf-box";
  if (mime.includes("wordprocessingml") || mime.endsWith(".document")) return "file-word-box";
  if (mime.includes("spreadsheetml") || mime.endsWith(".sheet")) return "file-excel-box";
  if (mime.includes("presentationml") || mime.endsWith(".presentation")) return "file-powerpoint-box";
  if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") return "file-document-outline";
  return "file-outline";
}

export function AttachmentBar({ files, onRemove }: AttachmentBarProps) {
  const t = useT();
  const th = useTheme();

  if (!files || files.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {files.map((file, index) => {
          const isImage = file.mime.startsWith("image/");
          return (
            <View
              key={`${file.uri}-${index}`}
              style={[
                styles.chip,
                {
                  backgroundColor: th.colors.muted,
                  borderColor: th.colors.border,
                  borderRadius: th.radius.md,
                },
              ]}
            >
              <View style={styles.iconContainer}>
                {isImage ? (
                  <Image
                    source={{ uri: file.uri }}
                    style={[styles.thumbnail, { borderRadius: th.radius.sm }]}
                    resizeMode="cover"
                  />
                ) : (
                  <MaterialCommunityIcons
                    name={getFileIcon(file.mime)}
                    size={24}
                    color={th.colors.primary}
                  />
                )}
              </View>

              <View style={styles.info}>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="middle"
                  style={[
                    styles.name,
                    {
                      color: th.colors.foreground,
                      fontFamily: th.font.regular,
                    },
                  ]}
                >
                  {file.name}
                </Text>
                <Text style={[styles.size, { color: th.colors.mutedForeground }]}>
                  {formatFileSize(file.size)}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("attach.remove")}
                onPress={() => onRemove(file, index)}
                style={styles.removeBtn}
                hitSlop={4}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={18}
                  color={th.colors.mutedForeground}
                />
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 6,
  },
  scrollContent: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingLeft: 6,
    maxWidth: 220,
    overflow: "hidden",
  },
  iconContainer: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  thumbnail: {
    width: 32,
    height: 32,
  },
  info: {
    marginLeft: 6,
    marginRight: 2,
    flexShrink: 1,
    justifyContent: "center",
  },
  name: {
    fontSize: 13,
  },
  size: {
    fontSize: 11,
  },
  removeBtn: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
});
