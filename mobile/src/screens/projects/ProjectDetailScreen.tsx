import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useNavigation } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { File } from "expo-file-system";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import { Button, Dialog, IconButton, Sheet, TextField, toast } from "../../ui/components";
import { BotFace } from "../../ui/BotFace";
import { sessionStore, useSession } from "../../state/sessionStore";
import { chatsStore, useChats } from "../../state/chatsStore";
import {
  archiveProject,
  deleteProjectFile,
  downloadProjectFile,
  getProject,
  projectErrorText,
  updateProject,
  uploadProjectFile,
  type FileEntry,
  type ProjectDetail,
} from "../../projects/api";
import { projectsStore } from "../../projects/store";
import { ChatRow } from "../chats/ChatRow";
import { viewerKind } from "../viewer/formats";
import { openLocal } from "../thread/media/media";

export type ProjectDetailScreenProps = {
  id: string;
};

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
const FILE_ICONS: Record<string, IconName> = {
  pdf: "file-pdf-box",
  ppt: "file-powerpoint",
  pptx: "file-powerpoint",
  doc: "file-word",
  docx: "file-word",
  xls: "file-excel",
  xlsx: "file-excel",
  csv: "file-excel",
  zip: "folder-zip",
  py: "file-code",
  js: "file-code",
  ts: "file-code",
  json: "file-code",
  html: "file-code",
  txt: "file-document-outline",
  md: "file-document-outline",
  png: "file-image",
  jpg: "file-image",
  jpeg: "file-image",
  webp: "file-image",
};

function fileIcon(path: string): IconName {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return FILE_ICONS[ext] || "file-outline";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProjectDetailScreen({ id }: ProjectDetailScreenProps) {
  const t = useT();
  const th = useTheme();
  const nav = useNavigation();
  const { session } = useSession();
  const chats = useChats((s) => s.chats);

  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isFirstRender = React.useRef(true);
  const genRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      genRef.current++;
    };
  }, []);

  // Edit metadata sheet
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  // Instructions full screen editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [instructionsDraft, setInstructionsDraft] = useState("");
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [instructionsError, setInstructionsError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // File actions
  type ConflictState = {
    asset: DocumentPicker.DocumentPickerAsset;
    rest: DocumentPicker.DocumentPickerAsset[];
    total: number;
    currentIndex: number;
  };
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<FileEntry | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [conflictState, setConflictState] = useState<ConflictState | null>(null);

  // Archive project dialog
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const loadData = async () => {
    const currentGen = ++genRef.current;
    const profileId = sessionStore?.getState ? sessionStore.getState()?.profile?.id : null;
    if (!session) return;
    setLoading(true);
    try {
      setError(null);
      const res = await getProject(session, id);
      if (!mountedRef.current || currentGen !== genRef.current) return;
      if (sessionStore?.getState && sessionStore.getState()?.profile?.id !== profileId) return;
      setDetail(res);
    } catch (e: any) {
      if (!mountedRef.current || currentGen !== genRef.current) return;
      if (sessionStore?.getState && sessionStore.getState()?.profile?.id !== profileId) return;
      setError(e?.message || "generic");
    } finally {
      if (
        mountedRef.current &&
        currentGen === genRef.current &&
        (!sessionStore?.getState || sessionStore.getState()?.profile?.id === profileId)
      ) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadData();
  }, [id, session]);

  useEffect(() => {
    const unsub = nav?.addListener?.("focus", () => {
      if (isFirstRender.current) {
        isFirstRender.current = false;
        return;
      }
      void loadData();
    });
    return () => unsub?.();
  }, [nav, id, session]);

  // Handle Edit Project Metadata
  const handleOpenEditMeta = () => {
    if (!detail) return;
    setEditName(detail.project.name);
    setEditDescription(detail.project.description || "");
    setEditSheetOpen(true);
  };

  const handleSaveMeta = async () => {
    if (!session || !detail || !editName.trim()) return;
    setSavingMeta(true);
    try {
      const res = await updateProject(session, id, {
        name: editName.trim(),
        description: editDescription.trim(),
      });
      setDetail((prev) => (prev ? { ...prev, project: res.project } : null));
      await projectsStore.getState().refresh();
      setEditSheetOpen(false);
    } catch (e: any) {
      toast.show(projectErrorText(t, e));
    } finally {
      setSavingMeta(false);
    }
  };

  // Handle Instructions
  const handleOpenInstructionsEditor = () => {
    setInstructionsDraft(detail?.instructions || "");
    setInstructionsError(null);
    setEditorOpen(true);
  };

  const handleCloseInstructionsEditor = () => {
    const isDirty = instructionsDraft !== (detail?.instructions || "");
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      setEditorOpen(false);
    }
  };

  const handleSaveInstructions = async () => {
    if (!session || !detail) return;
    setSavingInstructions(true);
    setInstructionsError(null);
    try {
      const res = await updateProject(session, id, {
        instructions: instructionsDraft,
      });
      setDetail((prev) => (prev ? { ...prev, instructions: res.instructions } : null));
      setEditorOpen(false);
    } catch (e: any) {
      setInstructionsError(projectErrorText(t, e));
    } finally {
      setSavingInstructions(false);
    }
  };

  // Handle File Uploads
  const processNextUpload = async (
    assets: DocumentPicker.DocumentPickerAsset[],
    total: number,
    currentIndex: number
  ) => {
    if (assets.length === 0) {
      setUploadProgress(null);
      await loadData();
      return;
    }

    const currentAsset = assets[0];
    const rest = assets.slice(1);

    // Refuse files over 100 MB (with File stat fallback)
    let size = currentAsset.size;
    if (size === undefined || size === null) {
      try {
        size = new File(currentAsset.uri).size;
      } catch {
        // ignore
      }
    }
    if (size && size > 100 * 1024 * 1024) {
      toast.show(projectErrorText(t, "file_too_large"));
      await processNextUpload(rest, total, currentIndex + 1);
      return;
    }

    // Check conflict
    const name = currentAsset.name;
    const exists = detail?.files.some((f) => f.path === name);
    if (exists) {
      setConflictState({ asset: currentAsset, rest, total, currentIndex });
      return;
    }

    // Upload
    if (!session) return;
    setUploadProgress(t("projects.uploadProgress", { current: currentIndex + 1, total }));
    try {
      await uploadProjectFile(
        session,
        id,
        name,
        {
          uri: currentAsset.uri,
          name,
          mime: currentAsset.mimeType,
        },
        false
      );
    } catch (e: any) {
      const msg = e?.message;
      if (msg === "file_exists") {
        setConflictState({ asset: currentAsset, rest, total, currentIndex });
        return;
      }
      toast.show(projectErrorText(t, e));
    }

    await processNextUpload(rest, total, currentIndex + 1);
  };

  const handlePickFiles = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        await processNextUpload(res.assets, res.assets.length, 0);
      }
    } catch (e: any) {
      toast.show(projectErrorText(t, e));
    }
  };

  const handleConfirmReplace = async (overwrite: boolean) => {
    if (!conflictState) return;
    const { asset, rest, total, currentIndex } = conflictState;
    setConflictState(null);

    if (overwrite && session) {
      setUploadProgress(t("projects.uploadProgress", { current: currentIndex + 1, total }));
      try {
        await uploadProjectFile(
          session,
          id,
          asset.name,
          {
            uri: asset.uri,
            name: asset.name,
            mime: asset.mimeType,
          },
          true
        );
      } catch (e: any) {
        toast.show(projectErrorText(t, e));
      }
    }

    await processNextUpload(rest, total, currentIndex + 1);
  };

  // Handle File Download / Open
  const handleOpenFile = async (file: FileEntry) => {
    if (!session || downloadingPath) return;
    setDownloadingPath(file.path);
    try {
      const localUri = await downloadProjectFile(session, id, file);
      const ext = file.path.split(".").pop() || "";
      if (viewerKind(file.path) !== null) {
        router.push({ pathname: "/viewer", params: { uri: localUri, name: file.path } });
      } else {
        await openLocal(localUri, ext);
      }
    } catch (e: any) {
      toast.show(projectErrorText(t, e));
    } finally {
      setDownloadingPath(null);
    }
  };

  // Handle File Deletion
  const handleDeleteFile = async () => {
    if (!session || !fileToDelete) return;
    const path = fileToDelete.path;
    setFileToDelete(null);
    try {
      await deleteProjectFile(session, id, path);
      await loadData();
    } catch (e: any) {
      toast.show(projectErrorText(t, e));
    }
  };

  // Handle New Chat in Project
  const handleNewChat = async () => {
    if (!detail) return;
    try {
      const key = await chatsStore.getState().newChat({
        project_path: detail.project.path,
        access_mode: "restricted",
      });
      router.push(`/chat/${encodeURIComponent(key)}`);
    } catch (e: any) {
      toast.show(e instanceof Error ? e.message : String(e));
    }
  };

  // Handle Archive Project
  const handleArchive = async () => {
    if (!session) return;
    setArchiving(true);
    setShowArchiveDialog(false);
    try {
      await archiveProject(session, id);
      await projectsStore.getState().refresh();
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/projects");
      }
    } catch (e: any) {
      toast.show(projectErrorText(t, e));
    } finally {
      setArchiving(false);
    }
  };

  if (error && !detail) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: th.colors.background }}>
        <View style={styles.header}>
          <IconButton icon="arrow-left" accessibilityLabel={t("common.back")} onPress={() => router.back()} />
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={{
              flex: 1,
              color: th.colors.foreground,
              fontFamily: th.font.display,
              fontSize: 22,
              lineHeight: 28,
            }}
          >
            {t("projects.title")}
          </Text>
        </View>
        <View style={[styles.centerLoading, { gap: 12, paddingHorizontal: 24 }]}>
          <BotFace state="error" size={48} />
          <Text style={{ color: th.colors.destructive, fontFamily: th.font.regular, fontSize: 14, textAlign: "center" }}>
            {projectErrorText(t, error)}
          </Text>
          <Button title={t("common.retry")} variant="secondary" onPress={() => void loadData()} loading={loading} />
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !detail) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: th.colors.background }}>
        <View style={styles.header}>
          <IconButton icon="arrow-left" accessibilityLabel={t("common.back")} onPress={() => router.back()} />
        </View>
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={th.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const projectChats = detail
    ? chats.filter((c) => c.workspaceScope?.project_path === detail.project.path)
    : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.colors.background }}>
      {/* Top Header */}
      <View style={styles.header}>
        <IconButton icon="arrow-left" accessibilityLabel={t("common.back")} onPress={() => router.back()} />
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={{
            flex: 1,
            color: th.colors.foreground,
            fontFamily: th.font.display,
            fontSize: 22,
            lineHeight: 28,
          }}
        >
          {detail?.project.name || t("projects.title")}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadData()} />}
      >
        {/* Section 1: Description and Edit */}
        <View style={styles.section}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              {detail?.project.description ? (
                <Text style={[styles.mainDescription, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                  {detail.project.description}
                </Text>
              ) : (
                <Text style={[styles.mainDescription, { color: th.colors.mutedForeground, fontFamily: th.font.regular, fontStyle: "italic" }]}>
                  {t("projects.noDescription")}
                </Text>
              )}
            </View>
            <Button title={t("common.edit")} variant="secondary" onPress={handleOpenEditMeta} />
          </View>
        </View>

        {/* Section 2: Istruzioni */}
        <View style={[styles.section, { borderTopColor: th.colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <Text style={[styles.sectionTitle, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
            {t("projects.instructions")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={handleOpenInstructionsEditor}
            style={({ pressed }) => [
              styles.instructionsBox,
              {
                backgroundColor: pressed ? th.colors.accent : th.colors.card,
                borderColor: th.colors.border,
                borderRadius: th.radius.md,
              },
            ]}
          >
            {detail?.instructions ? (
              <Text
                numberOfLines={6}
                style={[styles.instructionsText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}
              >
                {detail.instructions}
              </Text>
            ) : (
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontStyle: "italic", fontSize: 14 }}>
                {t("projects.instructionsEmpty")}
              </Text>
            )}
          </Pressable>
        </View>

        {/* Section 3: File */}
        <View style={[styles.section, { borderTopColor: th.colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={[styles.sectionTitle, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
              {t("projects.files")}
            </Text>
            <Button title={t("projects.uploadFile")} variant="secondary" onPress={() => void handlePickFiles()} />
          </View>

          {uploadProgress ? (
            <View style={styles.uploadProgressRow}>
              <ActivityIndicator size="small" color={th.colors.primary} />
              <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 13 }}>
                {uploadProgress}
              </Text>
            </View>
          ) : null}

          {detail?.files && detail.files.length > 0 ? (
            <View style={{ gap: 6 }}>
              {detail.files.map((f) => {
                const isDownloading = downloadingPath === f.path;
                return (
                  <Pressable
                    key={f.path}
                    accessibilityRole="button"
                    onPress={() => void handleOpenFile(f)}
                    onLongPress={() => setFileToDelete(f)}
                    style={({ pressed }) => [
                      styles.fileRow,
                      {
                        backgroundColor: pressed ? th.colors.accent : th.colors.card,
                        borderColor: th.colors.border,
                        borderRadius: th.radius.md,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name={fileIcon(f.path)} size={26} color={th.colors.foreground} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text numberOfLines={1} style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 14 }}>
                        {f.path}
                      </Text>
                      <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 12 }}>
                        {formatBytes(f.size)} · {new Date(f.modified_at).toLocaleDateString()}
                      </Text>
                    </View>
                    {isDownloading ? (
                      <ActivityIndicator size="small" color={th.colors.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 14, paddingVertical: 8 }}>
              {t("projects.emptyFiles")}
            </Text>
          )}
        </View>

        {/* Section 4: Chat */}
        <View style={[styles.section, { borderTopColor: th.colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={[styles.sectionTitle, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
              {t("projects.chats")}
            </Text>
            <Button title={t("projects.newChat")} onPress={() => void handleNewChat()} />
          </View>

          {projectChats.length > 0 ? (
            <View style={{ marginHorizontal: -8 }}>
              {projectChats.map((c) => (
                <ChatRow
                  key={c.key}
                  chat={c}
                  active={false}
                  onPress={() => router.push(`/chat/${encodeURIComponent(c.key)}`)}
                  onLongPress={() => {}}
                />
              ))}
            </View>
          ) : (
            <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 14, paddingVertical: 8 }}>
              {t("projects.emptyChats")}
            </Text>
          )}
        </View>

        {/* Section 5: Archivia progetto */}
        <View style={[styles.section, { borderTopColor: th.colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 24 }]}>
          <Button
            title={t("projects.archive")}
            variant="ghost"
            color={th.colors.destructive}
            onPress={() => setShowArchiveDialog(true)}
            loading={archiving}
          />
        </View>
      </ScrollView>

      {/* Edit Metadata Sheet */}
      <Sheet open={editSheetOpen} onClose={() => setEditSheetOpen(false)} title={t("projects.editProject")}>
        <View style={styles.sheetBody}>
          <TextField label={t("projects.name")} value={editName} onChangeText={setEditName} />
          <TextField label={t("projects.description")} value={editDescription} onChangeText={setEditDescription} multiline />
          <View style={{ marginTop: 8 }}>
            <Button
              title={savingMeta ? t("common.saving") : t("common.save")}
              onPress={() => void handleSaveMeta()}
              loading={savingMeta}
            />
          </View>
        </View>
      </Sheet>

      {/* Full Screen Instructions Editor Modal */}
      <Modal visible={editorOpen} animationType="slide" onRequestClose={handleCloseInstructionsEditor}>
        <SafeAreaView style={{ flex: 1, backgroundColor: th.colors.background }}>
          <View style={styles.modalHeader}>
            <IconButton icon="close" accessibilityLabel={t("common.close")} onPress={handleCloseInstructionsEditor} />
            <Text accessibilityRole="header" style={{ flex: 1, color: th.colors.foreground, fontFamily: th.font.displayBold, fontSize: 18 }}>
              {t("projects.editInstructions")}
            </Text>
            <Button
              title={savingInstructions ? t("common.saving") : t("common.save")}
              variant="primary"
              onPress={() => void handleSaveInstructions()}
              loading={savingInstructions}
            />
          </View>

          {instructionsError ? (
            <View style={[styles.instructionsErrorBanner, { backgroundColor: th.colors.card, borderBottomColor: th.colors.border }]}>
              <Text style={{ color: th.colors.destructive, fontFamily: th.font.regular, fontSize: 13 }}>
                {instructionsError}
              </Text>
            </View>
          ) : null}

          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <TextInput
              multiline
              value={instructionsDraft}
              onChangeText={(text) => {
                setInstructionsDraft(text);
                if (instructionsError) setInstructionsError(null);
              }}
              style={[
                styles.instructionsEditor,
                {
                  color: th.colors.foreground,
                  fontFamily: th.font.regular,
                  backgroundColor: th.colors.card,
                },
              ]}
              textAlignVertical="top"
              autoFocus
            />
          </KeyboardAvoidingView>

          {/* Discard Instructions Confirmation inside Modal (Item 6) */}
          <Dialog
            open={showDiscardConfirm}
            title={t("projects.discardChangesTitle")}
            message={t("projects.discardChangesMessage")}
            confirmLabel={t("projects.discard")}
            cancelLabel={t("common.cancel")}
            destructive
            onConfirm={() => {
              setShowDiscardConfirm(false);
              setEditorOpen(false);
            }}
            onCancel={() => setShowDiscardConfirm(false)}
          />
        </SafeAreaView>
      </Modal>

      {/* Delete File Confirmation */}
      <Dialog
        open={!!fileToDelete}
        title={t("projects.deleteFileTitle")}
        message={t("projects.deleteFileMessage", { name: fileToDelete?.path || "" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => void handleDeleteFile()}
        onCancel={() => setFileToDelete(null)}
      />

      {/* Replace File Conflict Dialog */}
      <Dialog
        open={!!conflictState}
        title={t("projects.replaceFileTitle")}
        message={t("projects.replaceFileMessage", { name: conflictState?.asset.name || "" })}
        confirmLabel={t("projects.replace")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void handleConfirmReplace(true)}
        onCancel={() => void handleConfirmReplace(false)}
      />

      {/* Archive Project Confirmation */}
      <Dialog
        open={showArchiveDialog}
        title={t("projects.archiveConfirmTitle")}
        message={t("projects.archiveConfirmMessage")}
        confirmLabel={t("projects.archive")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => void handleArchive()}
        onCancel={() => setShowArchiveDialog(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
  section: {
    paddingVertical: 16,
    gap: 8,
  },
  mainTitle: {
    fontSize: 22,
    marginBottom: 4,
  },
  mainDescription: {
    fontSize: 15,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 4,
  },
  instructionsBox: {
    padding: 12,
    borderWidth: 1,
    minHeight: 80,
  },
  instructionsText: {
    fontSize: 14,
    lineHeight: 20,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    gap: 12,
    minHeight: 52,
  },
  uploadProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  centerLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetBody: {
    paddingBottom: 16,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  instructionsEditor: {
    flex: 1,
    padding: 16,
    fontSize: 15,
    lineHeight: 22,
  },
  instructionsErrorBanner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
