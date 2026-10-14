import React, { useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useT } from "../../../i18n";
import { IconButton } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { toastEcosystemError } from "../../../ecosystem/common";
import { groupByDay, useAutomations } from "../../../ecosystem/automations";
import { AutomationRow } from "./AutomationRow";
import { AutomationJobSheet } from "./AutomationJobSheet";
import type { SessionAutomationJob } from "@/lib/types";

export function AutomationsScreen({ now }: { now?: number }) {
  const t = useT();
  const th = useTheme();
  const {
    jobs,
    loading,
    error,
    refresh,
    enable,
    disable,
    run,
    delete: deleteJob,
    update,
    changeChat,
    result: fetchResult,
  } = useAutomations();

  const [selectedJob, setSelectedJob] = useState<SessionAutomationJob | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const activeJob = selectedJob ? (jobs.find((j) => j.id === selectedJob.id) ?? selectedJob) : null;

  const grouped = groupByDay(jobs, now ?? Date.now());
  const sections = [
    { title: t("automations.today"), data: grouped.today },
    { title: t("automations.tomorrow"), data: grouped.tomorrow },
    { title: t("automations.later"), data: grouped.later },
  ].filter((s) => s.data.length > 0);

  const handleToggleJob = async (job: SessionAutomationJob, enabled: boolean) => {
    setTogglingId(job.id);
    try {
      if (enabled) {
        await enable(job.id);
      } else {
        await disable(job.id);
      }
    } catch (e) {
      toastEcosystemError(e, t);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: th.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: th.colors.border }]}>
        <IconButton
          icon="arrow-left"
          accessibilityLabel={t("common.back", "Back")}
          onPress={() => router.back()}
        />
        <Text style={[styles.title, { color: th.colors.foreground, fontFamily: th.font.medium }]}>
          {t("automations.title")}
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={[styles.errorText, { color: th.colors.destructive }]}>
            {t("common.operationFailed", "Operazione non riuscita")}
          </Text>
        </View>
      ) : null}

      {/* SectionList Calendar */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refresh()}
            tintColor={th.colors.primary}
          />
        }
        renderSectionHeader={({ section: { title } }) => (
          <View style={[styles.sectionHeader, { backgroundColor: th.colors.muted }]}>
            <Text
              style={[
                styles.sectionHeaderText,
                { color: th.colors.foreground, fontFamily: th.font.medium },
              ]}
            >
              {title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <AutomationRow
            job={item}
            onPress={(job) => setSelectedJob(job)}
            onToggle={handleToggleJob}
            toggling={togglingId === item.id}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={th.colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: th.colors.mutedForeground }]}>
                {t("automations.empty")}
              </Text>
            </View>
          )
        }
        contentContainerStyle={sections.length === 0 ? styles.emptyListContent : undefined}
      />

      {/* Detail & Action Sheet */}
      <AutomationJobSheet
        open={!!activeJob}
        job={activeJob}
        onClose={() => setSelectedJob(null)}
        onRun={run}
        onDelete={deleteJob}
        onUpdate={update}
        onChangeChat={changeChat}
        onFetchResult={fetchResult}
        onRefresh={refresh}
      />
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
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  title: {
    fontSize: 18,
  },
  errorBox: {
    padding: 12,
  },
  errorText: {
    fontSize: 14,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionHeaderText: {
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyContainer: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 15,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
});
