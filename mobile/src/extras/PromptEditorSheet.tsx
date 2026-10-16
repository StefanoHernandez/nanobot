import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useT } from "../i18n";
import { useSession } from "../state/sessionStore";
import { Button } from "../ui/components/Button";
import { Dialog } from "../ui/components/Dialog";
import { Sheet } from "../ui/components/Sheet";
import { TextField } from "../ui/components/TextField";
import { toast } from "../ui/components/Toast";
import { useTheme } from "../ui/ThemeProvider";
import {
  deletePrompt,
  extractVariables,
  PromptItem,
  promptsStore,
  savePrompt,
} from "./prompts";

export type PromptEditorSheetProps = {
  open: boolean;
  onClose: () => void;
  prompt?: PromptItem | null;
  initialBody?: string;
  projectId?: string | null;
  initialScopeToProject?: boolean;
  onSaved?: (prompt: PromptItem) => void;
  onDeleted?: (id: string) => void;
};

export function PromptEditorSheet({
  open,
  onClose,
  prompt,
  initialBody,
  projectId,
  initialScopeToProject,
  onSaved,
  onDeleted,
}: PromptEditorSheetProps) {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scopeToProject, setScopeToProject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const titleRef = React.useRef("");
  const bodyRef = React.useRef("");
  const scopeRef = React.useRef(false);

  const effectiveProjectId = projectId ?? prompt?.project_id ?? null;

  useEffect(() => {
    if (open) {
      const initTitle = prompt?.title ?? "";
      const initBody = prompt?.body ?? initialBody ?? "";
      const initScope = prompt
        ? prompt.project_id != null
        : Boolean(initialScopeToProject && effectiveProjectId);
      titleRef.current = initTitle;
      bodyRef.current = initBody;
      scopeRef.current = initScope;
      setTitle(initTitle);
      setBody(initBody);
      setScopeToProject(initScope);
      setSaving(false);
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [open, prompt, initialBody, initialScopeToProject, effectiveProjectId]);

  const variables = extractVariables(body);

  const handleSave = async () => {
    const curTitle = titleRef.current.trim();
    const curBody = bodyRef.current;
    if (!curTitle || !curBody.trim() || saving) return;
    if (!session) return;

    setSaving(true);
    try {
      const saved = await savePrompt(session, {
        id: prompt?.id,
        title: curTitle,
        body: curBody,
        project_id: scopeRef.current ? effectiveProjectId : null,
      });
      const currentTarget = promptsStore.getState().currentProjectId;
      void promptsStore.getState().refresh(
        currentTarget !== undefined ? currentTarget : projectId,
      );
      onSaved?.(saved);
      onClose();
    } catch (e: any) {
      if (e?.code === "too_many_prompts" || e?.status === 409) {
        toast.show(t("prompts.tooMany"));
      } else {
        toast.show(t("common.operationFailed"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!prompt?.id || deleting) return;
    if (!session) return;

    setDeleting(true);
    try {
      await deletePrompt(session, prompt.id);
      const currentTarget = promptsStore.getState().currentProjectId;
      void promptsStore.getState().refresh(
        currentTarget !== undefined ? currentTarget : projectId,
      );
      setShowDeleteConfirm(false);
      onDeleted?.(prompt.id);
      onClose();
    } catch {
      toast.show(t("common.operationFailed"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={t(prompt ? "prompts.edit" : "prompts.newPrompt")}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <TextField
            label={t("prompts.promptTitle")}
            value={title}
            onChangeText={(v) => {
              titleRef.current = v;
              setTitle(v);
            }}
            placeholder={t("prompts.promptTitle")}
          />

          <TextField
            label={t("prompts.body")}
            value={body}
            onChangeText={(v) => {
              bodyRef.current = v;
              setBody(v);
            }}
            placeholder={t("prompts.body")}
            multiline
            numberOfLines={5}
            mono
            inputStyle={[styles.bodyInput, { fontFamily: th.font.mono }]}
            rowStyle={styles.bodyRow}
          />

          {variables.length > 0 && (
            <View style={styles.variablesSection}>
              <Text
                style={[
                  styles.variablesLabel,
                  { color: th.colors.mutedForeground, fontFamily: th.font.medium },
                ]}
              >
                {t("prompts.variables")}
              </Text>
              <View style={styles.chipsRow}>
                {variables.map((v) => (
                  <View
                    key={v}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: th.colors.muted,
                        borderRadius: th.radius.sm,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: th.colors.foreground, fontFamily: th.font.mono },
                      ]}
                    >
                      {v}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {Boolean(effectiveProjectId) && (
            <View style={styles.switchRow}>
              <Text
                style={[
                  styles.switchLabel,
                  { color: th.colors.foreground, fontFamily: th.font.regular },
                ]}
              >
                {t("prompts.projectScope")}
              </Text>
              <Switch
                accessibilityLabel={t("prompts.projectScope")}
                value={scopeToProject}
                onValueChange={(v) => {
                  scopeRef.current = v;
                  setScopeToProject(v);
                }}
                trackColor={{ false: th.colors.border, true: th.colors.primary }}
              />
            </View>
          )}

          <View style={styles.actions}>
            {Boolean(prompt?.id) && (
              <View style={styles.btnWrap}>
                <Button
                  title={t("common.delete")}
                  variant="destructive"
                  onPress={() => setShowDeleteConfirm(true)}
                  disabled={saving || deleting}
                />
              </View>
            )}
            <View style={styles.btnWrap}>
              <Button
                title={t("common.save")}
                onPress={handleSave}
                loading={saving}
                disabled={
                  (!title.trim() && !titleRef.current.trim()) ||
                  (!body.trim() && !bodyRef.current.trim()) ||
                  saving
                }
              />
            </View>
          </View>
        </ScrollView>
      </Sheet>

      <Dialog
        open={showDeleteConfirm}
        title={t("prompts.deleteConfirmTitle")}
        message={t("prompts.deleteConfirmMessage", { title: prompt?.title ?? "" })}
        confirmLabel={t("prompts.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingVertical: 8,
    gap: 12,
  },
  bodyRow: {
    minHeight: 120,
    alignItems: "flex-start",
    paddingVertical: 8,
  },
  bodyInput: {
    minHeight: 104,
    textAlignVertical: "top",
  },
  variablesSection: {
    gap: 6,
  },
  variablesLabel: {
    fontSize: 13,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 12,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: 15,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  btnWrap: {
    flex: 1,
  },
});
