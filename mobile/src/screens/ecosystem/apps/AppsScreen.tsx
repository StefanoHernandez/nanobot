import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useNavigation } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useT } from "../../../i18n";
import { IconButton, goBackOr } from "../../../ui/components";
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
  }, [refreshSettings, settings]);

  useEffect(() => {
    const unsub = nav?.addListener?.("focus", () => {
      void refreshSettings();
    });
    return () => unsub?.();
  }, [nav, refreshSettings]);

  const gateAllowed = installGate(settings).allowed;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: th.colors.background }]}>
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

      <View style={[styles.tabBar, { backgroundColor: th.colors.muted, borderRadius: 999 }]}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === "cli" }}
          onPress={() => setTab("cli")}
          style={[
            styles.tabSegment,
            {
              backgroundColor: tab === "cli" ? th.colors.card : "transparent",
            },
          ]}
        >
          <Text
            style={{
              color: tab === "cli" ? th.colors.foreground : th.colors.mutedForeground,
              fontFamily: tab === "cli" ? th.font.medium : th.font.regular,
              fontSize: 15,
            }}
          >
            {t("apps.tabs.cli", "CLI")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === "mcp" }}
          onPress={() => setTab("mcp")}
          style={[
            styles.tabSegment,
            {
              backgroundColor: tab === "mcp" ? th.colors.card : "transparent",
            },
          ]}
        >
          <Text
            style={{
              color: tab === "mcp" ? th.colors.foreground : th.colors.mutedForeground,
              fontFamily: tab === "mcp" ? th.font.medium : th.font.regular,
              fontSize: 15,
            }}
          >
            {t("apps.tabs.mcp", "MCP")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === "plugin" }}
          onPress={() => setTab("plugin")}
          style={[
            styles.tabSegment,
            {
              backgroundColor: tab === "plugin" ? th.colors.card : "transparent",
            },
          ]}
        >
          <Text
            style={{
              color: tab === "plugin" ? th.colors.foreground : th.colors.mutedForeground,
              fontFamily: tab === "plugin" ? th.font.medium : th.font.regular,
              fontSize: 15,
            }}
          >
            {t("apps.tabs.plugin", "Plugin")}
          </Text>
        </Pressable>
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
  tabBar: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 4,
    flexDirection: "row",
    gap: 4,
  },
  tabSegment: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  tabContent: {
    flex: 1,
  },
});
