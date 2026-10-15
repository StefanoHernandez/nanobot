import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";
import type { NanobotSession } from "../../../core/session";
import {
  DEFAULT_BOARD_ID,
  KANBAN_COLUMNS,
  deleteKanbanBot,
  fetchKanban,
  moveKanbanTask,
  postKanbanMessage,
  reviewKanbanTask,
  saveKanbanBot,
  saveKanbanTask,
  validateBoardMessageContent,
  validateBotIcon,
  validateBotName,
  validateReviewFeedback,
  validateRolePrompt,
  validateTaskTitle,
  type KanbanBot,
  type KanbanSnapshot,
  type KanbanTask,
} from "../../../ecosystem/kanban";
import { useT } from "../../../i18n";
import { sessionStore } from "../../../state/sessionStore";
import { SettingsShell } from "../../settings/SettingsShell";
import { Chips } from "../../settings/common";
import { Button, Dialog, IconButton, TextField, goBackOr, toast } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";

type Phase = "loading" | "ok" | "404" | "error";
type KanbanTab = "board" | "chat" | "bots";

const emptyBotForm = { name: "", icon: "", role_prompt: "" };

export function KanbanScreen({ session }: { session: NanobotSession }) {
  const t = useT();
  const th = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>("loading");
  const [snapshot, setSnapshot] = useState<KanbanSnapshot | null>(null);
  const [boardId, setBoardId] = useState(DEFAULT_BOARD_ID);
  const [tab, setTab] = useState<KanbanTab>("board");
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [botDialogOpen, setBotDialogOpen] = useState(false);
  const [botEditingId, setBotEditingId] = useState<string | null>(null);
  const [botForm, setBotForm] = useState(emptyBotForm);
  const [botSaveBusy, setBotSaveBusy] = useState(false);
  const [deleteBotTarget, setDeleteBotTarget] = useState<KanbanBot | null>(null);
  const [deleteBotBusy, setDeleteBotBusy] = useState(false);
  const genRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      genRef.current++;
    };
  }, []);

  const load = useCallback(async () => {
    const currentGen = ++genRef.current;
    const profileId = sessionStore?.getState ? sessionStore.getState()?.profile?.id : null;
    try {
      const data = await fetchKanban(session, boardId);
      if (!mountedRef.current || currentGen !== genRef.current) return;
      if (sessionStore?.getState && sessionStore.getState()?.profile?.id !== profileId) return;
      setSnapshot(data);
      setBoardId(data.active_board.id);
      setPhase("ok");
    } catch (e) {
      if (!mountedRef.current || currentGen !== genRef.current) return;
      if (sessionStore?.getState && sessionStore.getState()?.profile?.id !== profileId) return;
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

  const closeTaskDialog = () => {
    if (!moveBusy && !reviewBusy) {
      setSelectedTask(null);
      setReviewFeedback("");
    }
  };

  const onPickStatus = async (status: KanbanTask["status"]) => {
    if (!selectedTask || moveBusy || status === selectedTask.status) {
      closeTaskDialog();
      return;
    }
    setMoveBusy(true);
    try {
      await moveKanbanTask(session, selectedTask.id, status);
      setSelectedTask(null);
      setReviewFeedback("");
      await load();
    } catch {
      setPhase("error");
      setSelectedTask(null);
      setReviewFeedback("");
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

  const onSendChat = async () => {
    if (chatBusy || !snapshot || !validateBoardMessageContent(chatDraft)) return;
    setChatBusy(true);
    try {
      await postKanbanMessage(session, snapshot.active_board.id, chatDraft);
      setChatDraft("");
      await load();
    } catch {
      setPhase("error");
    } finally {
      setChatBusy(false);
    }
  };

  const insertBotMention = (bot: KanbanBot) => {
    setChatDraft((prev) => `${prev}@${bot.id} `);
  };

  const openNewBot = () => {
    setBotEditingId(null);
    setBotForm(emptyBotForm);
    setBotDialogOpen(true);
  };

  const openEditBot = (bot: KanbanBot) => {
    setBotEditingId(bot.id);
    setBotForm({ name: bot.name, icon: bot.icon, role_prompt: bot.role_prompt });
    setBotDialogOpen(true);
  };

  const closeBotDialog = () => {
    if (!botSaveBusy) {
      setBotDialogOpen(false);
      setBotEditingId(null);
      setBotForm(emptyBotForm);
    }
  };

  const onSaveBot = async () => {
    if (botSaveBusy || !validateBotName(botForm.name) || !validateBotIcon(botForm.icon) || !validateRolePrompt(botForm.role_prompt)) return;
    setBotSaveBusy(true);
    try {
      await saveKanbanBot(session, {
        ...(botEditingId ? { id: botEditingId } : {}),
        name: botForm.name.trim(),
        icon: botForm.icon,
        role_prompt: botForm.role_prompt,
      });
      setBotDialogOpen(false);
      setBotEditingId(null);
      setBotForm(emptyBotForm);
      await load();
    } catch {
      setPhase("error");
    } finally {
      setBotSaveBusy(false);
    }
  };

  const onConfirmDeleteBot = async () => {
    if (!deleteBotTarget || deleteBotBusy) return;
    setDeleteBotBusy(true);
    try {
      await deleteKanbanBot(session, deleteBotTarget.id);
      setDeleteBotTarget(null);
      if (botEditingId === deleteBotTarget.id) {
        closeBotDialog();
      }
      await load();
    } catch {
      toast.show(t("common.error"));
      setDeleteBotTarget(null);
    } finally {
      setDeleteBotBusy(false);
    }
  };

  const onApproveReview = async () => {
    if (!selectedTask || reviewBusy || selectedTask.status !== "review") return;
    setReviewBusy(true);
    try {
      await reviewKanbanTask(session, selectedTask.id, true);
      setSelectedTask(null);
      setReviewFeedback("");
      await load();
    } catch {
      setPhase("error");
      setSelectedTask(null);
      setReviewFeedback("");
    } finally {
      setReviewBusy(false);
    }
  };

  const onRequestChanges = async () => {
    if (!selectedTask || reviewBusy || selectedTask.status !== "review") return;
    const feedback = reviewFeedback.trim();
    if (!feedback || !validateReviewFeedback(feedback)) return;
    setReviewBusy(true);
    try {
      await reviewKanbanTask(session, selectedTask.id, false, feedback);
      setSelectedTask(null);
      setReviewFeedback("");
      await load();
    } catch {
      setPhase("error");
      setSelectedTask(null);
      setReviewFeedback("");
    } finally {
      setReviewBusy(false);
    }
  };

  const bodyMessage =
    phase === "404" ? t("kanban.unavailable") : phase === "error" ? t("common.error") : null;

  const chatPaneMinHeight = Math.max(320, windowHeight - 220);

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
          <View style={[styles.tabBar, { backgroundColor: th.colors.muted, borderRadius: 999 }]}>
            {(["board", "chat", "bots"] as const).map((key) => (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === key }}
                onPress={() => setTab(key)}
                style={[
                  styles.tabSegment,
                  { backgroundColor: tab === key ? th.colors.card : "transparent" },
                ]}
              >
                <Text
                  style={{
                    color: tab === key ? th.colors.foreground : th.colors.mutedForeground,
                    fontFamily: tab === key ? th.font.medium : th.font.regular,
                    fontSize: 15,
                  }}
                >
                  {t(`kanban.tab.${key}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === "board" ? (
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
                        <Text
                          style={{
                            color: th.colors.mutedForeground,
                            fontFamily: th.font.regular,
                            fontSize: 13,
                            marginTop: 8,
                          }}
                        >
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
                              <Text
                                numberOfLines={2}
                                style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 15 }}
                              >
                                {task.title}
                              </Text>
                              <Text
                                style={{
                                  color: th.colors.mutedForeground,
                                  fontFamily: th.font.regular,
                                  fontSize: 13,
                                  marginTop: 4,
                                }}
                              >
                                {t(`kanban.priority.${task.priority}`)}
                              </Text>
                              {assignee ? (
                                <Text
                                  style={{
                                    color: th.colors.mutedForeground,
                                    fontFamily: th.font.regular,
                                    fontSize: 13,
                                    marginTop: 2,
                                  }}
                                >
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

          {tab === "chat" ? (
            <KeyboardAvoidingView behavior="padding" style={{ minHeight: chatPaneMinHeight }}>
              <ScrollView contentContainerStyle={styles.chatList} keyboardShouldPersistTaps="handled">
                {snapshot.messages.length === 0 ? (
                  <Text
                    style={{
                      color: th.colors.mutedForeground,
                      fontFamily: th.font.regular,
                      fontSize: 15,
                      paddingHorizontal: 16,
                      paddingTop: 8,
                    }}
                  >
                    {t("kanban.empty")}
                  </Text>
                ) : (
                  snapshot.messages.map((msg) => (
                    <View
                      key={msg.id}
                      style={[
                        styles.messageRow,
                        {
                          backgroundColor: th.colors.card,
                          borderColor: th.colors.border,
                          borderRadius: th.radius.md,
                        },
                      ]}
                    >
                      <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 15 }}>
                        {msg.author_name}
                      </Text>
                      <Text
                        style={{
                          color: th.colors.foreground,
                          fontFamily: th.font.regular,
                          fontSize: 15,
                          marginTop: 4,
                        }}
                      >
                        {msg.content}
                      </Text>
                    </View>
                  ))
                )}
              </ScrollView>
              {snapshot.bots.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.mentionRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {snapshot.bots.map((bot) => (
                    <Button
                      key={bot.id}
                      title={`@${bot.name}`}
                      variant="secondary"
                      onPress={() => insertBotMention(bot)}
                    />
                  ))}
                </ScrollView>
              ) : null}
              <View style={styles.chatInputRow}>
                <View style={styles.chatFieldWrap}>
                  <TextField label={t("kanban.tab.chat")} value={chatDraft} onChangeText={setChatDraft} />
                </View>
                <Button
                  title={t("kanban.send")}
                  onPress={() => void onSendChat()}
                  loading={chatBusy}
                  disabled={!validateBoardMessageContent(chatDraft)}
                />
              </View>
            </KeyboardAvoidingView>
          ) : null}

          {tab === "bots" ? (
            <>
              <View style={styles.botList}>
                {snapshot.bots.length === 0 ? (
                  <Text
                    style={{
                      color: th.colors.mutedForeground,
                      fontFamily: th.font.regular,
                      fontSize: 15,
                      paddingHorizontal: 16,
                      paddingTop: 8,
                    }}
                  >
                    {t("kanban.empty")}
                  </Text>
                ) : (
                  snapshot.bots.map((bot) => (
                    <Pressable
                      key={bot.id}
                      accessibilityRole="button"
                      onPress={() => openEditBot(bot)}
                      style={[
                        styles.botRow,
                        {
                          borderColor: th.colors.border,
                          borderRadius: th.radius.md,
                          backgroundColor: th.colors.card,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 22, lineHeight: 28 }}>{bot.icon || "🤖"}</Text>
                      <View style={styles.botTextCol}>
                        <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 16 }}>
                          {bot.name}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={{
                            color: th.colors.mutedForeground,
                            fontFamily: th.font.regular,
                            fontSize: 14,
                            marginTop: 2,
                          }}
                        >
                          {bot.role_prompt}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                )}
              </View>
              <View style={styles.fabRow}>
                <IconButton
                  icon="plus"
                  accessibilityLabel={t("kanban.addBot")}
                  fill={th.colors.primary}
                  color={th.colors.primaryForeground}
                  onPress={openNewBot}
                />
              </View>
            </>
          ) : null}
        </>
      ) : null}

      <Dialog
        open={!!selectedTask}
        title={selectedTask?.title ?? ""}
        confirmLabel={t("common.close")}
        cancelLabel={t("common.cancel")}
        onCancel={closeTaskDialog}
        onConfirm={closeTaskDialog}
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
        {selectedTask?.status === "review" ? (
          <View style={{ gap: 8, marginTop: 4 }}>
            <Button title={t("kanban.approve")} onPress={() => void onApproveReview()} loading={reviewBusy} />
            <TextField label={t("kanban.feedback")} value={reviewFeedback} onChangeText={setReviewFeedback} />
            <Button
              title={t("kanban.requestChanges")}
              variant="secondary"
              onPress={() => void onRequestChanges()}
              loading={reviewBusy}
              disabled={!reviewFeedback.trim()}
            />
          </View>
        ) : null}
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

      <Dialog
        open={botDialogOpen}
        title={botEditingId ? t("kanban.tab.bots") : t("kanban.addBot")}
        confirmLabel={t("common.save")}
        cancelLabel={t("common.cancel")}
        onCancel={closeBotDialog}
        onConfirm={() => void onSaveBot()}
      >
        <TextField label={t("kanban.botName")} value={botForm.name} onChangeText={(name) => setBotForm((f) => ({ ...f, name }))} />
        <TextField
          label={t("kanban.botIcon")}
          value={botForm.icon}
          onChangeText={(icon) => setBotForm((f) => ({ ...f, icon: [...icon].slice(0, 8).join("") }))}
        />
        <TextField
          label={t("kanban.botPrompt")}
          value={botForm.role_prompt}
          onChangeText={(role_prompt) => setBotForm((f) => ({ ...f, role_prompt }))}
          multiline
        />
        {botEditingId ? (
          <View style={{ marginTop: 8 }}>
            <Button
              title={t("kanban.deleteBot")}
              variant="destructive"
              onPress={() => {
                const bot = snapshot?.bots.find((b) => b.id === botEditingId);
                if (bot) {
                  setBotDialogOpen(false);
                  setDeleteBotTarget(bot);
                }
              }}
            />
          </View>
        ) : null}
      </Dialog>

      <Dialog
        open={!!deleteBotTarget}
        title={t("kanban.deleteBot")}
        message={deleteBotTarget ? t("kanban.deleteBotConfirm", { name: deleteBotTarget.name }) : undefined}
        confirmLabel={t("kanban.deleteBot")}
        cancelLabel={t("common.cancel")}
        destructive
        onCancel={() => {
          if (!deleteBotBusy) setDeleteBotTarget(null);
        }}
        onConfirm={() => void onConfirmDeleteBot()}
      />
    </SettingsShell>
  );
}

const styles = StyleSheet.create({
  centered: { padding: 24, alignItems: "center" },
  tabBar: { marginHorizontal: 16, marginTop: 8, marginBottom: 8, padding: 4, flexDirection: "row", gap: 4 },
  tabSegment: { flex: 1, minHeight: 48, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  boardScroll: { marginTop: 0 },
  boardRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 12 },
  column: { width: 260, padding: 12, borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  card: { minHeight: 48, padding: 12, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center" },
  fabRow: { alignItems: "flex-end", paddingHorizontal: 8, paddingTop: 8 },
  chatList: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  messageRow: { padding: 12, borderWidth: StyleSheet.hairlineWidth },
  mentionRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 8, flexDirection: "row" },
  chatInputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  chatFieldWrap: { flex: 1 },
  botList: { paddingHorizontal: 16, gap: 8, paddingTop: 4 },
  botRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  botTextCol: { flex: 1, minWidth: 0 },
});
