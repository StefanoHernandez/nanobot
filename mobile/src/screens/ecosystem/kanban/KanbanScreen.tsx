import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import type { NanobotSession } from "../../../core/session";
import {
  DEFAULT_BOARD_ID,
  KANBAN_COLUMNS,
  fetchKanban,
  moveKanbanTask,
  saveKanbanTask,
  type KanbanSnapshot,
  type KanbanTask,
  validateTaskTitle,
} from "../../../ecosystem/kanban";
import { useT } from "../../../i18n";
import { SettingsShell } from "../../settings/SettingsShell";
import { Chips } from "../../settings/common";
import { Dialog, IconButton, TextField, goBackOr } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";

type Phase = "loading" | "ok" | "404" | "error";

export function KanbanScreen({ session }: { session: NanobotSession }) {
  const t = useT();
  const th = useTheme();
  const [phase, setPhase] = useState<Phase>("loading");
  const [snapshot, setSnapshot] = useState<KanbanSnapshot | null>(null);
  const [boardId, setBoardId] = useState(DEFAULT_BOARD_ID);
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchKanban(session, boardId);
      setSnapshot(data);
      setBoardId(data.active_board.id);
      setPhase("ok");
    } catch (e) {
      const status = (e as Error & { status?: number }).status;
      if (status === 404) {
        setSnapshot(null);
        setPhase("404");
      } else {
        setSnapshot(null);
        setPhase("error");
      }
    }
  }, [session, boardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const botNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of snapshot?.bots ?? []) {
      map.set(b.id, b.name);
    }
    return map;
  }, [snapshot?.bots]);

  const visibleTasks = useMemo(
    () => (snapshot?.tasks ?? []).filter((task) => task.status !== "archived"),
    [snapshot?.tasks],
  );

  const statusOptions = useMemo(
    () => KANBAN_COLUMNS.map((value) => ({ value, label: t(`kanban.status.${value}`) })),
    [t],
  );

  const onPickStatus = async (status: KanbanTask["status"]) => {
    if (!selectedTask || moveBusy || status === selectedTask.status) {
      setSelectedTask(null);
      return;
    }
    setMoveBusy(true);
    try {
      await moveKanbanTask(session, selectedTask.id, status);
      setSelectedTask(null);
      await load();
    } catch {
      setPhase("error");
      setSelectedTask(null);
    } finally {
      setMoveBusy(false);
    }
  };

  const onSaveNew = async () => {
    if (saveBusy || !snapshot || !validateTaskTitle(newTitle)) return;
    setSaveBusy(true);
    try {
      await saveKanbanTask(session, {
        board_id: snapshot.active_board.id,
        title: newTitle.trim(),
      });
      setAddOpen(false);
      setNewTitle("");
      await load();
    } catch {
      setPhase("error");
    } finally {
      setSaveBusy(false);
    }
  };

  const bodyMessage =
    phase === "404" ? t("kanban.unavailable") : phase === "error" ? t("common.error") : null;

  return (
    <SettingsShell title={t("kanban.title")} onBack={() => goBackOr(router, "/ecosystem")}>
      {phase === "loading" && !snapshot ? (
        <View style={styles.centered}>
          <ActivityIndicator color={th.colors.primary} />
        </View>
      ) : null}

      {bodyMessage ? (
        <Text
          style={{
            color: phase === "error" ? th.colors.destructive : th.colors.mutedForeground,
            fontFamily: th.font.regular,
            fontSize: 15,
            paddingHorizontal: 16,
            paddingTop: 8,
          }}
        >
          {bodyMessage}
        </Text>
      ) : null}

      {snapshot && phase !== "404" ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.boardRow}
            style={styles.boardScroll}
          >
            {KANBAN_COLUMNS.map((column) => {
              const columnTasks = visibleTasks.filter((task) => task.status === column);
              return (
                <View
                  key={column}
                  style={[
                    styles.column,
                    {
                      backgroundColor: th.colors.card,
                      borderColor: th.colors.border,
                      borderRadius: th.radius.md,
                    },
                  ]}
                >
                  <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 15 }}>
                    {t(`kanban.status.${column}`)} ({columnTasks.length})
                  </Text>
                  {columnTasks.length === 0 ? (
                    <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, marginTop: 8 }}>
                      {t("kanban.empty")}
                    </Text>
                  ) : (
                    columnTasks.map((task) => {
                      const assignee =
                        task.assignee_bot_id != null ? botNames.get(task.assignee_bot_id) : undefined;
                      return (
                        <Pressable
                          key={task.id}
                          accessibilityRole="button"
                          onPress={() => setSelectedTask(task)}
                          style={[
                            styles.card,
                            {
                              backgroundColor: th.colors.background,
                              borderColor: th.colors.border,
                              borderRadius: th.radius.sm,
                            },
                          ]}
                        >
                          <Text numberOfLines={2} style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 15 }}>
                            {task.title}
                          </Text>
                          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, marginTop: 4 }}>
                            {t(`kanban.priority.${task.priority}`)}
                          </Text>
                          {assignee ? (
                            <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, marginTop: 2 }}>
                              {assignee}
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })
                  )}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.fabRow}>
            <IconButton
              icon="plus"
              accessibilityLabel={t("kanban.add")}
              fill={th.colors.primary}
              color={th.colors.primaryForeground}
              onPress={() => setAddOpen(true)}
            />
          </View>
        </>
      ) : null}

      <Dialog
        open={!!selectedTask}
        title={selectedTask?.title ?? ""}
        confirmLabel={t("common.close")}
        cancelLabel={t("common.cancel")}
        onCancel={() => {
          if (!moveBusy) setSelectedTask(null);
        }}
        onConfirm={() => {
          if (!moveBusy) setSelectedTask(null);
        }}
      >
        <Chips
          options={statusOptions}
          value={selectedTask?.status ?? "todo"}
          onChange={(status) => {
            if (KANBAN_COLUMNS.includes(status as (typeof KANBAN_COLUMNS)[number])) {
              void onPickStatus(status);
            }
          }}
        />
      </Dialog>

      <Dialog
        open={addOpen}
        title={t("kanban.add")}
        confirmLabel={t("common.save")}
        cancelLabel={t("common.cancel")}
        onCancel={() => {
          if (!saveBusy) {
            setAddOpen(false);
            setNewTitle("");
          }
        }}
        onConfirm={() => void onSaveNew()}
      >
        <TextField label={t("kanban.add")} value={newTitle} onChangeText={setNewTitle} />
      </Dialog>
    </SettingsShell>
  );
}

const styles = StyleSheet.create({
  centered: { padding: 24, alignItems: "center" },
  boardScroll: { marginTop: 8 },
  boardRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 12 },
  column: { width: 260, padding: 12, borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  card: { minHeight: 48, padding: 12, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center" },
  fabRow: { alignItems: "flex-end", paddingHorizontal: 8, paddingTop: 8 },
});
