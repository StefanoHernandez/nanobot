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
import type { UIMessage } from "@/lib/types";
import { useT } from "../../i18n";
import { useSession } from "../../state/sessionStore";
import { useThreadSlice } from "../../state/threadStore";
import { IconButton } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { withAlpha } from "../../ui/theme";
import { absoluteMediaUrl, classify } from "../thread/media/media";

export type GalleryScreenProps = {
  chatKey: string;
};

export type GalleryImage = {
  url: string;
  name?: string;
};

export function collectThreadImages(messages: UIMessage[], baseUrl: string): GalleryImage[] {
  const images: GalleryImage[] = [];
  const seenUrls = new Set<string>();

  for (const m of messages) {
    // 1. m.media where classify === "image" and url is set
    if (m.media) {
      for (const item of m.media) {
        if (item.url && classify(item) === "image") {
          const abs = absoluteMediaUrl(baseUrl, item.url);
          if (!seenUrls.has(abs)) {
            seenUrls.add(abs);
            images.push({ url: abs, name: item.name });
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
            images.push({ url: abs, name: img.name });
          }
        }
      }
    }
  }

  return images;
}

export function GalleryScreen({ chatKey }: GalleryScreenProps) {
  const th = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { messages } = useThreadSlice(chatKey);
  const { profile } = useSession();
  const baseUrl = profile?.baseUrl ?? "";

  const images = useMemo(
    () => collectThreadImages(messages, baseUrl),
    [messages, baseUrl],
  );

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const numColumns = 3;
  const screenWidth = Dimensions.get("window").width;
  const thumbSize = (screenWidth - 32) / numColumns - 8; // 16 container padding per side, 4 margin per side of each thumb

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
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

      {/* Grid */}
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
