import { AnyImage } from "../../ui/AnyImage";
import React, { useMemo, useState } from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { UIMessage } from "@/lib/types";
import { useT } from "../../i18n";
import { useSession } from "../../state/sessionStore";
import { useThreadSlice } from "../../state/threadStore";
import { IconButton, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { withAlpha } from "../../ui/theme";
import {
  absoluteMediaUrl,
  classify,
  downloadMedia,
  mediaName,
  openLocal,
  shareMedia,
} from "../thread/media/media";
import { viewerKind } from "../viewer/formats";

export type GalleryScreenProps = {
  chatKey: string;
};

export type GalleryImage = {
  url: string;
  name?: string;
};

export type ThreadFile = {
  url: string;
  name: string;
  kind: "image" | "video" | "audio" | "file";
  role: "user" | "assistant";
  createdAt?: number;
};

export function collectThreadFiles(messages: UIMessage[], baseUrl: string): ThreadFile[] {
  const files: ThreadFile[] = [];
  const seenUrls = new Set<string>();

  for (const m of messages) {
    const role: "user" | "assistant" = m.role === "assistant" ? "assistant" : "user";

    // 1. m.media where url is set
    if (m.media) {
      for (const item of m.media) {
        if (item.url) {
          const abs = absoluteMediaUrl(baseUrl, item.url);
          if (!seenUrls.has(abs)) {
            seenUrls.add(abs);
            const kind = classify(item);
            files.push({
              url: abs,
              name: item.name || mediaName(item),
              kind,
              role,
              createdAt: m.createdAt,
            });
          }
        }
      }
    }

    // 2. m.images where url is set
    if (m.images) {
      for (const img of m.images) {
        if (img.url) {
          const abs = absoluteMediaUrl(baseUrl, img.url);
          if (!seenUrls.has(abs)) {
            seenUrls.add(abs);
            files.push({
              url: abs,
              name: img.name || mediaName({ url: img.url, kind: "image" }),
              kind: "image",
              role,
              createdAt: m.createdAt,
            });
          }
        }
      }
    }
  }

  return files;
}

export function collectThreadImages(messages: UIMessage[], baseUrl: string): GalleryImage[] {
  return collectThreadFiles(messages, baseUrl)
    .filter((f) => f.kind === "image")
    .map((f) => ({ url: f.url, name: f.name }));
}

function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

function fileIcon(
  kind: "image" | "video" | "audio" | "file",
  name: string,
): React.ComponentProps<typeof MaterialCommunityIcons>["name"] {
  if (kind === "video") return "video";
  if (kind === "audio") return "music-note";
  const ext = fileExt(name);
  if (ext === "pdf") return "file-pdf-box";
  if (ext === "doc" || ext === "docx") return "file-word-box";
  if (ext === "xls" || ext === "xlsx" || ext === "csv") return "file-excel-box";
  if (ext === "ppt" || ext === "pptx") return "file-powerpoint-box";
  return "file-outline";
}

export function GalleryScreen({ chatKey }: GalleryScreenProps) {
  const th = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { messages } = useThreadSlice(chatKey);
  const { profile } = useSession();
  const baseUrl = profile?.baseUrl ?? "";

  const files = useMemo(
    () => collectThreadFiles(messages, baseUrl),
    [messages, baseUrl],
  );
  const images = useMemo(() => files.filter((f) => f.kind === "image"), [files]);
  const otherFiles = useMemo(() => files.filter((f) => f.kind !== "image"), [files]);

  const [manualTab, setManualTab] = useState<"images" | "files" | null>(null);
  const activeTab = manualTab ?? (images.length === 0 && otherFiles.length > 0 ? "files" : "images");

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const numColumns = 3;
  const screenWidth = Dimensions.get("window").width;
  const thumbSize = (screenWidth - 32) / numColumns - 8;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const handleOpenFile = async (item: ThreadFile) => {
    try {
      const local = await downloadMedia(item.url, item.name);
      if (viewerKind(item.name) !== null) {
        router.push({ pathname: "/viewer", params: { uri: local, name: item.name } });
      } else {
        await openLocal(local, fileExt(item.name));
      }
    } catch {
      toast.show(t("media.openFailed"));
    }
  };

  const handleShare = async (item: ThreadFile) => {
    try {
      const local = await downloadMedia(item.url, item.name);
      await shareMedia(local);
    } catch {
      toast.show(t("media.shareFailed"));
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: th.colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            borderBottomColor: th.colors.border,
            borderBottomWidth: 1,
          },
        ]}
      >
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={handleBack}
          accessibilityLabel={t("thread.back")}
        />
        <Text
          numberOfLines={1}
          style={[styles.headerTitle, { color: th.colors.foreground, fontFamily: th.font.display }]}
        >
          {t("gallery.title")}
        </Text>
      </View>

      {/* Companion-style pill tabs */}
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: th.colors.muted,
            borderRadius: 999,
          },
        ]}
      >
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "images" }}
          accessibilityLabel={t("gallery.tabImages")}
          onPress={() => setManualTab("images")}
          style={[
            styles.tabButton,
            activeTab === "images" && [
              styles.tabButtonActive,
              { backgroundColor: th.colors.card },
            ],
          ]}
        >
          <Text
            style={[
              styles.tabText,
              {
                color: activeTab === "images" ? th.colors.foreground : th.colors.mutedForeground,
                fontFamily: activeTab === "images" ? th.font.medium : th.font.regular,
              },
            ]}
          >
            {t("gallery.tabImages")}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "files" }}
          accessibilityLabel={t("gallery.tabFiles")}
          onPress={() => setManualTab("files")}
          style={[
            styles.tabButton,
            activeTab === "files" && [
              styles.tabButtonActive,
              { backgroundColor: th.colors.card },
            ],
          ]}
        >
          <Text
            style={[
              styles.tabText,
              {
                color: activeTab === "files" ? th.colors.foreground : th.colors.mutedForeground,
                fontFamily: activeTab === "files" ? th.font.medium : th.font.regular,
              },
            ]}
          >
            {t("gallery.tabFiles")}
          </Text>
        </Pressable>
      </View>

      {/* Tab Content */}
      {activeTab === "images" ? (
        images.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text
              style={[
                styles.emptyText,
                { color: th.colors.mutedForeground, fontFamily: th.font.regular },
              ]}
            >
              {t("gallery.emptyImages")}
            </Text>
          </View>
        ) : (
          <FlatList
            data={images}
            keyExtractor={(item) => item.url}
            numColumns={numColumns}
            contentContainerStyle={[styles.gridContainer, { paddingBottom: insets.bottom + 16 }]}
            renderItem={({ item, index }) => (
              <Pressable
                testID="gallery-thumbnail"
                accessibilityRole="imagebutton"
                accessibilityLabel={item.name || t("gallery.title")}
                onPress={() => setViewerIndex(index)}
                style={[
                  styles.thumbnailWrapper,
                  {
                    width: thumbSize,
                    height: thumbSize,
                    backgroundColor: th.colors.muted,
                    borderRadius: th.radius.sm,
                  },
                ]}
              >
                <AnyImage
                  url={item.url}
                  name={item.name}
                  style={styles.thumbnailImage}
                  resizeMode="cover"
                />
              </Pressable>
            )}
          />
        )
      ) : otherFiles.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text
            style={[
              styles.emptyText,
              { color: th.colors.mutedForeground, fontFamily: th.font.regular },
            ]}
          >
            {t("gallery.emptyFiles")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={otherFiles}
          keyExtractor={(item) => item.url}
          contentContainerStyle={[styles.filesListContainer, { paddingBottom: insets.bottom + 16 }]}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${item.role === "user" ? t("gallery.sentByUser") : t("gallery.sentByBot")}`}
              onPress={() => handleOpenFile(item)}
              style={[
                styles.fileRow,
                {
                  backgroundColor: th.colors.card,
                  borderRadius: th.radius.md,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={fileIcon(item.kind, item.name)}
                size={28}
                color={th.colors.foreground}
              />
              <View style={styles.fileInfo}>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="middle"
                  style={[
                    styles.fileName,
                    {
                      color: th.colors.foreground,
                      fontFamily: th.font.medium,
                    },
                  ]}
                >
                  {item.name}
                </Text>
                <Text
                  style={[
                    styles.fileSubtitle,
                    {
                      color: th.colors.mutedForeground,
                      fontFamily: th.font.regular,
                    },
                  ]}
                >
                  {item.role === "user" ? t("gallery.sentByUser") : t("gallery.sentByBot")}
                </Text>
              </View>
              <IconButton
                icon="share-variant"
                size={22}
                color={th.colors.mutedForeground}
                onPress={() => handleShare(item)}
                accessibilityLabel={t("gallery.share")}
              />
            </Pressable>
          )}
        />
      )}

      {/* Full screen viewer */}
      {viewerIndex !== null ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setViewerIndex(null)}
        >
          <View style={[styles.modalBackdrop, { backgroundColor: withAlpha(th.colors.overlay, 0.94) }]}>
            {/* Viewer Top Bar */}
            <View style={[styles.modalHeader, { paddingTop: insets.top + 8 }]}>
              <Text style={[styles.modalCounter, { color: th.colors.overlayForeground, fontFamily: th.font.medium }]}>
                {viewerIndex + 1} / {images.length}
              </Text>
              <IconButton
                icon="close"
                size={24}
                color={th.colors.overlayForeground}
                onPress={() => setViewerIndex(null)}
                accessibilityLabel={t("common.cancel")}
              />
            </View>

            {/* Paging viewer */}
            <FlatList
              data={images}
              keyExtractor={(item) => item.url}
              horizontal
              pagingEnabled
              initialScrollIndex={viewerIndex}
              getItemLayout={(_data, index) => ({
                length: screenWidth,
                offset: screenWidth * index,
                index,
              })}
              onMomentumScrollEnd={(e) => {
                const newIndex = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                setViewerIndex(newIndex);
              }}
              renderItem={({ item }) => (
                <View style={[styles.fullImageWrapper, { width: screenWidth }]}>
                  <AnyImage
                    url={item.url}
                    name={item.name}
                    style={styles.fullImage}
                    resizeMode="contain"
                  />
                </View>
              )}
            />
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontSize: 22,
    lineHeight: 28,
    marginLeft: 8,
  },
  tabBar: {
    flexDirection: "row",
    padding: 4,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: {
    // Background styled with th.colors.card
  },
  tabText: {
    fontSize: 14,
  },
  gridContainer: {
    padding: 16,
    gap: 8,
  },
  thumbnailWrapper: {
    margin: 4,
    overflow: "hidden",
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
  },
  filesListContainer: {
    padding: 16,
    gap: 8,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
    gap: 12,
  },
  fileInfo: {
    flex: 1,
    gap: 2,
  },
  fileName: {
    fontSize: 15,
    lineHeight: 20,
  },
  fileSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 15,
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  modalCounter: {
    fontSize: 16,
  },
  fullImageWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  fullImage: {
    width: "100%",
    height: "100%",
  },
});
