import React, { useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useT } from "../../../i18n";
import { useMemory } from "../../../ecosystem/memory";
import { Chips } from "../../settings/common";
import { IconButton, goBackOr } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";

type MemoryTab = "user" | "memory" | "soul";

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
  const { pages, loading, error, refresh } = useMemory();
  const [tab, setTab] = useState<MemoryTab>("user");

  const tabOptions = useMemo(
    () =>
      [
        { value: "user" as const, label: t("memory.profile") },
        { value: "memory" as const, label: t("memory.notes") },
        { value: "soul" as const, label: t("memory.voice") },
      ] satisfies { value: MemoryTab; label: string }[],
    [t],
  );

  const page = pages?.pages[tab];
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
});
