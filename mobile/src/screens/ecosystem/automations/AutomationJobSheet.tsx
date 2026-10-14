import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useT } from "../../../i18n";
import { Button, Dialog, Sheet, TextField } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { toast } from "../../../ui/components/Toast";
import { Markdown } from "../../../ui/markdown/Markdown";
import { useSession } from "../../../state/sessionStore";
import {
  fetchAutomationChats,
  fetchAutomationRunResult,
} from "../../../ecosystem/automations";
import { toastEcosystemError } from "../../../ecosystem/common";
import { formatSchedule } from "./AutomationRow";
import type { AutomationChat, AutomationChatsPayload, SessionAutomationJob } from "@/lib/types";

export type AutomationJobSheetProps = {
  open: boolean;
  job: SessionAutomationJob | null;
  onClose: () => void;
  onRun?: (id: string) => Promise<{ payload: any; result: string | null }>;
  onDelete?: (id: string) => Promise<any>;
  onUpdate?: (id: string, values: any) => Promise<any>;
  onChangeChat?: (id: string, values: any) => Promise<any>;
  onFetchResult?: (id: string, runAtMs: number, kind: "cron" | "local_trigger") => Promise<{ response: string | null }>;
  onRefresh?: () => Promise<void>;
};
export function formatAtSchedule(atMs?: number | null): string {
  if (typeof atMs !== "number" || isNaN(atMs) || atMs <= 0) return "";
  const d = new Date(atMs);
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
}

export function parseAtSchedule(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d{11,15}$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!isNaN(n) && n > 0) return n;
  }
  const timestamp = Date.parse(trimmed);
  if (!isNaN(timestamp)) {
    return timestamp;
  }
  return null;
}

export function formatEverySchedule(everyMs?: number | null): string {
  if (typeof everyMs !== "number" || isNaN(everyMs) || everyMs <= 0) return "";
  const days = everyMs / 86_400_000;
  if (days >= 1 && Number.isInteger(days)) {
    return days === 1 ? "1 day" : `${days} days`;
  }
  const hours = everyMs / 3_600_000;
  if (hours >= 1 && Number.isInteger(hours)) {
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  const mins = Math.round(everyMs / 60_000);
  return mins === 1 ? "1 minute" : `${mins} minutes`;
}

export function parseEverySchedule(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num) || num <= 0) return null;
  const unit = match[2];
  if (["d", "day", "days"].includes(unit)) {
    return Math.round(num * 86_400_000);
  }
  if (["h", "hr", "hrs", "hour", "hours"].includes(unit)) {
    return Math.round(num * 3_600_000);
  }
  if (["m", "min", "mins", "minute", "minutes"].includes(unit)) {
    return Math.round(num * 60_000);
  }
  return null;
}

export function AutomationJobSheet({
  open,
  job,
  onClose,
  onRun,
  onDelete,
  onUpdate,
  onChangeChat,
  onFetchResult,
}: AutomationJobSheetProps) {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();

  const run = onRun ?? (async () => ({ payload: null, result: null }));
  const deleteJob = onDelete ?? (async () => {});
  const update = onUpdate ?? (async () => {});
  const changeChat = onChangeChat ?? (async () => {});
  const fetchResult = onFetchResult ?? (async (id, ms, k) => session ? fetchAutomationRunResult(session, id, ms, k) : { response: null });

  const [confirmRun, setConfirmRun] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  const [runResult, setRunResult] = useState<string | null>(null);
  const [loadingRunResult, setLoadingRunResult] = useState(false);

  // Edit fields
  const [messageText, setMessageText] = useState("");
  const [scheduleExpr, setScheduleExpr] = useState("");
  const initialScheduleRef = useRef("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Change chat picker
  const [showChatPicker, setShowChatPicker] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [chatsPayload, setChatsPayload] = useState<AutomationChatsPayload | null>(null);
  const [changingChat, setChangingChat] = useState(false);

  // Selected past run result
  const [pastRunResult, setPastRunResult] = useState<string | null>(null);
  const [loadingPastRun, setLoadingPastRun] = useState(false);

  useEffect(() => {
    if (job) {
      setMessageText(job.payload?.message || "");
      let initSchedule = "";
      if (job.schedule) {
        if (job.schedule.kind === "at" || job.schedule.at_ms !== undefined) {
          initSchedule = job.schedule.at_ms !== undefined ? formatAtSchedule(job.schedule.at_ms) : "";
        } else if (job.schedule.kind === "every" || job.schedule.every_ms !== undefined) {
          initSchedule = job.schedule.every_ms !== undefined ? formatEverySchedule(job.schedule.every_ms) : "";
        } else {
          initSchedule = job.schedule.expr || "";
        }
      }
      setScheduleExpr(initSchedule);
      initialScheduleRef.current = initSchedule;
      setEditError(null);
      setRunResult(null);
      setShowChatPicker(false);
      setChatsPayload(null);
      setPastRunResult(null);
    }
    runningRef.current = false;
    setRunning(false);
    setConfirmRun(false);
    setConfirmDelete(false);
  }, [job]);

  if (!open || !job) return null;

  const handleConfirmRun = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setConfirmRun(false);
    setRunning(true);
    setLoadingRunResult(true);

    try {
      const res = await run(job.id);
      if (res && res.result !== undefined && res.result !== null) {
        setRunResult(res.result);
      } else {
        setRunResult(t("automations.runSuccess", "Execution completed"));
      }
    } catch (e) {
      toastEcosystemError(e, t);
    } finally {
      runningRef.current = false;
      setRunning(false);
      setLoadingRunResult(false);
    }
  };

  const handleConfirmDelete = async () => {
    setConfirmDelete(false);
    try {
      await deleteJob(job.id);
      onClose();
    } catch (e) {
      toastEcosystemError(e, t);
    }
  };

  const handleSaveEdit = async () => {
    setEditError(null);
    if (!messageText.trim()) {
      setEditError(t("automations.messageRequired"));
      return;
    }
    if (job.schedule && !scheduleExpr.trim()) {
      setEditError(t("automations.scheduleRequired"));
      return;
    }

    setSavingEdit(true);
    try {
      let scheduleToSend: any = undefined;
      if (job.schedule) {
        const kind = job.schedule.kind || "cron";
        const tz = job.schedule.tz;
        const edited = scheduleExpr.trim() !== initialScheduleRef.current.trim();
        if (edited) {
          if (kind === "at") {
            const parsed = parseAtSchedule(scheduleExpr);
            if (parsed === null) {
              setEditError(t("automations.invalidSchedule", "Invalid schedule format"));
              return;
            }
            scheduleToSend = {
              kind: "at",
              at_ms: parsed,
              ...(tz ? { tz } : {}),
            };
          } else if (kind === "every") {
            const parsed = parseEverySchedule(scheduleExpr);
            if (parsed === null) {
              setEditError(t("automations.invalidSchedule", "Invalid schedule format"));
              return;
            }
            scheduleToSend = {
              kind: "every",
              every_ms: parsed,
              ...(tz ? { tz } : {}),
            };
          } else {
            scheduleToSend = {
              kind: "cron",
              expr: scheduleExpr.trim(),
              ...(tz ? { tz } : {}),
            };
          }
        } else {
          scheduleToSend = {
            kind,
            ...(job.schedule.at_ms !== undefined ? { at_ms: job.schedule.at_ms } : {}),
            ...(job.schedule.every_ms !== undefined ? { every_ms: job.schedule.every_ms } : {}),
            ...(job.schedule.expr !== undefined ? { expr: job.schedule.expr } : {}),
            ...(tz ? { tz } : {}),
          };
        }
      }

      await update(job.id, {
        message: messageText.trim(),
        ...(scheduleToSend ? { schedule: scheduleToSend } : {}),
      });
      initialScheduleRef.current = scheduleExpr.trim();
      toast.show(t("automations.saved", "Saved"));
    } catch (e) {
      setEditError(t("common.operationFailed", "Operazione non riuscita"));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleOpenChatPicker = async () => {
    if (!session) return;
    setShowChatPicker(true);
    setLoadingChats(true);
    try {
      const payload = await fetchAutomationChats(session, job.id);
      setChatsPayload(payload);
    } catch (e) {
      toastEcosystemError(e, t);
      setShowChatPicker(false);
    } finally {
      setLoadingChats(false);
    }
  };

  const handleSelectChat = async (chat: AutomationChat) => {
    if (!chatsPayload) return;
    setChangingChat(true);
    try {
      await changeChat(job.id, {
        target_id: chat.id,
        revision: chatsPayload.revision,
        message: job.payload?.message || "",
      });
      setShowChatPicker(false);
      toast.show(t("automations.chatChanged", "Chat changed"));
    } catch (e) {
      toastEcosystemError(e, t);
    } finally {
      setChangingChat(false);
    }
  };

  const handleSelectPastRun = async (runItem: { run_at_ms: number }) => {
    setLoadingPastRun(true);
    setPastRunResult(null);
    try {
      const kind = (job.kind as "cron" | "local_trigger") || "cron";
      const res = await fetchResult(job.id, runItem.run_at_ms, kind);
      setPastRunResult(res.response || "No output recorded");
    } catch (e) {
      toastEcosystemError(e, t);
    } finally {
      setLoadingPastRun(false);
    }
  };

  const title = job.name || (job.payload?.message ? job.payload.message.split("\n")[0] : t("automations.title"));
  const scheduleStr = formatSchedule(job.schedule);
  const nextRunTime = job.state?.next_run_at_ms ? new Date(job.state.next_run_at_ms).toLocaleString() : null;
  const targetChat = job.origin?.title || job.origin?.chat_id || null;
  const pastRuns = job.state?.run_history || [];

  return (
    <>
      <Sheet open={open} title={title} onClose={onClose}>
        <KeyboardAvoidingView behavior="padding">
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* Meta info */}
            <View style={styles.section}>
              <Text style={[styles.metaText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                {t("automations.schedule")}: {scheduleStr}
              </Text>
              {nextRunTime ? (
                <Text style={[styles.metaText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                  {t("automations.nextRun", { time: nextRunTime })}
                </Text>
              ) : null}
              {targetChat ? (
                <Text style={[styles.metaText, { color: th.colors.primary, fontFamily: th.font.regular }]}>
                  {t("automations.targetChat", { title: targetChat })}
                </Text>
              ) : null}
            </View>

            {/* Run Now Action */}
            <View style={styles.actionRow}>
              <Button
                title={running ? t("automations.running") : t("automations.runNow")}
                variant="primary"
                disabled={running}
                onPress={() => setConfirmRun(true)}
              />
            </View>

            {/* Run Result View */}
            {loadingRunResult ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={th.colors.primary} />
              </View>
            ) : runResult ? (
              <View style={[styles.resultCard, { backgroundColor: th.colors.card, borderColor: th.colors.border }]}>
                <Text style={[styles.resultHeader, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
                  {t("automations.runResult")}
                </Text>
                <Markdown text={runResult} />
              </View>
            ) : null}

            {/* Edit Section */}
            <View style={[styles.section, { borderTopColor: th.colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16 }]}>
              <Text style={[styles.sectionTitle, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
                {t("automations.edit")}
              </Text>

              <TextField
                label={t("automations.message")}
                value={messageText}
                onChangeText={setMessageText}
                multiline
              />

              <TextField
                label={t("automations.schedule")}
                value={scheduleExpr}
                onChangeText={setScheduleExpr}
              />

              {editError ? (
                <Text style={[styles.errorText, { color: th.colors.destructive, fontFamily: th.font.regular }]}>
                  {editError}
                </Text>
              ) : null}

              <Button
                title={savingEdit ? t("common.saving", "Saving...") : t("automations.save")}
                variant="secondary"
                disabled={savingEdit}
                onPress={() => void handleSaveEdit()}
              />
            </View>

            {/* Change Chat Action */}
            <View style={[styles.section, { borderTopColor: th.colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16 }]}>
              <Button
                title={t("automations.changeChat")}
                variant="secondary"
                onPress={() => void handleOpenChatPicker()}
              />

              {showChatPicker ? (
                <View style={[styles.pickerBox, { backgroundColor: th.colors.card, borderColor: th.colors.border }]}>
                  <Text style={[styles.pickerTitle, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
                    {t("automations.selectChat")}
                  </Text>
                  {loadingChats ? (
                    <ActivityIndicator size="small" color={th.colors.primary} />
                  ) : (
                    chatsPayload?.chats.map((c) => (
                      <Pressable
                        key={c.id}
                        style={[
                          styles.chatItem,
                          {
                            backgroundColor: c.id === chatsPayload.current?.id ? th.colors.accent : "transparent",
                          },
                        ]}
                        disabled={changingChat}
                        onPress={() => void handleSelectChat(c)}
                      >
                        <Text style={[styles.chatTitle, { color: th.colors.foreground, fontFamily: th.font.medium }]}>
                          {c.title}
                        </Text>
                        <Text style={[styles.chatChannel, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                          {c.channel}
                        </Text>
                      </Pressable>
                    ))
                  )}
                </View>
              ) : null}
            </View>

            {/* Past Runs Section */}
            {pastRuns.length > 0 ? (
              <View style={[styles.section, { borderTopColor: th.colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16 }]}>
                <Text style={[styles.sectionTitle, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
                  {t("automations.pastRuns")}
                </Text>
                {pastRuns.map((r, i) => (
                  <Pressable
                    key={i}
                    style={[styles.pastRunRow, { borderBottomColor: th.colors.border }]}
                    onPress={() => void handleSelectPastRun(r)}
                  >
                    <Text style={[styles.pastRunDate, { color: th.colors.foreground, fontFamily: th.font.regular }]}>
                      {new Date(r.run_at_ms).toLocaleString()}
                    </Text>
                    <Text
                      style={[
                        styles.pastRunStatus,
                        {
                          color: r.status === "ok" ? th.colors.primary : th.colors.destructive,
                          fontFamily: th.font.medium,
                        },
                      ]}
                    >
                      {r.status}
                    </Text>
                  </Pressable>
                ))}

                {loadingPastRun ? (
                  <ActivityIndicator size="small" color={th.colors.primary} style={{ marginTop: 8 }} />
                ) : pastRunResult ? (
                  <View style={[styles.resultCard, { backgroundColor: th.colors.card, borderColor: th.colors.border }]}>
                    <Markdown text={pastRunResult} />
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Delete Action */}
            <View style={[styles.actionRow, { borderTopColor: th.colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16 }]}>
              <Button
                title={t("automations.delete")}
                variant="destructive"
                onPress={() => setConfirmDelete(true)}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Sheet>

      {/* Confirm Run Dialog */}
      <Dialog
        open={confirmRun}
        title={t("automations.runNowConfirmTitle")}
        message={t("automations.runNowConfirm")}
        confirmLabel={t("automations.runNow")}
        cancelLabel={t("automations.cancel")}
        onConfirm={() => void handleConfirmRun()}
        onCancel={() => setConfirmRun(false)}
      />

      {/* Confirm Delete Dialog */}
      <Dialog
        open={confirmDelete}
        title={t("automations.deleteConfirmTitle")}
        message={t("automations.deleteConfirm")}
        confirmLabel={t("automations.delete")}
        cancelLabel={t("automations.cancel")}
        destructive
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 520,
  },
  section: {
    marginBottom: 16,
    gap: 8,
  },
  metaText: {
    fontSize: 14,
  },
  actionRow: {
    marginBottom: 16,
  },
  loadingBox: {
    padding: 16,
    alignItems: "center",
  },
  resultCard: {
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  resultHeader: {
    fontSize: 15,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 16,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
  },
  pickerBox: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
    gap: 4,
  },
  pickerTitle: {
    fontSize: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chatItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
  },
  chatTitle: {
    fontSize: 14,
  },
  chatChannel: {
    fontSize: 13,
  },
  pastRunRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  pastRunDate: {
    fontSize: 14,
  },
  pastRunStatus: {
    fontSize: 13,
  },
});
