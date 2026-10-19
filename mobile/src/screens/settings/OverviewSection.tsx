import React, { useEffect, useState, useCallback } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import type { SettingsPayload } from "@/lib/types";
import { useT } from "../../i18n";
import { useSettings } from "../../settings/store";
import { useSession } from "../../state/sessionStore";
import { Button, ListItem } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import type { Theme } from "../../ui/theme";
import { Head } from "./common";
import { fetchSystem, formatDuration, temperatureColor, type SystemSnapshot } from "../../extras/system";
import { fetchCosts, formatCost, type CostsPayload } from "../../extras/costs";
import { fetchJournal, type JournalIndex } from "../../ecosystem/journal";
import { fetchKanban, type KanbanSnapshot } from "../../ecosystem/kanban";
import { TASK_MODEL_PATHS } from "./TaskModels";
import type { MemoryPages } from "../../ecosystem/memory";

type Usage = NonNullable<SettingsPayload["usage"]>;
type DayUsage = Usage["days"][number];

function StatBar({
  label,
  valueText,
  percent,
  color,
  theme,
}: {
  label: string;
  valueText: string;
  percent: number;
  color?: string;
  theme: Theme;
}) {
  return (
    <View style={{ gap: 3 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.font.regular, fontSize: 12 }}>
          {label}
        </Text>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.font.mono, fontSize: 12 }}>
          {valueText}
        </Text>
      </View>
      <View style={{ height: 6, backgroundColor: theme.colors.muted, borderRadius: 3, overflow: "hidden" }}>
        <View
          style={{
            width: `${Math.min(100, Math.max(0, percent))}%`,
            height: "100%",
            backgroundColor: color ?? theme.colors.primary,
            borderRadius: 3,
          }}
        />
      </View>
    </View>
  );
}

function formatLastRun(timeStr: string | null | undefined): string {
  if (!timeStr) return "—";
  try {
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
    }
  } catch {}
  return timeStr;
}

export function OverviewSection() {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();
  const { data, refresh: refreshSettings } = useSettings();

  const [systemData, setSystemData] = useState<SystemSnapshot | null>(null);
  const [systemError, setSystemError] = useState(false);

  const [costsData, setCostsData] = useState<CostsPayload | null>(null);
  const [costsError, setCostsError] = useState(false);

  const [usageData, setUsageData] = useState<Usage | null>(null);
  const [usageError, setUsageError] = useState(false);

  const [memoryPages, setMemoryPages] = useState<MemoryPages | null>(null);
  const [memoryError, setMemoryError] = useState(false);

  const [journalData, setJournalData] = useState<JournalIndex | null>(null);
  const [journalError, setJournalError] = useState(false);

  const [kanbanData, setKanbanData] = useState<KanbanSnapshot | null>(null);
  const [kanbanError, setKanbanError] = useState(false);

  const [selectedDay, setSelectedDay] = useState<DayUsage | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadSystem = useCallback(async () => {
    if (!session) return;
    try {
      const s = await fetchSystem(session);
      setSystemData(s);
      setSystemError(false);
    } catch {
      setSystemError(true);
    }
  }, [session]);

  const loadCosts = useCallback(async () => {
    if (!session) return;
    try {
      const c = await fetchCosts(session, 30);
      setCostsData(c);
      setCostsError(false);
    } catch {
      setCostsError(true);
    }
  }, [session]);

  const loadUsage = useCallback(async () => {
    if (!session) return;
    try {
      const u = await session.get<Usage>("/api/settings/usage");
      setUsageData(u);
      setUsageError(false);
    } catch {
      setUsageError(true);
    }
  }, [session]);

  const loadMemory = useCallback(async () => {
    if (!session) return;
    try {
      const m = await session.get<MemoryPages>("/api/ext/memory/pages");
      setMemoryPages(m);
      setMemoryError(false);
    } catch {
      setMemoryError(true);
    }
  }, [session]);

  const loadJournal = useCallback(async () => {
    if (!session) return;
    try {
      const j = await fetchJournal(session);
      setJournalData(j);
      setJournalError(false);
    } catch {
      setJournalError(true);
    }
  }, [session]);

  const loadKanban = useCallback(async () => {
    if (!session) return;
    try {
      const k = await fetchKanban(session, "main");
      setKanbanData(k);
      setKanbanError(false);
    } catch {
      setKanbanError(true);
    }
  }, [session]);

  const handleRefreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      refreshSettings(),
      loadSystem(),
      loadCosts(),
      loadUsage(),
      loadMemory(),
      loadJournal(),
      loadKanban(),
    ]);
    setRefreshing(false);
  }, [refreshSettings, loadSystem, loadCosts, loadUsage, loadMemory, loadJournal, loadKanban]);

  useEffect(() => {
    if (!session) return;
    void loadSystem();
    void loadCosts();
    void loadUsage();
    void loadMemory();
    void loadJournal();
    void loadKanban();
  }, [session, loadSystem, loadCosts, loadUsage, loadMemory, loadJournal, loadKanban]);

  // Derived calculations
  // 1. Stato
  const isOnline = !!session && !systemError;
  const versionStr = data?.version?.current ?? "0.1.0";
  const uptimeSec = systemData?.uptime_s ?? systemData?.gateway_uptime_s;
  const uptimeText = uptimeSec != null ? formatDuration(uptimeSec, t) : "—";
  const cpuPercent = systemData?.cpu_percent ?? 0;
  const ramUsedMb = systemData?.memory?.used_mb ?? 0;
  const ramTotalMb = systemData?.memory?.total_mb ?? 1;
  const ramPercent = systemData?.memory ? (ramUsedMb / ramTotalMb) * 100 : 0;
  const ramText = systemData?.memory
    ? `${(ramUsedMb / 1024).toFixed(1)} / ${(ramTotalMb / 1024).toFixed(1)} GB`
    : "—";
  const diskUsedGb = systemData?.disk?.used_gb ?? 0;
  const diskTotalGb = systemData?.disk?.total_gb ?? 1;
  const diskPercent = systemData?.disk ? (diskUsedGb / diskTotalGb) * 100 : 0;
  const diskText = systemData?.disk ? `${diskUsedGb} / ${diskTotalGb} GB` : "—";
  const tempC = systemData?.temperature_c;
  const tempText = tempC != null ? `${Math.round(tempC)}°C` : "—";
  const tempColor = temperatureColor(tempC, th);
  const tempPercent = tempC != null ? Math.min(100, Math.max(0, (tempC / 85) * 100)) : 0;

  // 2. Spesa
  const todayCost = formatCost(costsData?.today_cost_usd ?? 0);
  const monthCost = formatCost(costsData?.total_cost_usd ?? 0);
  const dailyCap = costsData?.daily_cap_usd != null ? formatCost(costsData.daily_cap_usd) : null;

  // 3. Uso
  const days = usageData?.days ?? [];
  const peak = usageData?.peak_day_tokens ?? (days.length ? Math.max(0, ...days.map((d) => d.total_tokens)) : 0);
  const total = usageData?.total_tokens_30d ?? usageData?.total_tokens ?? 0;
  const dailyAvg = Math.round(total / Math.max(1, days.length));

  // 4. Modello
  const a = data?.agent;
  const config = (data?.runtime_config ?? {}) as Record<string, unknown>;
  const subagentVal = config[TASK_MODEL_PATHS.subagent];
  const subagentModel = typeof subagentVal === "string" && subagentVal && subagentVal !== "default"
    ? subagentVal
    : t("models.tasks.sameAsChat");
  const dreamVal = config[TASK_MODEL_PATHS.dream];
  const dreamModel = typeof dreamVal === "string" && dreamVal && dreamVal !== "default"
    ? dreamVal
    : t("models.tasks.sameAsChat");
  const journalModel = journalData?.model && journalData.model !== "default"
    ? journalData.model
    : t("models.tasks.sameAsChat");

  // 5. Memoria
  const on = (v?: boolean) => t(v ? "settings.on" : "settings.off");
  const dreamLastRun = memoryPages?.latest?.time ? formatLastRun(memoryPages.latest.time) : t("settings.overview.never");
  const journalLastDay = journalData?.days?.[0] ?? t("settings.overview.none");

  // 6. Lavagna
  const tasks = kanbanData?.tasks ?? [];
  const kanbanRunning = tasks.filter((tk) => tk.status === "running").length;
  const kanbanReview = tasks.filter((tk) => tk.status === "review").length;
  const kanbanBlocked = tasks.filter((tk) => tk.status === "blocked").length;

  return (
    <ScrollView
      testID="overview-scroll"
      nestedScrollEnabled
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void handleRefreshAll()}
          tintColor={th.colors.primary}
        />
      }
    >
      {/* 1. Stato Card */}
      <Head>{t("settings.overview.status")}</Head>
      <View style={{ ...th.surface, marginHorizontal: 16, padding: 16, gap: 12 }}>
        {systemError ? (
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 14 }}>
            {t("settings.overview.unavailable")}
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: isOnline ? th.colors.brand : th.colors.destructive,
                  }}
                />
                <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 15 }}>
                  {isOnline ? t("settings.overview.online") : t("settings.overview.offline")}
                </Text>
              </View>
              <TouchableOpacity onPress={() => router.push("/settings/server" as never)}>
                <Text style={{ color: th.colors.primary, fontFamily: th.font.medium, fontSize: 13 }}>
                  {t("settings.overview.details")}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
                {t("settings.overview.uptime", { t: uptimeText })}
              </Text>
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
                {t("settings.overview.version", { v: versionStr })}
              </Text>
            </View>

            <View style={{ gap: 8, marginTop: 4 }}>
              <StatBar label="CPU" valueText={`${Math.round(cpuPercent)}%`} percent={cpuPercent} theme={th} />
              <StatBar label="RAM" valueText={ramText} percent={ramPercent} theme={th} />
              <StatBar label="Disco" valueText={diskText} percent={diskPercent} theme={th} />
              <StatBar label="Temp" valueText={tempText} percent={tempPercent} color={tempColor} theme={th} />
            </View>
          </>
        )}
      </View>

      {/* 2. Spesa Card */}
      <Head>{t("settings.overview.costs")}</Head>
      <View style={{ ...th.surface, marginHorizontal: 16, padding: 16, gap: 10 }}>
        {costsError ? (
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 14 }}>
            {t("settings.overview.unavailable")}
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 15 }}>
                {t("settings.overview.todayCost", { c: todayCost })}
              </Text>
              <TouchableOpacity onPress={() => router.push("/settings/costs" as never)}>
                <Text style={{ color: th.colors.primary, fontFamily: th.font.medium, fontSize: 13 }}>
                  {t("settings.overview.details")}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
              {t("settings.overview.monthCost", { c: monthCost })}
            </Text>
            {dailyCap ? (
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
                {t("settings.overview.dailyCap", { c: dailyCap })}
              </Text>
            ) : null}
          </>
        )}
      </View>

      {/* 3. Uso Card (30-day token bar chart) */}
      <Head>{t("settings.usage30")}</Head>
      <View style={{ ...th.surface, marginHorizontal: 16, padding: 16, gap: 10 }}>
        {usageError ? (
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 14 }}>
            {t("settings.overview.unavailable")}
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 12 }}>
                {t("settings.usagePeak", { n: peak.toLocaleString() })}
              </Text>
              {selectedDay ? (
                <Text style={{ color: th.colors.primary, fontFamily: th.font.medium, fontSize: 12 }}>
                  {t("settings.overview.selectedDay", {
                    date: selectedDay.date,
                    n: selectedDay.total_tokens.toLocaleString(),
                  })}
                </Text>
              ) : null}
            </View>

            <View testID="usage-bars" style={{ flexDirection: "row", alignItems: "flex-end", height: 72, gap: 2 }}>
              {days.map((d, idx) => {
                const isToday = idx === days.length - 1;
                const isSelected = selectedDay?.date === d.date;
                const heightPct = Math.max(2, peak ? (d.total_tokens / peak) * 100 : 0);
                return (
                  <TouchableOpacity
                    key={d.date}
                    accessibilityRole="button"
                    accessibilityLabel={`${d.date}: ${d.total_tokens}`}
                    onPress={() => setSelectedDay(isSelected ? null : d)}
                    style={{
                      flex: 1,
                      height: `${heightPct}%`,
                      backgroundColor: isSelected
                        ? th.colors.foreground
                        : isToday
                        ? th.colors.brand
                        : th.colors.primary,
                      borderRadius: 2,
                    }}
                  />
                );
              })}
            </View>

            <View style={{ gap: 2 }}>
              <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 15 }}>
                {t("settings.usageTotal", { n: total.toLocaleString() })}
              </Text>
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
                {t("settings.overview.dailyAverage", { n: dailyAvg.toLocaleString() })}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* 4. Modello Card */}
      <Head>{t("settings.overview.model")}</Head>
      <View style={{ ...th.surface, marginHorizontal: 16, overflow: "hidden" }}>
        {!data && !session ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 14 }}>
              {t("settings.overview.unavailable")}
            </Text>
          </View>
        ) : (
          <>
            <ListItem
              title={a?.model ?? "-"}
              subtitle={[a?.resolved_provider ?? a?.provider, a?.model_preset].filter(Boolean).join(" · ")}
              onPress={() => router.push("/settings/models" as never)}
            />
            <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border, padding: 16, gap: 6 }}>
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
                {t("settings.overview.subagent")}: {subagentModel}
              </Text>
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
                {t("settings.overview.dream")}: {dreamModel}
              </Text>
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
                {t("settings.overview.journal")}: {journalModel}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* 5. Memoria Card */}
      <Head>{t("settings.overview.memory")}</Head>
      <View style={{ ...th.surface, marginHorizontal: 16, padding: 16, gap: 8 }}>
        {memoryError && journalError ? (
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 14 }}>
            {t("settings.overview.unavailable")}
          </Text>
        ) : (
          <TouchableOpacity onPress={() => router.push("/ecosystem/memory" as never)} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 14 }}>
                {t("settings.overview.dream")}: {memoryError ? t("settings.overview.unavailable") : on(memoryPages?.dream?.enabled)}
              </Text>
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
                {memoryError ? "" : t("settings.overview.dreamLastRun", { t: dreamLastRun })}
              </Text>
            </View>
            <View
              style={{
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: th.colors.border,
                paddingTop: 8,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 14 }}>
                {t("settings.overview.journal")}:{" "}
                {journalError
                  ? t("settings.overview.unavailable")
                  : `${on(journalData?.enabled)} (${t("settings.overview.journalHour", { h: journalData?.hour ?? 3 })})`}
              </Text>
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13 }}>
                {journalError ? "" : t("settings.overview.journalLastDay", { d: journalLastDay })}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* 6. Lavagna Card */}
      <Head>{t("settings.overview.kanban")}</Head>
      <View style={{ ...th.surface, marginHorizontal: 16, padding: 16 }}>
        {kanbanError ? (
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 14 }}>
            {t("settings.overview.unavailable")}
          </Text>
        ) : (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("settings.overview.kanban")}
            onPress={() => router.push("/ecosystem/kanban" as never)}
            style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}
          >
            <View style={{ alignItems: "center", gap: 2 }}>
              <Text style={{ color: th.colors.brand, fontFamily: th.font.displayBold, fontSize: 18 }}>
                {kanbanRunning}
              </Text>
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 12 }}>
                {t("settings.overview.kanbanRunning", { n: kanbanRunning })}
              </Text>
            </View>
            <View style={{ width: StyleSheet.hairlineWidth, height: 24, backgroundColor: th.colors.border }} />
            <View style={{ alignItems: "center", gap: 2 }}>
              <Text style={{ color: th.colors.primary, fontFamily: th.font.displayBold, fontSize: 18 }}>
                {kanbanReview}
              </Text>
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 12 }}>
                {t("settings.overview.kanbanReview", { n: kanbanReview })}
              </Text>
            </View>
            <View style={{ width: StyleSheet.hairlineWidth, height: 24, backgroundColor: th.colors.border }} />
            <View style={{ alignItems: "center", gap: 2 }}>
              <Text style={{ color: th.colors.destructive, fontFamily: th.font.displayBold, fontSize: 18 }}>
                {kanbanBlocked}
              </Text>
              <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 12 }}>
                {t("settings.overview.kanbanBlocked", { n: kanbanBlocked })}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* 7. Capacità Card */}
      <Head>{t("settings.sections.features")}</Head>
      <View style={{ ...th.surface, marginHorizontal: 16, padding: 16 }}>
        {data ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button
              title={t("settings.web")}
              variant={data.web?.enable ? "primary" : "secondary"}
              onPress={() => router.push("/settings/features" as never)}
            />
            <Button
              title={t("settings.image")}
              variant={data.image_generation?.enabled ? "primary" : "secondary"}
              onPress={() => router.push("/settings/features" as never)}
            />
            <Button
              title={t("settings.voice")}
              variant={data.transcription?.enabled ? "primary" : "secondary"}
              onPress={() => router.push("/settings/features" as never)}
            />
          </View>
        ) : (
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 14 }}>
            {t("settings.overview.unavailable")}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
