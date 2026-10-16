import React, { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useStore } from "zustand";
import { useT } from "../i18n";
import { projectsStore } from "../projects/store";
import { chatsStore } from "../state/chatsStore";
import { useSession } from "../state/sessionStore";
import { threadStore } from "../state/threadStore";
import { Button } from "../ui/components/Button";
import { IconButton } from "../ui/components/IconButton";
import { Sheet } from "../ui/components/Sheet";
import { TextField } from "../ui/components/TextField";
import { useTheme } from "../ui/ThemeProvider";
import { PromptEditorSheet } from "./PromptEditorSheet";
import {
  fillPrompt,
  markUsed,
  PromptItem,
  usePrompts,
} from "./prompts";

export type PromptPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  chatKey?: string;
  projectId?: string | null;
  onInsert?: (text: string) => void;
};

export function PromptPickerSheet({
  open,
  onClose,
  chatKey,
  projectId,
  onInsert,
}: PromptPickerSheetProps) {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();

  const chat = useStore(chatsStore, (s) =>
    chatKey ? s.chats.find((c) => c.key === chatKey) : null,
  );
  const projects = useStore(projectsStore, (s) => s.projects);
  const byPath = useStore(projectsStore, (s) => s.byPath);
  const pPath = chat?.workspaceScope?.project_path;

  const needsProjectLoad =
    projectId === undefined &&
    Boolean(pPath) &&
    projects.length === 0 &&
    !byPath[pPath!];

  const [projectsReady, setProjectsReady] = useState(!needsProjectLoad);

  useEffect(() => {
    if (!open) return;
    if (needsProjectLoad) {
      setProjectsReady(false);
      let cancelled = false;
      void projectsStore
        .getState()
        .refresh()
        .finally(() => {
          if (!cancelled) setProjectsReady(true);
        });
      return () => {
        cancelled = true;
      };
    }
    setProjectsReady(true);
  }, [open, needsProjectLoad]);

  let resolvedProjectId: string | null = null;
  if (projectId !== undefined) {
    resolvedProjectId = projectId;
  } else if (pPath) {
    resolvedProjectId = byPath[pPath]?.id ?? null;
  }

  const { prompts, loading } = usePrompts(resolvedProjectId, open && projectsReady);
  const draft = useStore(threadStore, (s) =>
    chatKey ? s.threads[chatKey]?.draft ?? "" : "",
  );

  const [search, setSearch] = useState("");
  const [selectedForVariables, setSelectedForVariables] = useState<PromptItem | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const variableValuesRef = React.useRef<Record<string, string>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptItem | null>(null);
  const [editorInitialBody, setEditorInitialBody] = useState<string | undefined>(undefined);

  const currentProjectId = resolvedProjectId;
  const visiblePrompts = prompts.filter(
    (p) => p.project_id == null || p.project_id === currentProjectId,
  );

  const hasSearch = search.trim().length > 0;
  const filtered = visiblePrompts.filter((p) => {
    if (!hasSearch) return true;
    const q = search.trim().toLowerCase();
    return p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q);
  });

  const insertAndClose = (text: string, id: string) => {
    if (session) {
      void markUsed(session, id).catch(() => {});
    }
    if (onInsert) {
      onInsert(text);
    } else if (chatKey) {
      const curDraft = threadStore.getState().threads[chatKey]?.draft ?? "";
      const nextDraft = curDraft.trim().length > 0 ? `${curDraft}\n\n${text}` : text;
      threadStore.getState().setDraft(chatKey, nextDraft);
    }
    onClose();
  };

  const handleSelectPrompt = (p: PromptItem) => {
    if (!p.variables || p.variables.length === 0) {
      insertAndClose(p.body, p.id);
    } else {
      setSelectedForVariables(p);
      const initVals: Record<string, string> = {};
      for (const v of p.variables) {
        initVals[v] = "";
      }
      variableValuesRef.current = initVals;
      setVariableValues(initVals);
    }
  };

  const handleInsertVariables = () => {
    if (!selectedForVariables) return;
    const filled = fillPrompt(selectedForVariables.body, variableValuesRef.current);
    const id = selectedForVariables.id;
    setSelectedForVariables(null);
    insertAndClose(filled, id);
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title={t("prompts.title")}>
        {selectedForVariables ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.variableContainer}
          >
            <Text
              style={[
                styles.itemTitle,
                { color: th.colors.foreground, fontFamily: th.font.medium },
              ]}
            >
              {selectedForVariables.title}
            </Text>

            {selectedForVariables.variables.map((v) => (
              <TextField
                key={v}
                label={v}
                value={variableValues[v] ?? ""}
                onChangeText={(val) => {
                  variableValuesRef.current[v] = val;
                  setVariableValues((prev) => ({ ...prev, [v]: val }));
                }}
                placeholder={v}
              />
            ))}

            <View style={styles.actionsRow}>
              <View style={styles.btnWrap}>
                <Button
                  title={t("common.cancel")}
                  variant="ghost"
                  onPress={() => setSelectedForVariables(null)}
                />
              </View>
              <View style={styles.btnWrap}>
                <Button
                  title={t("prompts.insert")}
                  onPress={handleInsertVariables}
                />
              </View>
            </View>
          </ScrollView>
        ) : (
          <View style={styles.mainContainer}>
            <TextField
              label={t("prompts.search")}
              placeholder={t("prompts.search")}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {filtered.length === 0 && !loading ? (
              <View style={styles.emptyContainer}>
                <Text
                  style={[
                    styles.emptyText,
                    { color: th.colors.mutedForeground, fontFamily: th.font.regular },
                  ]}
                >
                  {visiblePrompts.length === 0 ? t("prompts.empty") : t("prompts.noMatches")}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                style={styles.list}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                    onPress={() => handleSelectPrompt(item)}
                    onLongPress={() => {
                      setEditingPrompt(item);
                      setEditorInitialBody(undefined);
                      setEditorOpen(true);
                    }}
                    style={({ pressed }) => [
                      styles.itemRow,
                      {
                        backgroundColor: pressed ? th.colors.accent : "transparent",
                        borderRadius: th.radius.sm,
                      },
                    ]}
                  >
                    <View style={styles.itemInfo}>
                      <View style={styles.titleRow}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.itemTitle,
                            {
                              color: th.colors.foreground,
                              fontFamily: th.font.medium,
                            },
                          ]}
                        >
                          {item.title}
                        </Text>
                        {item.project_id != null && (
                          <View
                            style={[
                              styles.badge,
                              {
                                backgroundColor: th.colors.muted,
                                borderRadius: th.radius.sm,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.badgeText,
                                {
                                  color: th.colors.mutedForeground,
                                  fontFamily: th.font.medium,
                                },
                              ]}
                            >
                              {t("prompts.projectBadge")}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.previewText,
                          {
                            color: th.colors.mutedForeground,
                            fontFamily: th.font.regular,
                          },
                        ]}
                      >
                        {item.body.split(/\r?\n/)[0]}
                      </Text>
                    </View>

                    <IconButton
                      icon="dots-horizontal"
                      accessibilityLabel={t("prompts.edit")}
                      onPress={() => {
                        setEditingPrompt(item);
                        setEditorInitialBody(undefined);
                        setEditorOpen(true);
                      }}
                    />
                  </Pressable>
                )}
              />
            )}

            <View style={styles.footer}>
              <Button
                title={t("prompts.saveDraftAsPrompt")}
                variant="secondary"
                disabled={draft.trim().length === 0}
                onPress={() => {
                  setEditingPrompt(null);
                  setEditorInitialBody(draft);
                  setEditorOpen(true);
                }}
              />
              <Button
                title={t("prompts.newPrompt")}
                onPress={() => {
                  setEditingPrompt(null);
                  setEditorInitialBody(undefined);
                  setEditorOpen(true);
                }}
              />
            </View>
          </View>
        )}
      </Sheet>

      <PromptEditorSheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        prompt={editingPrompt}
        initialBody={editorInitialBody}
        projectId={resolvedProjectId}
      />
    </>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    gap: 12,
  },
  variableContainer: {
    gap: 12,
    paddingVertical: 8,
  },
  list: {
    maxHeight: 340,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemTitle: {
    fontSize: 16,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
  },
  previewText: {
    fontSize: 13,
  },
  emptyContainer: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 15,
  },
  footer: {
    gap: 8,
    marginTop: 8,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  btnWrap: {
    flex: 1,
  },
});
