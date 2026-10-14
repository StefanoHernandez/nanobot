import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useNavigation } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useT } from "../../../i18n";
import { Button, IconButton } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { useSettings } from "../../../settings/store";
import { installGate } from "../../../ecosystem/common";
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
    const unsub = nav?.addListener?.("focus", () => {
      void refreshSettings();
    });
    return () => unsub?.();
  }, [nav, refreshSettings, settings]);

  const gateAllowed = installGate(settings).allowed;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: th.colors.background }]}>
      <View style={[styles.header, { borderBottomColor: th.colors.border }]}>
        <IconButton
          icon="arrow-left"
          accessibilityLabel={t("common.back", "Back")}
          onPress={() => router.back()}
        />
        <Text style={[styles.title, { color: th.colors.foreground, fontFamily: th.font.medium }]}>
          {t("apps.title")}
        </Text>
      </View>

      {!gateAllowed ? (
        <View style={[styles.gateBanner, { backgroundColor: th.colors.accent }]}>
          <Text style={[styles.gateBannerText, { color: th.colors.accentForeground }]}>
            {t("apps.gateBanner")}
          </Text>
        </View>
      ) : null}

      <View style={[styles.tabBar, { borderBottomColor: th.colors.border }]}>
        <View style={styles.tabButtonsRow}>
          <Button
            title={t("apps.tabs.cli", "CLI")}
            variant={tab === "cli" ? "primary" : "ghost"}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === "cli" }}
            onPress={() => setTab("cli")}
          />
          <Button
            title={t("apps.tabs.mcp", "MCP")}
            variant={tab === "mcp" ? "primary" : "ghost"}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === "mcp" }}
            onPress={() => setTab("mcp")}
          />
          <Button
            title={t("apps.tabs.plugin", "Plugin")}
            variant={tab === "plugin" ? "primary" : "ghost"}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === "plugin" }}
            onPress={() => setTab("plugin")}
          />
        </View>
      </View>

      <View style={styles.tabContent}>
        {tab === "cli" ? (
          <CliAppsTab gateAllowed={gateAllowed} />
        ) : tab === "mcp" ? (
          <McpTab gateAllowed={gateAllowed} />
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
    borderBottomWidth: 1,
    minHeight: 56,
  },
  title: {
    fontSize: 18,
    marginLeft: 4,
  },
  gateBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  gateBannerText: {
    fontSize: 14,
    lineHeight: 20,
  },
  tabBar: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tabButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  tabContent: {
    flex: 1,
  },
});
