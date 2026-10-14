import React, { useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useNavigation } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useT } from "../../../i18n";
import { useRestart, useSettings } from "../../../settings/store";
import { useChannels, usePairing } from "../../../ecosystem/channels";
import { Button, IconButton, goBackOr } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { installGate } from "../../../ecosystem/common";
import { ChannelRow } from "./ChannelRow";
import { ChannelSheet } from "./ChannelSheet";
import { PairingSection } from "./PairingSection";
import type { NanobotFeatureInfo } from "@/lib/types";

export function ChannelsScreen() {
  const t = useT();
  const th = useTheme();
  const nav = useNavigation?.();
  const { channels, requiresRestart, loading, refresh, apply } = useChannels();
  const pairing = usePairing();
  const { run, state: restartState } = useRestart();
  const { data: settings, refresh: refreshSettings } = useSettings();

  const [selectedChannel, setSelectedChannel] = useState<NanobotFeatureInfo | null>(null);

  const isRestarting = restartState === "restarting";
  const gateAllowed = installGate(settings).allowed;

  useEffect(() => {
    const unsub = nav?.addListener?.("focus", () => {
      void refresh();
      void pairing.refresh();
      void refreshSettings();
    });
    return () => unsub?.();
  }, [nav, refresh, pairing, refreshSettings]);

  useEffect(() => {
    if (restartState === "done") {
      void refresh();
    }
  }, [restartState, refresh]);

  const handleRefresh = async () => {
    await Promise.all([refresh(), pairing.refresh(), refreshSettings()]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: th.colors.background }]}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" accessibilityLabel={t("common.back", "Back")} onPress={() => goBackOr(router, "/ecosystem")} />
        <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: th.colors.foreground, fontFamily: th.font.display }]}>
          {t("channels.title")}
        </Text>
      </View>

      {!gateAllowed ? (
        <View style={[styles.gateBanner, { backgroundColor: th.colors.muted, borderRadius: th.radius.md }]}>
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, lineHeight: 18 }}>
            {t("apps.gateBanner")}
          </Text>
        </View>
      ) : null}

      {requiresRestart ? (
        <View style={[styles.restartBanner, { backgroundColor: th.colors.brandSoft, borderRadius: th.radius.md }]}>
          <Text style={{ color: th.colors.brandSoftForeground, fontFamily: th.font.medium, fontSize: 15, flex: 1 }}>
            {t("channels.restartRequired")}
          </Text>
          <Button
            title={t("channels.restart")}
            variant="secondary"
            loading={isRestarting}
            onPress={() => void run()}
          />
        </View>
      ) : null}

      <ScrollView
        testID="channels-scroll"
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void handleRefresh()} />}
      >
        <View style={[styles.card, { backgroundColor: th.colors.card, borderRadius: th.radius.md }]}>
          {channels.map((ch, idx) => (
            <View
              key={ch.name}
              style={idx > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border } : undefined}
            >
              <ChannelRow
                channel={ch}
                onPress={() => setSelectedChannel(ch)}
                onRefresh={() => void refresh()}
              />
            </View>
          ))}
        </View>

        <PairingSection pairing={pairing} />
      </ScrollView>

      <ChannelSheet
        open={!!selectedChannel}
        channel={selectedChannel}
        onClose={() => setSelectedChannel(null)}
        onSaved={() => void refresh()}
        onFeatures={apply}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    minHeight: 56,
  },
  title: { fontSize: 22, lineHeight: 28, marginLeft: 4, flex: 1 },
  restartBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 14,
    gap: 8,
  },
  gateBanner: {
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  scrollContent: { paddingBottom: 32 },
  card: {
    marginHorizontal: 16,
    overflow: "hidden",
  },
});
