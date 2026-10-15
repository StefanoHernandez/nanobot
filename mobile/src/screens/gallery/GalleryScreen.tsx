import { AnyImage } from "../../ui/AnyImage";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { collectArtifacts, type Artifact } from "../../artifacts/collect";
import { listProjects, uploadProjectFile, type Project } from "../../projects/api";
import {
  artifactRowTitle,
  latestArtifactVersion,
  openGalleryArtifactPreview,
  writeGalleryArtifactUpload,
} from "./galleryArtifacts";
import { Dialog, IconButton, Sheet, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { withAlpha } from "../../ui/theme";
import { artifactStore } from "../viewer/artifactStore";
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
  const seenImageUrls = new Set<string>();
  const seenOtherUrls = new Set<string>();

  for (const m of messages) {
    const role: "user" | "assistant" = m.role === "user" ? "user" : "assistant";

    // 1. m.media where url is set
    if (m.media) {
      for (const item of m.media) {
        if (item.url) {
          const abs = absoluteMediaUrl(baseUrl, item.url);
          const kind = classify(item);
          const isImage = kind === "image";
          const seen = isImage ? seenImageUrls : seenOtherUrls;
          if (!seen.has(abs)) {
            seen.add(abs);
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
          if (!seenImageUrls.has(abs)) {
            seenImageUrls.add(abs);
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

type FileRowItemProps = {
  item: ThreadFile;
  busy: boolean;
  onOpen: (item: ThreadFile) => void;
  onShare: (item: ThreadFile) => void;
};

type ArtifactRowItemProps = {
  item: Artifact;
  saveBusy: boolean;
  onOpen: (item: Artifact) => void;
  onSave: (item: Artifact) => void;
};

function ArtifactRowItem({ item, saveBusy, onOpen, onSave }: ArtifactRowItemProps) {
  const th = useTheme();
  const t = useT();
  const latest = latestArtifactVersion(item);
  const title = artifactRowTitle(item);
  const kind = latest?.kind ?? "html";

  return (
    <Pressable
      testID="gallery-artifact-row"
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${kind}`}
      onPress={() => onOpen(item)}
      style={[
        styles.fileRow,
        {
          backgroundColor: th.colors.card,
          borderRadius: th.radius.md,
        },
      ]}
    >
      <View style={styles.iconContainer}>
        <MaterialCommunityIcons name="file-code-outline" size={28} color={th.colors.foreground} />
      </View>
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
          {title}
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
          {kind}
        </Text>
      </View>
      <IconButton
        icon="folder-upload-outline"
        size={22}
        color={th.colors.mutedForeground}
        loading={saveBusy}
        disabled={saveBusy}
        onPress={() => onSave(item)}
        accessibilityLabel={t("gallery.saveToProject")}
      />
    </Pressable>
  );
}

function FileRowItem({ item, busy, onOpen, onShare }: FileRowItemProps) {
  const th = useTheme();
  const t = useT();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.role === "user" ? t("gallery.sentByUser") : t("gallery.sentByBot")}`}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={() => onOpen(item)}
      style={[
        styles.fileRow,
        {
          backgroundColor: th.colors.card,
          borderRadius: th.radius.md,
        },
      ]}
    >
      <View style={styles.iconContainer}>
        {busy ? (
          <ActivityIndicator
            size="small"
            color={th.colors.foreground}
            accessibilityLabel={t("media.opening")}
          />
        ) : (
          <MaterialCommunityIcons
            name={fileIcon(item.kind, item.name)}
            size={28}
            color={th.colors.foreground}
          />
        )}
      </View>
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
        loading={busy}
        disabled={busy}
        onPress={() => onShare(item)}
        accessibilityLabel={t("gallery.share")}
      />
    </Pressable>
  );
}

export function GalleryScreen({ chatKey }: GalleryScreenProps) {
  const th = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { messages } = useThreadSlice(chatKey);
  const { profile, session } = useSession();
  const baseUrl = profile?.baseUrl ?? "";

  const files = useMemo(
    () => collectThreadFiles(messages, baseUrl),
    [messages, baseUrl],
  );
  const images = useMemo(() => files.filter((f) => f.kind === "image"), [files]);
  const otherFiles = useMemo(() => files.filter((f) => f.kind !== "image"), [files]);
  const artifacts = useMemo(() => collectArtifacts(messages), [messages]);

  const [manualTab, setManualTab] = useState<"images" | "files" | "artifacts" | null>(null);
  const activeTab = manualTab ?? (images.length === 0 && otherFiles.length > 0 ? "files" : "images");

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [busyUrls, setBusyUrls] = useState<Record<string, boolean>>({});
  const busyRef = useRef<Record<string, boolean>>({});
  const [saveArtifact, setSaveArtifact] = useState<Artifact | null>(null);
  const [saveProjects, setSaveProjects] = useState<Project[]>([]);
  const [saveProjectsLoading, setSaveProjectsLoading] = useState(false);
  const [saveUploadBusy, setSaveUploadBusy] = useState(false);
  const [conflictTarget, setConflictTarget] = useState<{
    project: Project;
    local: { uri: string; name: string; mime: string };
  } | null>(null);

  useEffect(() => {
    if (!saveArtifact || !session) {
      setSaveProjects([]);
      return;
    }
    let cancelled = false;
    setSaveProjectsLoading(true);
    void listProjects(session)
      .then((res) => {
        if (!cancelled) setSaveProjects(res.projects);
      })
      .catch(() => {
        if (!cancelled) setSaveProjects([]);
      })
      .finally(() => {
        if (!cancelled) setSaveProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [saveArtifact, session]);

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
    if (busyRef.current[item.url]) return;
    busyRef.current[item.url] = true;
    setBusyUrls((prev) => ({ ...prev, [item.url]: true }));
    try {
      const local = await downloadMedia(item.url, item.name);
      if (viewerKind(item.name) !== null) {
        router.push({ pathname: "/viewer", params: { uri: local, name: item.name } });
      } else {
        await openLocal(local, fileExt(item.name));
      }
    } catch {
      toast.show(t("media.openFailed"));
    } finally {
      busyRef.current[item.url] = false;
      setBusyUrls((prev) => {
        const next = { ...prev };
        delete next[item.url];
        return next;
      });
    }
  };

  const handleOpenArtifact = (item: Artifact) => {
    openGalleryArtifactPreview(item, chatKey);
  };

  const handleSaveArtifactPress = (item: Artifact) => {
    if (!session) {
      toast.show(t("common.operationFailed"));
      return;
    }
    setSaveArtifact(item);
  };

  const resolveArtifactForUpload = (artifact: Artifact): Artifact => {
    const opened = artifactStore.get();
    if (
      opened &&
      opened.id &&
      opened.id === artifact.id &&
      opened.index != null &&
      artifact.versions[opened.index]
    ) {
      return { ...artifact, versions: [artifact.versions[opened.index]] };
    }
    const latest = latestArtifactVersion(artifact);
    return latest ? { ...artifact, versions: [latest] } : artifact;
  };

  const handleConfirmSaveToProject = async (project: Project) => {
    if (!session || !saveArtifact || saveUploadBusy) return;
    const targetArtifact = resolveArtifactForUpload(saveArtifact);
    const local = writeGalleryArtifactUpload(targetArtifact);
    if (!local) {
      toast.show(t("gallery.saveFailed"));
      return;
    }
    setSaveUploadBusy(true);
    try {
      await uploadProjectFile(session, project.id, local.name, local);
      toast.show(t("gallery.saved"));
      setSaveArtifact(null);
      setConflictTarget(null);
    } catch (e: any) {
      if (e?.message === "file_exists") {
        setConflictTarget({ project, local });
      } else {
        toast.show(t("gallery.saveFailed"));
      }
    } finally {
      setSaveUploadBusy(false);
    }
  };

  const handleConfirmOverwrite = async () => {
    if (!conflictTarget || !session) return;
    const { project, local } = conflictTarget;
    setConflictTarget(null);
    setSaveUploadBusy(true);
    try {
      await uploadProjectFile(session, project.id, local.name, local, true);
      toast.show(t("gallery.saved"));
      setSaveArtifact(null);
    } catch {
      toast.show(t("gallery.saveFailed"));
    } finally {
      setSaveUploadBusy(false);
    }
  };

  const handleShare = async (item: ThreadFile) => {
    if (busyRef.current[item.url]) return;
    busyRef.current[item.url] = true;
    setBusyUrls((prev) => ({ ...prev, [item.url]: true }));
    try {
      const local = await downloadMedia(item.url, item.name);
      await shareMedia(local);
    } catch {
      toast.show(t("media.shareFailed"));
    } finally {
      busyRef.current[item.url] = false;
      setBusyUrls((prev) => {
        const next = { ...prev };
        delete next[item.url];
        return next;
      });
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

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "artifacts" }}
          accessibilityLabel={t("gallery.tabArtifacts")}
          onPress={() => setManualTab("artifacts")}
          style={[
            styles.tabButton,
            activeTab === "artifacts" && [
              styles.tabButtonActive,
              { backgroundColor: th.colors.card },
            ],
          ]}
        >
          <Text
            style={[
              styles.tabText,
              {
                color: activeTab === "artifacts" ? th.colors.foreground : th.colors.mutedForeground,
                fontFamily: activeTab === "artifacts" ? th.font.medium : th.font.regular,
              },
            ]}
          >
            {t("gallery.tabArtifacts")}
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
            key="gallery-images"
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
      ) : activeTab === "files" ? (
        otherFiles.length === 0 ? (
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
            key="gallery-files"
            data={otherFiles}
            keyExtractor={(item) => item.url}
            contentContainerStyle={[styles.filesListContainer, { paddingBottom: insets.bottom + 16 }]}
            renderItem={({ item }) => (
              <FileRowItem
                item={item}
                busy={!!busyUrls[item.url]}
                onOpen={handleOpenFile}
                onShare={handleShare}
              />
            )}
          />
        )
      ) : artifacts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text
            style={[
              styles.emptyText,
              { color: th.colors.mutedForeground, fontFamily: th.font.regular },
            ]}
          >
            {t("gallery.emptyArtifacts")}
          </Text>
        </View>
      ) : (
        <FlatList
          key="gallery-artifacts"
          data={artifacts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.filesListContainer, { paddingBottom: insets.bottom + 16 }]}
          renderItem={({ item }) => (
            <ArtifactRowItem
              item={item}
              saveBusy={saveUploadBusy && saveArtifact?.id === item.id}
              onOpen={handleOpenArtifact}
              onSave={handleSaveArtifactPress}
            />
          )}
        />
      )}

      {/* Full screen viewer */}
      <Sheet
        open={saveArtifact !== null}
        title={t("gallery.saveToProject")}
        onClose={() => {
          if (!saveUploadBusy) setSaveArtifact(null);
        }}
      >
        {saveProjectsLoading ? (
          <View style={styles.sheetLoading}>
            <ActivityIndicator size="small" color={th.colors.primary} />
          </View>
        ) : saveProjects.length === 0 ? (
          <View style={styles.sheetEmpty}>
            <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 15, textAlign: "center" }}>
              {t("projects.emptyTitle")}
            </Text>
          </View>
        ) : (
          saveProjects.map((project) => (
            <Pressable
              key={project.id}
              testID="gallery-save-project-row"
              accessibilityRole="button"
              accessibilityLabel={project.name}
              disabled={saveUploadBusy}
              onPress={() => void handleConfirmSaveToProject(project)}
              style={({ pressed }) => [
                styles.projectRow,
                {
                  backgroundColor: pressed ? th.colors.accent : th.colors.card,
                  borderRadius: th.radius.md,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: th.colors.foreground,
                  fontFamily: th.font.medium,
                  fontSize: 16,
                }}
              >
                {project.name}
              </Text>
            </Pressable>
          ))
        )}
      </Sheet>

      <Dialog
        open={!!conflictTarget}
        title={t("gallery.fileExistsConfirm")}
        message={conflictTarget?.local.name}
        confirmLabel={t("gallery.overwrite")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void handleConfirmOverwrite()}
        onCancel={() => setConflictTarget(null)}
      />

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
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <IconButton
                  icon="share-variant"
                  size={24}
                  color={th.colors.overlayForeground}
                  onPress={() => {
                    const item = images[viewerIndex];
                    if (item) void handleShare(item);
                  }}
                  accessibilityLabel={t("gallery.share")}
                />
                <IconButton
                  icon="close"
                  size={24}
                  color={th.colors.overlayForeground}
                  onPress={() => setViewerIndex(null)}
                  accessibilityLabel={t("common.cancel")}
                />
              </View>
            </View>

            {/* Paging viewer */}
            <FlatList
              key="gallery-viewer"
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
  iconContainer: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
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
  sheetLoading: {
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetEmpty: {
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  projectRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    justifyContent: "center",
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
