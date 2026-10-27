import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useNavigation } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useT } from "../../../i18n";
import { IconButton, SegmentedTabs, goBackOr } from "../../../ui/components";
import { Halo } from "../../../ui/Halo";
import { useTheme } from "../../../ui/ThemeProvider";
import { useSettings } from "../../../settings/store";
import { installGate } from "../../../ecosystem/common";
import { usePrivileged } from "../../../ecosystem/privilege";
import { CliAppsTab } from "./CliAppsTab";
import { McpTab } from "./McpTab";
import { PluginsTab } from "./PluginsTab";

export type AppsTab = "cli" | "mcp" | "plugin";

export function AppsScreen() {
  const t = useT();
  const th = useTheme();
  const nav = useNavigation?.();
  const { data: settings, refresh: refreshSettings } = useSettings();
  const [tab, setTab] = useState<AppsTab>("cli");

  useEffect(() => {
    if (!settings) void refreshSettings();
  }, [refreshSettings, settings]);

  useEffect(() => {
    const unsub = nav?.addListener?.("focus", () => {
      void refreshSettings();
    });
    return () => unsub?.();
  }, [nav, refreshSettings]);

  const privileged = usePrivileged();
  const gateAllowed = installGate(settings, privileged).allowed;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: th.colors.background }]}>
      <Halo />
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          accessibilityLabel={t("common.back", "Back")}
          onPress={() => goBackOr(router, "/ecosystem")}
        />
        <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: th.colors.foreground, fontFamily: th.font.display }]}>
          {t("apps.title")}
        </Text>
      </View>

      {!gateAllowed ? (
        <View style={[styles.gateBanner, { backgroundColor: th.colors.muted, borderRadius: th.radius.md }]}>
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, lineHeight: 18 }}>
            {t("apps.gateBanner")}
          </Text>
        </View>
      ) : null}

      <SegmentedTabs
        tabs={[
          { value: "cli", label: t("apps.tabs.cli", "CLI") },
          { value: "mcp", label: t("apps.tabs.mcp", "MCP") },
          { value: "plugin", label: t("apps.tabs.plugin", "Plugin") },
        ]}
        value={tab}
        onChange={setTab}
      />

      <View style={styles.tabContent}>
        {tab === "cli" ? (
          <CliAppsTab gateAllowed={gateAllowed} />
        ) : tab === "mcp" ? (
          <McpTab />
        ) : (
          <PluginsTab gateAllowed={gateAllowed} />
        )}
      </View>
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
  gateBanner: {
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tabContent: {
    flex: 1,
  },
});
