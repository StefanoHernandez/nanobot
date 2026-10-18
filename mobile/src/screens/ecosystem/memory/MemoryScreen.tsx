import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useT } from "../../../i18n";
import { useMemory } from "../../../ecosystem/memory";
import {
  fetchJournal,
  fetchJournalDay,
  runJournal,
  saveJournalSettings,
  type JournalIndex,
} from "../../../ecosystem/journal";
import { useSession } from "../../../state/sessionStore";
import { Chips } from "../../settings/common";
import { IconButton, goBackOr, toast } from "../../../ui/components";
import { Markdown } from "../../../ui/markdown/Markdown";
import { useTheme } from "../../../ui/ThemeProvider";

type MemoryTab = "user" | "memory" | "soul" | "journal";

function formatSchedule(schedule: string, t: (key: string, opts?: { count?: number }) => string): string {
  const m = /^every (\d+)h$/.exec(schedule.trim());
  if (m) {
    return t("memory.everyHours", { count: Number(m[1]) });
  }
  return schedule;
}

export function MemoryScreen() {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();
  const { pages, loading, error, refresh } = useMemory();
  const params = useLocalSearchParams<{ tab?: string; date?: string }>();
  const initialTab: MemoryTab =
    params.tab && ["user", "memory", "soul", "journal"].includes(params.tab)
      ? (params.tab as MemoryTab)
      : params.date
      ? "journal"
      : "user";
  const [tab, setTab] = useState<MemoryTab>(initialTab);
  const [journal, setJournal] = useState<JournalIndex | null>(null);
  const [dayText, setDayText] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (params.tab && ["user", "memory", "soul", "journal"].includes(params.tab)) {
      setTab(params.tab as MemoryTab);
    } else if (params.date) {
      setTab("journal");
    }
  }, [params.tab, params.date]);

  useEffect(() => {
    if (!session || !params.date) return;
    void fetchJournalDay(session, params.date)
      .then((pageDay) => setDayText(pageDay.text))
      .catch(() => {});
  }, [session, params.date]);

  const loadJournal = useCallback(async () => {
    if (!session) return;
    try {
      setJournal(await fetchJournal(session));
    } catch {
      setJournal(null);
    }
  }, [session]);

  useEffect(() => {
    void loadJournal();
  }, [loadJournal]);

  const tabOptions = useMemo(
    () =>
      [
        { value: "user" as const, label: t("memory.profile") },
        { value: "memory" as const, label: t("memory.notes") },
        { value: "soul" as const, label: t("memory.voice") },
        { value: "journal" as const, label: t("memory.journal") },
      ] satisfies { value: MemoryTab; label: string }[],
    [t],
  );

  const page = tab === "journal" ? undefined : pages?.pages[tab];
  const enabled = journal?.enabled === true;
  const hour = journal?.hour ?? 3;

  const changeSettings = async (next: { enabled: boolean; hour: number }) => {
    if (!session) return;
    const saved = await saveJournalSettings(session, next);
    setJournal((prev) => ({
      enabled: saved.enabled,
      hour: saved.hour,
      model: saved.model,
      days: prev?.days ?? [],
    }));
  };

  const writeDate = async (dateStr?: string) => {
    if (!session || writing) return;
    setWriting(true);
    try {
      const result = await runJournal(session, dateStr);
      if (!result.written) toast.show(t("memory.journalNothing"));
      await loadJournal();
    } catch {
      toast.show(t("common.operationFailed"));
    } finally {
      setWriting(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android" || event?.type === "dismissed") {
      setShowDatePicker(false);
    }
    if (selectedDate && event?.type !== "dismissed") {
      const pad = (n: number) => String(n).padStart(2, "0");
      const dStr = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}`;
      void writeDate(dStr);
    }
  };
  const dreamLine = pages
    ? pages.dream.enabled
      ? t("memory.dreamOn")
      : t("memory.dreamOff")
    : null;
  const scheduleLine = pages ? formatSchedule(pages.dream.schedule, t) : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: th.colors.background }]}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          accessibilityLabel={t("common.back", "Back")}
          onPress={() => goBackOr(router, "/ecosystem")}
        />
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.title, { color: th.colors.foreground, fontFamily: th.font.display }]}
        >
          {t("memory.title")}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.bodyContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={th.colors.primary} />
        }
      >
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: th.colors.card, borderColor: th.colors.destructive, borderRadius: th.radius.md }]}>
          <Text style={{ color: th.colors.destructive, fontFamily: th.font.regular, fontSize: 15 }}>
            {t("common.operationFailed")}
          </Text>
        </View>
      ) : null}

      {dreamLine ? (
        <View style={styles.statusBlock}>
          <Text style={{ color: th.colors.foreground, fontFamily: th.font.regular, fontSize: 15, lineHeight: 22 }}>
            {scheduleLine ? `${dreamLine} · ${scheduleLine}` : dreamLine}
          </Text>
        </View>
      ) : null}

      {pages?.latest ? (
        <View
          style={[
            styles.latestCard,
            { backgroundColor: th.colors.card, borderColor: th.colors.border, borderRadius: th.radius.md },
          ]}
        >
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.medium, fontSize: 13, marginBottom: 6 }}>
            {t("memory.latest")}
          </Text>
          <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 15, marginBottom: 4 }}>
            {pages.latest.subject}
          </Text>
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, marginBottom: 8 }}>
            {pages.latest.time}
          </Text>
          <Text
            selectable
            style={{
              color: th.colors.foreground,
              fontFamily: th.font.mono,
              fontSize: 13,
              lineHeight: 19,
            }}
          >
            {pages.latest.diff}
          </Text>
          {pages.latest.truncated ? (
            <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, marginTop: 8 }}>
              {t("memory.truncated")}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Chips options={tabOptions} value={tab} onChange={setTab} />

        {tab === "journal" ? (
          <View style={styles.journalBlock}>
            <View style={styles.journalRow}>
              <Text style={{ color: th.colors.foreground, fontFamily: th.font.regular, fontSize: 16, flex: 1 }}>
                {t("memory.journalAuto")}
              </Text>
              <Switch
                accessibilityLabel={t("memory.journalAuto")}
                value={enabled}
                onValueChange={(value) => void changeSettings({ enabled: value, hour })}
              />
            </View>
            <View style={styles.journalRow}>
              <Text style={{ color: th.colors.foreground, fontFamily: th.font.regular, fontSize: 16, flex: 1 }}>
                {t("memory.journalHour")}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("memory.hourEarlier")}
                onPress={() => void changeSettings({ enabled, hour: hour === 0 ? 23 : hour - 1 })}
                style={styles.hourButton}
              >
                <Text style={{ color: th.colors.foreground, fontSize: 20 }}>−</Text>
              </Pressable>
              <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 16, minWidth: 48, textAlign: "center" }}>
                {`${hour}:00`}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("memory.hourLater")}
                onPress={() => void changeSettings({ enabled, hour: hour === 23 ? 0 : hour + 1 })}
                style={styles.hourButton}
              >
                <Text style={{ color: th.colors.foreground, fontSize: 20 }}>+</Text>
              </Pressable>
            </View>
            <View style={styles.writeButtonRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("memory.journalWrite")}
                disabled={writing}
                onPress={() => void writeDate()}
                style={[styles.writeButton, { backgroundColor: th.colors.primary, borderRadius: th.radius.md, flex: 1 }]}
              >
                {writing ? (
                  <ActivityIndicator color={th.colors.primaryForeground} />
                ) : (
                  <Text style={{ color: th.colors.primaryForeground, fontFamily: th.font.medium, fontSize: 15, textAlign: "center" }}>
                    {t("memory.journalWrite")}
                  </Text>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("memory.journalWriteOther")}
                disabled={writing}
                onPress={() => setShowDatePicker(true)}
                style={[styles.writeButton, { backgroundColor: th.colors.secondary, borderRadius: th.radius.md, flex: 1 }]}
              >
                <Text style={{ color: th.colors.secondaryForeground, fontFamily: th.font.medium, fontSize: 15, textAlign: "center" }}>
                  {t("memory.journalWriteOther")}
                </Text>
              </Pressable>
            </View>
            {showDatePicker ? (
              <DateTimePicker
                testID="journal-date-picker"
                value={new Date()}
                mode="date"
                display="default"
                maximumDate={new Date()}
                onChange={handleDateChange}
              />
            ) : null}
            {(journal?.days.length ?? 0) === 0 ? (
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 15 }}>
                {t("memory.journalEmpty")}
              </Text>
            ) : (
              journal?.days.map((day) => (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={day}
                  onPress={() => {
                    if (!session) return;
                    void fetchJournalDay(session, day).then((pageDay) => setDayText(pageDay.text));
                  }}
                  style={styles.dayButton}
                >
                  <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 16 }}>{day}</Text>
                </Pressable>
              ))
            )}
            {dayText ? <Markdown text={dayText} /> : null}
          </View>
        ) : null}

        {loading && !pages ? (
          <ActivityIndicator accessibilityLabel={t("common.loading")} color={th.colors.primary} />
        ) : null}
        {page ? (
          <>
            {page.text.trim() ? (
              <Text
                selectable
                style={{
                  color: th.colors.foreground,
                  fontFamily: th.font.regular,
                  fontSize: 15,
                  lineHeight: 22,
                }}
              >
                {page.text}
              </Text>
            ) : (
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 15 }}>
                {t("memory.empty")}
              </Text>
            )}
            {page.truncated ? (
              <Text
                style={{
                  color: th.colors.mutedForeground,
                  fontFamily: th.font.regular,
                  fontSize: 13,
                  marginTop: 12,
                }}
              >
                {t("memory.truncated")}
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    minHeight: 56,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    marginLeft: 4,
    flex: 1,
  },
  errorBox: {
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
  },
  statusBlock: {
    paddingBottom: 8,
  },
  latestCard: {
    marginBottom: 8,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  journalBlock: {
    gap: 8,
    marginTop: 8,
  },
  journalRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hourButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  writeButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  writeButtonRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  dayButton: {
    minHeight: 48,
    justifyContent: "center",
  },
});
