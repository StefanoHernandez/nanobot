import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PromptItem, usePrompts } from "../../extras/prompts";
import { PromptEditorSheet } from "../../extras/PromptEditorSheet";
import { useT } from "../../i18n";
import { Button, IconButton, ListItem } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { Head } from "./common";

export function PromptsSection() {
  const t = useT();
  const th = useTheme();
  const { prompts, loading } = usePrompts(null);
  const [editingPrompt, setEditingPrompt] = useState<PromptItem | "new" | null>(null);

  // Global prompts only (project_id is null)
  const globalPrompts = prompts.filter((p) => !p.project_id);

  return (
    <>
      <Head>{t("prompts.sectionTitle")}</Head>

      <View
        style={[
          styles.card,
          {
            backgroundColor: th.colors.card,
            borderRadius: th.radius.md,
          },
        ]}
      >
        {globalPrompts.length === 0 && !loading ? (
          <View style={styles.emptyContainer}>
            <Text
              style={[
                styles.emptyText,
                { color: th.colors.mutedForeground, fontFamily: th.font.regular },
              ]}
            >
              {t("prompts.empty")}
            </Text>
          </View>
        ) : (
          globalPrompts.map((p, idx) => (
            <View
              key={p.id}
              style={
                idx > 0
                  ? {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: th.colors.border,
                    }
                  : undefined
              }
            >
              <ListItem
                title={p.title}
                subtitle={p.body.split(/\r?\n/)[0]}
                onPress={() => setEditingPrompt(p)}
                right={
                  <IconButton
                    icon="dots-horizontal"
                    accessibilityLabel={t("prompts.edit")}
                    onPress={() => setEditingPrompt(p)}
                  />
                }
              />
            </View>
          ))
        )}
      </View>

      <View style={styles.createBtn}>
        <Button
          title={t("prompts.newPrompt")}
          onPress={() => setEditingPrompt("new")}
        />
      </View>

      <PromptEditorSheet
        open={editingPrompt !== null}
        onClose={() => setEditingPrompt(null)}
        prompt={editingPrompt === "new" ? null : editingPrompt}
        projectId={null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    overflow: "hidden",
  },
  emptyContainer: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 15,
  },
  createBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
  },
});
