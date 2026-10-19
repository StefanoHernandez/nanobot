import React, { useEffect, useMemo, useState } from "react";
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
import { router } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { i18n, useT } from "../../../i18n";
import { Button, Sheet, TextField, toast } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { useSession } from "../../../state/sessionStore";
import { chatIdOf, chatsStore, isWritable, useChats } from "../../../state/chatsStore";
import { everyUnitToMs, formatAtLocal } from "./scheduleHelpers";
import { Chips } from "../../settings/common";

export type NewAutomationSheetProps = {
  open: boolean;
  onClose: () => void;
  onRefresh?: () => Promise<void>;
};

type WhenKind = "daily" | "every" | "once" | "advanced";
type TargetMode = "new" | "existing";

export function NewAutomationSheet({ open, onClose, onRefresh }: NewAutomationSheetProps) {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();

  // Field 1: Cosa deve fare
  const [message, setMessage] = useState("");

  // Field 2: Nome (optional)
  const [name, setName] = useState("");

  // Field 3: Quando (Chips: Ogni giorno, Ogni N, Una volta, Avanzato)
  const [whenKind, setWhenKind] = useState<WhenKind>("daily");

  // Daily state
  const [dailyTime, setDailyTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [showDailyPicker, setShowDailyPicker] = useState(false);

  // Every N state
  const [everyAmount, setEveryAmount] = useState("5");
  const [everyUnit, setEveryUnit] = useState<"minutes" | "hours" | "days">("minutes");

  // Once state
  const [onceDate, setOnceDate] = useState<Date>(() => new Date(Date.now() + 3600 * 1000));
  const [showOncePicker, setShowOncePicker] = useState<"date" | "time" | null>(null);

  // Advanced state
  const [cronExpr, setCronExpr] = useState("");

  // Field 4: Dove risponde
  const [targetMode, setTargetMode] = useState<TargetMode>("new");
  const [selectedChatKey, setSelectedChatKey] = useState<string | null>(null);

  // Status & error
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const chats = useChats((s) => s.chats);
  const isTemporary = useChats((s) => s.isTemporary);
  const nonTempChats = useMemo(
    () => chats.filter((c) => !isTemporary(c.key) && isWritable(c.key)),
    [chats, isTemporary],
  );

  useEffect(() => {
    if (open) {
      setMessage("");
      setName("");
      setWhenKind("daily");
      const d = new Date();
      d.setHours(8, 0, 0, 0);
      setDailyTime(d);
      setShowDailyPicker(false);
      setEveryAmount("5");
      setEveryUnit("minutes");
      setOnceDate(new Date(Date.now() + 3600 * 1000));
      setShowOncePicker(null);
      setCronExpr("");
      setTargetMode("new");
      setSelectedChatKey(null);
      setCreating(false);
      setServerError(null);
    }
  }, [open]);

  const autoNamePlaceholder = useMemo(() => {
    const trimmed = message.trim();
    return trimmed ? trimmed.slice(0, 40) : t("automations.namePlaceholder", "Nome opzionale");
  }, [message, t]);

  const deviceTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  const computedSchedule = useMemo(() => {
    if (whenKind === "daily") {
      const min = dailyTime.getMinutes();
      const hr = dailyTime.getHours();
      return {
        kind: "cron" as const,
        expr: `${min} ${hr} * * *`,
        tz: deviceTimezone,
      };
    }
    if (whenKind === "every") {
      const ms = everyUnitToMs(everyAmount, everyUnit);
      if (!ms || ms < 60_000) return null;
      return {
        kind: "every" as const,
        every_ms: ms,
      };
    }
    if (whenKind === "once") {
      const atMs = onceDate.getTime();
      if (atMs <= Date.now()) return null;
      return {
        kind: "at" as const,
        at_ms: atMs,
      };
    }
    if (whenKind === "advanced") {
      const trimmed = cronExpr.trim();
      if (!trimmed) return null;
      return {
        kind: "cron" as const,
        expr: trimmed,
        tz: deviceTimezone,
      };
    }
    return null;
  }, [whenKind, dailyTime, everyAmount, everyUnit, onceDate, cronExpr, deviceTimezone]);

  const canCreate = useMemo(() => {
    if (!message.trim()) return false;
    if (!computedSchedule) return false;
    if (targetMode === "existing" && !selectedChatKey) return false;
    return true;
  }, [message, computedSchedule, targetMode, selectedChatKey]);

  const handleCreate = async () => {
    if (!session || !canCreate || !computedSchedule) return;
    setCreating(true);
    setServerError(null);
    try {
      let finalKey = selectedChatKey;
      const finalName = name.trim() || message.trim().slice(0, 40);
      if (targetMode === "new") {
        const newKey = await chatsStore.getState().newChat();
        await chatsStore.getState().rename(newKey, finalName);
        finalKey = newKey;
      }
      if (!finalKey) throw new Error("No target chat");

      await session.post("/api/ext/automations/create", {
        name: finalName,
        message: message.trim(),
        schedule: computedSchedule,
        session_key: finalKey,
      });

      toast.show(t("automations.createdSuccess", "Automazione creata"));
      onClose();
      if (onRefresh) {
        await onRefresh();
      }
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || String(e);
      setServerError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDescribeToBot = async () => {
    try {
      const newKey = await chatsStore.getState().newChat();
      const text = message.trim();
      if (session && text) {
        session.client.sendMessage(chatIdOf(newKey), text, undefined, {
          intent: "create_automation",
        });
      }
      onClose();
      router.navigate(`/chat/${encodeURIComponent(newKey)}`);
    } catch (e: any) {
      toast.show(e?.message || String(e));
    }
  };

  const whenOptions = [
    { value: "daily" as const, label: t("automations.whenDaily", "Ogni giorno") },
    { value: "every" as const, label: t("automations.whenEvery", "Ogni N") },
    { value: "once" as const, label: t("automations.whenOnce", "Una volta") },
    { value: "advanced" as const, label: t("automations.whenAdvanced", "Avanzato") },
  ];

  return (
    <Sheet open={open} onClose={onClose} title={t("automations.new", "Nuova automazione")}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* 1. Cosa deve fare */}
          <View style={styles.section}>
            <TextField
              label={t("automations.whatToDo", "Cosa deve fare")}
              value={message}
              onChangeText={(val) => {
                setMessage(val);
                setServerError(null);
              }}
              multiline
              numberOfLines={3}
              placeholder={t("automations.whatToDoPlaceholder", "Riassumi le notizie su…")}
            />
          </View>

          {/* 2. Nome */}
          <View style={styles.section}>
            <TextField
              label={t("automations.name", "Nome")}
              value={name}
              onChangeText={(val) => {
                setName(val);
                setServerError(null);
              }}
              placeholder={autoNamePlaceholder}
            />
          </View>

          {/* 3. Quando */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
              {t("automations.when", "Quando")}
            </Text>
            <Chips options={whenOptions} value={whenKind} onChange={setWhenKind} />

            {whenKind === "daily" && (
              <View style={styles.scheduleBlock}>
                <Text style={[styles.fieldLabel, { color: th.colors.foreground, fontFamily: th.font.medium }]}>
                  {dailyTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
                <Button
                  title={t("automations.time", "Ora")}
                  variant="secondary"
                  onPress={() => setShowDailyPicker(true)}
                />
                {showDailyPicker && (
                  <DateTimePicker
                    value={dailyTime}
                    mode="time"
                    display="default"
                    onChange={(event, selected) => {
                      if (Platform.OS === "android") setShowDailyPicker(false);
                      if (selected) setDailyTime(selected);
                    }}
                  />
                )}
              </View>
            )}

            {whenKind === "every" && (
              <View style={styles.scheduleBlock}>
                <TextField
                  label={t("automations.interval", "Intervallo")}
                  value={everyAmount}
                  onChangeText={(val) => {
                    setEveryAmount(val);
                    setServerError(null);
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
                        setServerError(null);
                      }}
                    />
                  ))}
                </View>
              </View>
            )}

            {whenKind === "once" && (
              <View style={styles.scheduleBlock}>
                <Text style={[styles.momentText, { color: th.colors.foreground, fontFamily: th.font.regular }]}>
                  {formatAtLocal(onceDate.getTime(), i18n.language)}
                </Text>
                <View style={styles.buttonRow}>
                  <Button
                    title={t("automations.date", "Data")}
                    variant="secondary"
                    onPress={() => setShowOncePicker(showOncePicker === "date" ? null : "date")}
                  />
                  <Button
                    title={t("automations.time", "Ora")}
                    variant="secondary"
                    onPress={() => setShowOncePicker(showOncePicker === "time" ? null : "time")}
                  />
                </View>
                {showOncePicker && (
                  <DateTimePicker
                    value={onceDate}
                    mode={showOncePicker}
                    display="default"
                    onChange={(event, selected) => {
                      if (Platform.OS === "android") setShowOncePicker(null);
                      if (selected) setOnceDate(selected);
                    }}
                  />
                )}
              </View>
            )}

            {whenKind === "advanced" && (
              <View style={styles.scheduleBlock}>
                <TextField
                  label={t("automations.schedule", "Pianificazione")}
                  value={cronExpr}
                  onChangeText={(val) => {
                    setCronExpr(val);
                    setServerError(null);
                  }}
                  placeholder="0 8 * * 1-5"
                />
                <Text style={[styles.helperText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                  {t("automations.cronExample", "Es. 0 8 * * 1-5 (Lun-Ven alle 8:00)")}
                </Text>
              </View>
            )}
          </View>

          {/* 4. Dove risponde */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
              {t("automations.whereToReply", "Dove risponde")}
            </Text>
            <View style={styles.chipsRow}>
              <Button
                title={t("automations.newChat", "Nuova chat")}
                variant={targetMode === "new" ? "primary" : "secondary"}
                onPress={() => {
                  setTargetMode("new");
                  setSelectedChatKey(null);
                }}
              />
              <Button
                title={t("automations.existingChat", "Chat esistente")}
                variant={targetMode === "existing" ? "primary" : "secondary"}
                onPress={() => {
                  setTargetMode("existing");
                  if (!selectedChatKey && nonTempChats.length > 0) {
                    setSelectedChatKey(nonTempChats[0].key);
                  }
                }}
              />
            </View>

            {targetMode === "existing" && (
              <ScrollView
                testID="automation-chat-picker"
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                style={[styles.pickerBox, { backgroundColor: th.colors.card, borderColor: th.colors.border }]}
              >
                {nonTempChats.length === 0 ? (
                  <Text style={[styles.emptyText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                    {t("automations.empty", "Nessuna chat trovata")}
                  </Text>
                ) : (
                  nonTempChats.map((c) => (
                    <Pressable
                      key={c.key}
                      style={[
                        styles.chatItem,
                        {
                          backgroundColor: c.key === selectedChatKey ? th.colors.accent : "transparent",
                        },
                      ]}
                      onPress={() => setSelectedChatKey(c.key)}
                    >
                      <Text style={[styles.chatTitle, { color: th.colors.foreground, fontFamily: th.font.medium }]}>
                        {c.title || t("chats.untitled", "Nuova chat")}
                      </Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            )}
          </View>

          {/* 5. Crea button & error */}
          <View style={styles.actionSection}>
            {serverError && (
              <Text style={[styles.errorText, { color: th.colors.destructive, fontFamily: th.font.regular }]}>
                {serverError}
              </Text>
            )}
            <Button
              title={creating ? t("automations.creating", "Creazione...") : t("automations.create", "Crea")}
              disabled={!canCreate || creating}
              onPress={() => void handleCreate()}
            />
          </View>

          {/* Secondary link: Oppure descrivila al bot */}
          <View style={styles.footerSection}>
            <Button
              title={t("automations.describeToBot", "Oppure descrivila al bot")}
              variant="ghost"
              onPress={() => void handleDescribeToBot()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 24,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 16,
    marginBottom: 8,
  },
  momentText: {
    fontSize: 15,
    marginBottom: 8,
  },
  scheduleBlock: {
    gap: 8,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  helperText: {
    fontSize: 13,
    marginTop: 4,
  },
  pickerBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    marginTop: 8,
    maxHeight: 180,
    overflow: "hidden",
  },
  chatItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
    justifyContent: "center",
  },
  chatTitle: {
    fontSize: 14,
  },
  emptyText: {
    padding: 12,
    fontSize: 14,
    textAlign: "center",
  },
  actionSection: {
    marginTop: 8,
    gap: 8,
  },
  errorText: {
    fontSize: 14,
    textAlign: "center",
  },
  footerSection: {
    marginTop: 12,
    alignItems: "center",
  },
});
