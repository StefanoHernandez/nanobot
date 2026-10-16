import React, { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { NanobotSession } from "../../../core/session";
import {
  KANBAN_COLUMNS,
  deleteKanbanTask,
  exprToRecurrence,
  fetchKanbanTask,
  kanbanErrorKey,
  moveKanbanTask,
  postKanbanMessage,
  recurrenceToExpr,
  reviewKanbanTask,
  saveKanbanTask,
  validateBoardMessageContent,
  validateReviewFeedback,
  validateTaskTitle,
  type KanbanBot,
  type KanbanPriority,
  type KanbanStatus,
  type KanbanTask,
  type KanbanTaskDetail,
  type KanbanWorkspace,
  type RecurrenceUnit,
} from "../../../ecosystem/kanban";
import { useT } from "../../../i18n";
import { Chips } from "../../settings/common";
import { Button, Dialog, Sheet, TextField, toast } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";

type WhenMode = "asap" | "at";
type RepeatMode = "never" | "every";

export function toastKanbanError(t: (key: string) => string, error: unknown): void {
  const key = kanbanErrorKey(error);
  toast.show(key ? t(key) : t("common.error"));
}

function shortWhen(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function WebDateField({ value, onChange }: { value: Date; onChange: (next: Date) => void }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  const Input = "input" as unknown as React.ComponentType<{
    type: string;
    value: string;
    onChange: (event: { currentTarget: { value: string } }) => void;
    style: { minHeight: number; fontSize: number; width: string };
  }>;
  return (
    <Input
      type="datetime-local"
      value={local}
      onChange={(event) => {
        const next = new Date(event.currentTarget.value);
        if (!Number.isNaN(next.getTime())) onChange(next);
      }}
      style={{ minHeight: 48, fontSize: 16, width: "100%" }}
    />
  );
}

export function TaskEditorSheet({
  open,
  task,
  boardId,
  bots,
  tasks,
  links,
  session,
  onClose,
  onChanged,
}: {
  open: boolean;
  task: KanbanTask | null;
  boardId: string;
  bots: KanbanBot[];
  tasks: KanbanTask[];
  links: { parent_id: string; child_id: string }[];
  session: NanobotSession;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const t = useT();
  const th = useTheme();
  const seeded = useRef("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<KanbanPriority>("medium");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<KanbanWorkspace>("scratch");
  const [whenMode, setWhenMode] = useState<WhenMode>("asap");
  const [atDate, setAtDate] = useState(() => new Date());
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("never");
  const [repeatAmount, setRepeatAmount] = useState("1");
  const [repeatUnit, setRepeatUnit] = useState<RecurrenceUnit>("hours");
  const [parentIds, setParentIds] = useState<string[]>([]);
  const [retries, setRetries] = useState("2");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [detail, setDetail] = useState<KanbanTaskDetail | null>(null);
  const [messageDraft, setMessageDraft] = useState("");

  useEffect(() => {
    if (!open) {
      seeded.current = "";
      return;
    }
    const key = task?.id ?? "new";
    if (seeded.current === key) return;
    seeded.current = key;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setPriority(task?.priority ?? "medium");
    setAssignee(task?.assignee_bot_id ?? null);
    setReviewer(task?.reviewer_bot_id ?? null);
    setWorkspace(task?.workspace_mode ?? "scratch");
    setRetries(String(task?.max_retries ?? 2));
    const parsed = exprToRecurrence(task?.recurrence_expr ?? "");
    setRepeatMode(parsed ? "every" : "never");
    setRepeatAmount(parsed ? String(parsed.n) : "1");
    setRepeatUnit(parsed?.unit ?? "hours");
    if (typeof task?.scheduled_at_ms === "number") {
      setWhenMode("at");
      setAtDate(new Date(task.scheduled_at_ms));
    } else {
      setWhenMode("asap");
      setAtDate(new Date());
    }
    setParentIds(links.filter((link) => link.child_id === task?.id).map((link) => link.parent_id));
    setReviewFeedback("");
    setMessageDraft("");
    setPicker(null);
    setConfirmDelete(false);
  }, [open, task, links]);

  useEffect(() => {
    if (!open || !task) {
      setDetail(null);
      return;
    }
    let gone = false;
    void fetchKanbanTask(session, task.id)
      .then((next) => {
        if (!gone) setDetail(next);
      })
      .catch(() => {
        if (!gone) setDetail(null);
      });
    return () => {
      gone = true;
    };
  }, [open, task, session]);

  const close = () => {
    if (!busy) onClose();
  };

  const botOptions = [
    { value: "", label: t("kanban.nobody") },
    ...bots.map((bot) => ({ value: bot.id, label: bot.icon ? `${bot.icon} ${bot.name}` : bot.name })),
  ];
  const others = tasks.filter((item) => item.id !== task?.id && item.status !== "archived");
  const titleOk = validateTaskTitle(title);
  const maxRetries = Number(retries);
  const retriesOk = Number.isInteger(maxRetries) && maxRetries >= 0 && maxRetries <= 20;

  const save = async (nextStatus: KanbanStatus) => {
    if (busy || !titleOk || !retriesOk) return;
    if (nextStatus === "ready" && !assignee) return;
    setBusy(true);
    try {
      await saveKanbanTask(session, {
        board_id: boardId,
        title: title.trim(),
        ...(task ? { id: task.id } : {}),
        description,
        priority,
        status: nextStatus,
        assignee_bot_id: assignee,
        reviewer_bot_id: reviewer,
        workspace_mode: workspace,
        recurrence_expr:
          repeatMode === "every" ? recurrenceToExpr(Number(repeatAmount) || 0, repeatUnit) : "",
        scheduled_at_ms: whenMode === "at" ? atDate.getTime() : null,
        max_retries: maxRetries,
        parent_ids: parentIds,
      });
      onClose();
      await onChanged();
    } catch (error) {
      toastKanbanError(t, error);
    } finally {
      setBusy(false);
    }
  };

  const onPickStatus = async (status: KanbanStatus) => {
    if (!task || busy || status === task.status) return;
    setBusy(true);
    try {
      await moveKanbanTask(session, task.id, status);
      onClose();
      await onChanged();
    } catch (error) {
      toastKanbanError(t, error);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!task || busy) return;
    setBusy(true);
    try {
      await deleteKanbanTask(session, task.id);
      setConfirmDelete(false);
      onClose();
      await onChanged();
    } catch (error) {
      toastKanbanError(t, error);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  const onApprove = async () => {
    if (!task || busy || task.status !== "review") return;
    setBusy(true);
    try {
      await reviewKanbanTask(session, task.id, true);
      onClose();
      await onChanged();
    } catch (error) {
      toastKanbanError(t, error);
    } finally {
      setBusy(false);
    }
  };

  const onRequestChanges = async () => {
    if (!task || busy || task.status !== "review" || !validateReviewFeedback(reviewFeedback)) return;
    setBusy(true);
    try {
      await reviewKanbanTask(session, task.id, false, reviewFeedback);
      onClose();
      await onChanged();
    } catch (error) {
      toastKanbanError(t, error);
    } finally {
      setBusy(false);
    }
  };

  const onSendMessage = async () => {
    if (!task || busy || !validateBoardMessageContent(messageDraft)) return;
    setBusy(true);
    try {
      await postKanbanMessage(session, boardId, messageDraft, task.id);
      setMessageDraft("");
      const next = await fetchKanbanTask(session, task.id);
      setDetail(next);
    } catch (error) {
      toastKanbanError(t, error);
    } finally {
      setBusy(false);
    }
  };

  const onPickerChange = (event: { type?: string }, selected?: Date) => {
    if (Platform.OS === "android" || event.type === "dismissed") setPicker(null);
    if (selected && event.type !== "dismissed") {
      const updated = new Date(atDate.getTime());
      if (picker === "date") updated.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      else updated.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setAtDate(updated);
    }
  };

  const muted = { color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 14 };
  const label = { color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 14, marginBottom: 6 };

  return (
    <>
      <Sheet open={open} onClose={close} title={task ? task.title : t("kanban.add")}>
        <ScrollView style={{ maxHeight: 560 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
          <TextField label={t("kanban.taskTitle")} value={title} onChangeText={setTitle} />
          <TextField label={t("kanban.description")} value={description} onChangeText={setDescription} multiline />
          <Text style={label}>{t("kanban.priorityLabel")}</Text>
          <Chips
            options={(["low", "medium", "high", "urgent"] as const).map((value) => ({ value, label: t(`kanban.priority.${value}`) }))}
            value={priority}
            onChange={setPriority}
          />
          <Text style={label}>{t("kanban.assignee")}</Text>
          <Chips options={botOptions} value={assignee ?? ""} onChange={(id) => setAssignee(id || null)} />
          <Text style={label}>{t("kanban.reviewer")}</Text>
          <Chips options={botOptions} value={reviewer ?? ""} onChange={(id) => setReviewer(id || null)} />
          <Text style={label}>{t("kanban.when")}</Text>
          <Chips
            options={[
              { value: "asap" as const, label: t("kanban.asap") },
              { value: "at" as const, label: t("kanban.atTime") },
            ]}
            value={whenMode}
            onChange={setWhenMode}
          />
          {whenMode === "at" ? (
            <View style={{ gap: 8 }}>
              <Text style={muted}>{shortWhen(atDate.getTime())}</Text>
              {Platform.OS === "web" ? (
                <WebDateField value={atDate} onChange={setAtDate} />
              ) : (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button title={t("kanban.date")} variant="secondary" onPress={() => setPicker(picker === "date" ? null : "date")} />
                  <Button title={t("kanban.time")} variant="secondary" onPress={() => setPicker(picker === "time" ? null : "time")} />
                </View>
              )}
              {picker && Platform.OS !== "web" ? (
                <DateTimePicker value={atDate} mode={picker} display="default" onChange={onPickerChange} />
              ) : null}
            </View>
          ) : null}
          <Text style={label}>{t("kanban.repeat")}</Text>
          <Chips
            options={[
              { value: "never" as const, label: t("kanban.never") },
              { value: "every" as const, label: t("kanban.every") },
            ]}
            value={repeatMode}
            onChange={setRepeatMode}
          />
          {repeatMode === "every" ? (
            <>
              <TextField label={t("kanban.every")} value={repeatAmount} onChangeText={setRepeatAmount} keyboardType="number-pad" />
              <Chips
                options={(["minutes", "hours", "days"] as const).map((value) => ({ value, label: t(`kanban.${value}`) }))}
                value={repeatUnit}
                onChange={setRepeatUnit}
              />
            </>
          ) : null}
          <Text style={label}>{t("kanban.workspace")}</Text>
          <Chips
            options={(["scratch", "worktree", "dir"] as const).map((value) => ({ value, label: t(`kanban.workspaceMode.${value}`) }))}
            value={workspace}
            onChange={setWorkspace}
          />
          <Text style={label}>{t("kanban.dependsOn")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {others.map((card) => (
              <Button
                key={card.id}
                title={card.title}
                variant={parentIds.includes(card.id) ? "primary" : "secondary"}
                onPress={() =>
                  setParentIds((prev) => (prev.includes(card.id) ? prev.filter((id) => id !== card.id) : [...prev, card.id]))
                }
              />
            ))}
          </View>
          <TextField label={t("kanban.maxRetries")} value={retries} onChangeText={setRetries} keyboardType="number-pad" />
          {task ? (
            <Chips
              options={KANBAN_COLUMNS.map((value) => ({ value, label: t(`kanban.status.${value}`) }))}
              value={KANBAN_COLUMNS.includes(task.status as (typeof KANBAN_COLUMNS)[number]) ? (task.status as (typeof KANBAN_COLUMNS)[number]) : "todo"}
              onChange={(status) => void onPickStatus(status)}
            />
          ) : null}
          {task && detail?.task.summary ? (
            <Text style={muted}>{t("kanban.summary")}: {detail.task.summary}</Text>
          ) : null}
          {task && detail && detail.task.artifacts.length > 0 ? (
            <Text style={muted}>{t("kanban.artifacts")}: {detail.task.artifacts.join(", ")}</Text>
          ) : null}
          {task?.status === "blocked" && (detail?.task.blocked_reason || task.blocked_reason) ? (
            <Text style={muted}>{t("kanban.blockedReason")}: {detail?.task.blocked_reason || task.blocked_reason}</Text>
          ) : null}
          {task && (detail?.task.review_feedback || task.review_feedback) ? (
            <Text style={muted}>{t("kanban.reviewNote")}: {detail?.task.review_feedback || task.review_feedback}</Text>
          ) : null}
          {task && detail && detail.runs.length > 0 ? (
            <View style={{ gap: 4 }}>
              <Text style={label}>{t("kanban.runs")}</Text>
              {detail.runs.map((run) => (
                <Text key={run.id} style={muted}>
                  {run.status} · {bots.find((bot) => bot.id === run.bot_id)?.name || run.bot_id}
                  {run.started_at_ms != null ? ` · ${shortWhen(run.started_at_ms)}` : ""}
                  {run.error ? ` · ${run.error}` : ""}
                </Text>
              ))}
            </View>
          ) : null}
          {task && detail ? (
            <View style={{ gap: 8 }}>
              <Text style={label}>{t("kanban.taskMessages")}</Text>
              {detail.messages.map((msg) => (
                <Text key={msg.id} style={muted}>{msg.author_name}: {msg.content}</Text>
              ))}
              <TextField label={t("kanban.taskMessages")} value={messageDraft} onChangeText={setMessageDraft} />
              <Button
                title={t("kanban.send")}
                variant="secondary"
                onPress={() => void onSendMessage()}
                disabled={!validateBoardMessageContent(messageDraft)}
              />
            </View>
          ) : null}
          {task?.status === "review" ? (
            <View style={{ gap: 8 }}>
              <Button title={t("kanban.approve")} onPress={() => void onApprove()} loading={busy} />
              <TextField label={t("kanban.feedback")} value={reviewFeedback} onChangeText={setReviewFeedback} />
              <Button
                title={t("kanban.requestChanges")}
                variant="secondary"
                onPress={() => void onRequestChanges()}
                loading={busy}
                disabled={!reviewFeedback.trim()}
              />
            </View>
          ) : null}
          <Button
            title={t("kanban.start")}
            onPress={() => void save("ready")}
            loading={busy}
            disabled={!assignee || !titleOk}
          />
          {!assignee ? <Text style={muted}>{t("kanban.needsBot")}</Text> : null}
          {task ? (
            <Button title={t("common.save")} variant="secondary" onPress={() => void save(task.status)} loading={busy} disabled={!titleOk || !retriesOk} />
          ) : (
            <Button title={t("kanban.saveTodo")} variant="secondary" onPress={() => void save("todo")} loading={busy} disabled={!titleOk || !retriesOk} />
          )}
          {task ? (
            <Button title={t("kanban.deleteTask")} variant="destructive" onPress={() => setConfirmDelete(true)} disabled={busy} />
          ) : null}
        </ScrollView>
      </Sheet>
      <Dialog
        open={confirmDelete}
        title={t("kanban.deleteTask")}
        message={t("kanban.deleteTaskConfirm")}
        confirmLabel={t("kanban.deleteTask")}
        cancelLabel={t("common.cancel")}
        destructive
        onCancel={() => {
          if (!busy) setConfirmDelete(false);
        }}
        onConfirm={() => void onDelete()}
      />
    </>
  );
}
