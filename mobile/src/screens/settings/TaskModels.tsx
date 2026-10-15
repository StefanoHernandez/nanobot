import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useT } from "../../i18n";
import { useSettings } from "../../settings/store";
import { ListItem, Sheet, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { Head } from "./common";

/** Fork server settings (nanobot/ext/subagent_model.py): null = same model as the chat. */
export const TASK_MODEL_PATHS = {
  subagent: "agents.defaults.subagent_model_preset",
  dream: "agents.defaults.dream.model_override",
} as const;
type Task = keyof typeof TASK_MODEL_PATHS;

/** "Models for tasks": which preset runs subagents and Dream. Older servers without the fields hide it. */
export function TaskModels() {
  const t = useT();
  const th = useTheme();
  const { data, mutate } = useSettings();
  const [picking, setPicking] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const config = (data?.runtime_config ?? {}) as Record<string, unknown>;
  if (!data || !(TASK_MODEL_PATHS.subagent in config)) return null;

  const current = (task: Task) => {
    const v = config[TASK_MODEL_PATHS[task]];
    return typeof v === "string" && v && v !== "default" ? v : null;
  };
  const choose = async (task: Task, preset: string | null) => {
    setPicking(null);
    if (preset === current(task)) return;
    setBusy(true);
    try {
      await mutate("settings.runtime_config.update", { values: { [TASK_MODEL_PATHS[task]]: preset } });
    } catch {
      toast.show(t("models.tasks.saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  const rows: { task: Task; title: string; help: string }[] = [
    { task: "subagent", title: t("models.tasks.subagent"), help: t("models.tasks.subagentHelp") },
    { task: "dream", title: t("models.tasks.dream"), help: t("models.tasks.dreamHelp") },
  ];

  return (
    <>
      <Head>{t("models.tasks.title")}</Head>
      <View style={{ backgroundColor: th.colors.card, borderRadius: th.radius.md, marginHorizontal: 16, overflow: "hidden" }}>
        {rows.map((r, i) => (
          <View key={r.task} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border } : undefined}>
            <ListItem
              title={r.title}
              subtitle={`${current(r.task) ?? t("models.tasks.sameAsChat")} · ${r.help}`}
              onPress={busy ? undefined : () => setPicking(r.task)}
            />
          </View>
        ))}
      </View>
      {picking ? (
        <Sheet open onClose={() => setPicking(null)} title={rows.find((r) => r.task === picking)!.title}>
          <ScrollView style={{ maxHeight: 420 }}>
            {[null, ...data.model_presets.map((p) => p.name)].map((name) => (
              <ListItem
                key={name ?? "__same__"}
                title={name ?? t("models.tasks.sameAsChat")}
                subtitle={name ? data.model_presets.find((p) => p.name === name)?.model : undefined}
                onPress={() => void choose(picking, name)}
                right={
                  current(picking) === name ? (
                    <Text accessibilityLabel={t("models.tasks.selected")} style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 16 }}>✓</Text>
                  ) : undefined
                }
              />
            ))}
          </ScrollView>
        </Sheet>
      ) : null}
    </>
  );
}
