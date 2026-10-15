import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { i18n, useT } from "../../../i18n";
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

export function parseEveryMsToUnit(everyMs: number): { amount: string; unit: "minutes" | "hours" | "days" } {
  if (typeof everyMs !== "number" || isNaN(everyMs) || everyMs <= 0) {
    return { amount: "", unit: "minutes" };
  }
  const days = everyMs / 86_400_000;
  if (days >= 1 && Number.isInteger(days)) {
    return { amount: String(days), unit: "days" };
  }
  const hours = everyMs / 3_600_000;
  if (hours >= 1 && Number.isInteger(hours)) {
    return { amount: String(hours), unit: "hours" };
  }
  const mins = everyMs / 60_000;
  if (Number.isInteger(mins)) {
    return { amount: String(mins), unit: "minutes" };
  }
  const rounded = Math.round(mins * 10000) / 10000;
  return { amount: String(rounded), unit: "minutes" };
}

export function everyUnitToMs(amountStr: string, unit: "minutes" | "hours" | "days"): number | null {
  const trimmed = amountStr.trim();
  if (!trimmed) return null;
  const num = parseFloat(trimmed);
  if (isNaN(num) || num <= 0) return null;
  if (unit === "days") return Math.round(num * 86_400_000);
  if (unit === "hours") return Math.round(num * 3_600_000);
  if (unit === "minutes") return Math.round(num * 60_000);
  return null;
}

export function formatAtLocal(atMs?: number | null, lang = "en"): string {
  if (typeof atMs !== "number" || isNaN(atMs) || atMs <= 0) return "";
  const d = new Date(atMs);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function formatAtSchedule(atMs?: number | null): string {
  return formatAtLocal(atMs, i18n.language);
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
  const { amount, unit } = parseEveryMsToUnit(everyMs);
  return `${amount} ${i18n.t(`automations.${unit}`)}`;
}

export function parseEverySchedule(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num) || num <= 0) return null;
  const unit = match[2];
  if (["d", "day", "days", "giorni", "g"].includes(unit)) {
    return Math.round(num * 86_400_000);
  }
  if (["h", "hr", "hrs", "hour", "hours", "ore", "o"].includes(unit)) {
    return Math.round(num * 3_600_000);
  }
  if (["m", "min", "mins", "minute", "minutes", "minuti"].includes(unit)) {
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
  const [atDate, setAtDate] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState<"date" | "time" | null>(null);
  const [everyAmount, setEveryAmount] = useState("");
  const [everyUnit, setEveryUnit] = useState<"minutes" | "hours" | "days">("minutes");
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
          const atMs = job.schedule.at_ms ?? (Date.now() + 3600 * 1000);
          setAtDate(new Date(atMs));
          initSchedule = formatAtLocal(atMs, i18n.language);
        } else if (job.schedule.kind === "every" || job.schedule.every_ms !== undefined) {
          const parsed = parseEveryMsToUnit(job.schedule.every_ms ?? 0);
          setEveryAmount(parsed.amount);
          setEveryUnit(parsed.unit);
          initSchedule = formatEverySchedule(job.schedule.every_ms);
        } else {
          initSchedule = job.schedule.expr || "";
        }
      }
      setScheduleExpr(initSchedule);
      setShowPicker(null);
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

  const handlePickerChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android" || event.type === "dismissed") {
      setShowPicker(null);
    }
    if (selectedDate && event.type !== "dismissed") {
      const base = atDate || new Date();
      const updated = new Date(base.getTime());
      if (showPicker === "date") {
        updated.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      } else if (showPicker === "time") {
        updated.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
      }
      setAtDate(updated);
      setEditError(null);
    }
  };

  const handleSaveEdit = async () => {
    setEditError(null);
    if (!messageText.trim()) {
      setEditError(t("automations.messageRequired"));
      return;
    }

    let scheduleToSend: any = undefined;
    if (job.schedule) {
      const kind = job.schedule.kind || (job.schedule.at_ms !== undefined ? "at" : job.schedule.every_ms !== undefined ? "every" : "cron");
      const tz = job.schedule.tz;

      if (kind === "at") {
        if (!atDate || isNaN(atDate.getTime())) {
          setEditError(t("automations.err.invalid", "Valore non valido"));
          return;
        }
        if (atDate.getTime() <= Date.now()) {
          setEditError(t("automations.err.past", "La data selezionata è nel passato"));
          return;
        }
        scheduleToSend = {
          kind: "at",
          at_ms: atDate.getTime(),
          ...(tz ? { tz } : {}),
        };
      } else if (kind === "every") {
        const ms = everyUnitToMs(everyAmount, everyUnit);
        if (ms === null || ms <= 0) {
          setEditError(t("automations.err.invalid", "Valore non valido"));
          return;
        }
        scheduleToSend = {
          kind: "every",
          every_ms: ms,
          ...(tz ? { tz } : {}),
        };
      } else {
        if (!scheduleExpr.trim()) {
          setEditError(t("automations.scheduleRequired"));
          return;
        }
        scheduleToSend = {
          kind: "cron",
          expr: scheduleExpr.trim(),
          ...(tz ? { tz } : {}),
        };
      }
    }

    setSavingEdit(true);
    try {
      await update(job.id, {
        message: messageText.trim(),
        ...(scheduleToSend ? { schedule: scheduleToSend } : {}),
      });
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
  const scheduleKind = job.schedule?.kind || (job.schedule?.at_ms !== undefined ? "at" : job.schedule?.every_ms !== undefined ? "every" : "cron");
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

              {job.schedule ? (
                scheduleKind === "at" ? (
                  <View style={styles.scheduleBlock}>
                    <Text style={[styles.fieldLabel, { color: th.colors.foreground, fontFamily: th.font.medium }]}>
                      {t("automations.schedule")}
                    </Text>
                    <Text style={[styles.momentText, { color: th.colors.foreground, fontFamily: th.font.regular }]}>
                      {formatAtLocal(atDate.getTime(), i18n.language)}
                    </Text>
                    <View style={styles.buttonRow}>
                      <Button
                        title={t("automations.date")}
                        variant="secondary"
                        onPress={() => setShowPicker(showPicker === "date" ? null : "date")}
                      />
                      <Button
                        title={t("automations.time")}
                        variant="secondary"
                        onPress={() => setShowPicker(showPicker === "time" ? null : "time")}
                      />
                    </View>
                    {showPicker ? (
                      <DateTimePicker
                        value={atDate}
                        mode={showPicker}
                        display="default"
                        onChange={handlePickerChange}
                      />
                    ) : null}
                  </View>
                ) : scheduleKind === "every" ? (
                  <View style={styles.scheduleBlock}>
                    <TextField
                      label={t("automations.interval")}
                      value={everyAmount}
                      onChangeText={(val) => {
                        setEveryAmount(val);
                        setEditError(null);
                      }}
                      keyboardType="number-pad"
                    />
                    <View style={styles.chipsRow}>
                      {(["minutes", "hours", "days"] as const).map((u) => (
                        <Button
                          key={u}
                          title={t(`automations.${u}`)}
                          variant={everyUnit === u ? "primary" : "secondary"}
                          onPress={() => {
                            setEveryUnit(u);
                            setEditError(null);
                          }}
                        />
                      ))}
                    </View>
                  </View>
                ) : (
                  <TextField
                    label={t("automations.schedule")}
                    value={scheduleExpr}
                    onChangeText={setScheduleExpr}
                  />
                )
              ) : null}

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
  scheduleBlock: {
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 14,
    marginBottom: 6,
  },
  momentText: {
    fontSize: 15,
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
});
