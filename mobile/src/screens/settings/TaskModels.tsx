import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchJournal, saveJournalSettings, type JournalIndex } from "../../ecosystem/journal";
import { useT } from "../../i18n";
import { activePresetNames, pickableNames } from "../../settings/models";
import { useSettings } from "../../settings/store";
import { useSession } from "../../state/sessionStore";
import { ListItem, Sheet, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { Head } from "./common";

/** Fork server settings (nanobot/ext/subagent_model.py): null = same model as the chat. */
export const TASK_MODEL_PATHS = {
  subagent: "agents.defaults.subagent_model_preset",
  dream: "agents.defaults.dream.model_override",
} as const;
type Task = keyof typeof TASK_MODEL_PATHS | "journal";

/** "Models for tasks": which preset runs subagents, Dream, and the journal. Older servers without the fields hide it. */
export function TaskModels() {
  const t = useT();
  const th = useTheme();
  const { data, mutate } = useSettings();
  const { session } = useSession();
  const [picking, setPicking] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [journal, setJournal] = useState<JournalIndex | null>(null);
  const config = (data?.runtime_config ?? {}) as Record<string, unknown>;
  const showSection = !!data && TASK_MODEL_PATHS.subagent in config;

  useEffect(() => {
    if (!showSection || !session) {
      setJournal(null);
      return;
    }
    let alive = true;
    fetchJournal(session)
      .then((next) => {
        if (alive) setJournal(next);
      })
      .catch(() => {
        if (alive) setJournal(null);
      });
    return () => {
      alive = false;
    };
  }, [showSection, session]);

  if (!showSection || !data) return null;

  const current = (task: Task) => {
    if (task === "journal") return journal?.model ?? null;
    const v = config[TASK_MODEL_PATHS[task]];
    return typeof v === "string" && v && v !== "default" ? v : null;
  };
  const choose = async (task: Task, preset: string | null) => {
    setPicking(null);
    if (preset === current(task)) return;
    setBusy(true);
    try {
      if (task === "journal") {
        if (!session || !journal) return;
        const saved = await saveJournalSettings(session, {
          enabled: journal.enabled,
          hour: journal.hour,
          model: preset,
        });
        setJournal({ ...saved, days: journal.days });
      } else {
        await mutate("settings.runtime_config.update", { values: { [TASK_MODEL_PATHS[task]]: preset } });
      }
    } catch {
      toast.show(t("models.tasks.saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  const rows: { task: Task; title: string; help: string }[] = [
    { task: "subagent", title: t("models.tasks.subagent"), help: t("models.tasks.subagentHelp") },
    { task: "dream", title: t("models.tasks.dream"), help: t("models.tasks.dreamHelp") },
    ...(journal
      ? [{ task: "journal" as const, title: t("models.tasks.journal"), help: t("models.tasks.journalHelp") }]
      : []),
  ];

  const active = activePresetNames(data);
  const byName = new Map(data.model_presets.map((p) => [p.name, p]));
  const taskOptions: (string | null)[] = [null, ...pickableNames(data, picking ? current(picking) : null)];

  return (
    <>
      <Head>{t("models.tasks.title")}</Head>
      <View style={{ ...th.surface, marginHorizontal: 16, overflow: "hidden" }}>
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
            {taskOptions.map((name) => {
              const isCurrent = current(picking) === name;
              const isActive = name == null || active.has(name);
              const title = name == null
                ? t("models.tasks.sameAsChat")
                : isActive
                ? name
                : `${name} (${t("models.disabledTag")})`;
              return (
                <ListItem
                  key={name ?? "__same__"}
                  title={title}
                  subtitle={name ? byName.get(name)?.model : undefined}
                  onPress={() => void choose(picking, name)}
                  right={
                    isCurrent ? (
                      <Text accessibilityLabel={t("models.tasks.selected")} style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 16 }}>✓</Text>
                    ) : undefined
                  }
                />
              );
            })}
          </ScrollView>
        </Sheet>
      ) : null}
    </>
  );
}
