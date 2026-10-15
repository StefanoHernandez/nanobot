import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useNavigation } from "expo-router";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import { Button, IconButton, Sheet, TextField, toast } from "../../ui/components";
import { BotFace } from "../../ui/BotFace";
import { useSession } from "../../state/sessionStore";
import { useChats } from "../../state/chatsStore";
import { createProject, projectErrorText, type Project } from "../../projects/api";
import { projectsStore, useProjects } from "../../projects/store";

export function ProjectsScreen() {
  const t = useT();
  const th = useTheme();
  const nav = useNavigation();
  const { session } = useSession();
  const projects = useProjects((s) => s.projects);
  const loading = useProjects((s) => s.loading);
  const error = useProjects((s) => s.error);
  const refresh = projectsStore.getState().refresh;
  const chats = useChats((s) => s.chats);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unsub = nav?.addListener?.("focus", () => {
      void refresh();
    });
    return () => unsub?.();
  }, [nav, refresh]);

  const handleOpenCreate = () => {
    setName("");
    setDescription("");
    setNameError(undefined);
    setSheetOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setNameError(t("projects.nameRequired"));
      return;
    }
    if (!session) {
      toast.show(t("projects.err.generic"));
      return;
    }

    setCreating(true);
    setNameError(undefined);
    try {
      const res = await createProject(session, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      await refresh();
      setSheetOpen(false);
      router.push(`/projects/${res.project.id}`);
    } catch (e: any) {
      toast.show(projectErrorText(t, e));
    } finally {
      setCreating(false);
    }
  };

  const countChats = (path: string) =>
    chats.filter((c) => c.workspaceScope?.project_path === path).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.colors.background }}>
      {/* Header in SettingsShell style */}
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

      {error ? (
        <View style={[styles.errorCard, { backgroundColor: th.colors.card, borderColor: th.colors.destructive }]}>
          <Text style={{ color: th.colors.destructive, fontFamily: th.font.regular, fontSize: 14 }}>
            {projectErrorText(t, error)}
          </Text>
          <Button title={t("common.retry")} variant="secondary" onPress={() => void refresh()} loading={loading} />
        </View>
      ) : null}

      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
        ListHeaderComponent={
          projects.length > 0 ? (
            <View style={styles.topActions}>
              <Button title={t("projects.newProject")} onPress={handleOpenCreate} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <BotFace state="idle" size={48} />
              <Text style={[styles.emptyTitle, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
                {t("projects.emptyTitle")}
              </Text>
              <Text style={[styles.emptySubtitle, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                {t("projects.emptySubtitle")}
              </Text>
              <View style={{ marginTop: 12, minWidth: 160 }}>
                <Button title={t("projects.newProject")} onPress={handleOpenCreate} />
              </View>
            </View>
          ) : (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="small" color={th.colors.primary} />
            </View>
          )
        }
        renderItem={({ item }) => {
          const chatCount = countChats(item.path);
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/projects/${item.id}`)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: pressed ? th.colors.accent : th.colors.card,
                  borderColor: th.colors.border,
                  borderRadius: th.radius.md,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
                {item.name}
              </Text>
              {item.description ? (
                <Text
                  numberOfLines={2}
                  style={[styles.cardDescription, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}
                >
                  {item.description}
                </Text>
              ) : null}
              <Text style={[styles.cardMeta, { color: th.colors.mutedForeground, fontFamily: th.font.medium }]}>
                {t("projects.meta", { files: item.file_count, chats: chatCount })}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* New Project Sheet */}
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t("projects.newProject")}>
        <View style={styles.sheetBody}>
          <TextField
            label={t("projects.name")}
            value={name}
            onChangeText={(val) => {
              setName(val);
              if (nameError) setNameError(undefined);
            }}
            error={nameError}
          />
          <TextField
            label={t("projects.description")}
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <View style={{ marginTop: 8 }}>
            <Button
              title={creating ? t("common.saving") : t("common.save")}
              onPress={() => void handleCreate()}
              loading={creating}
              disabled={creating}
            />
          </View>
        </View>
      </Sheet>
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
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  topActions: {
    paddingVertical: 8,
    alignItems: "flex-start",
  },
  card: {
    padding: 16,
    borderWidth: 1,
    gap: 6,
    minHeight: 56,
  },
  cardTitle: {
    fontSize: 17,
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 19,
  },
  cardMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  centerLoading: {
    paddingVertical: 48,
    alignItems: "center",
  },
  errorCard: {
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  sheetBody: {
    paddingBottom: 16,
    gap: 12,
  },
});
