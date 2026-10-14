import React, { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useT } from "../../../i18n";
import { useRestart } from "../../../settings/store";
import { useChannels } from "../../../ecosystem/channels";
import { Button, IconButton } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { ChannelRow } from "./ChannelRow";
import { ChannelSheet } from "./ChannelSheet";
import { PairingSection } from "./PairingSection";
import type { NanobotFeatureInfo } from "@/lib/types";

export function ChannelsScreen() {
  const t = useT();
  const th = useTheme();
  const { channels, requiresRestart, loading, refresh } = useChannels();
  const { run, state: restartState } = useRestart();

  const [selectedChannel, setSelectedChannel] = useState<NanobotFeatureInfo | null>(null);

  const isRestarting = restartState === "restarting";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: th.colors.background }]}>
      <View style={[styles.header, { borderBottomColor: th.colors.border }]}>
        <IconButton icon="arrow-left" accessibilityLabel={t("common.back", "Back")} onPress={() => router.back()} />
        <Text style={[styles.title, { color: th.colors.foreground, fontFamily: th.font.medium }]}>
          {t("channels.title")}
        </Text>
      </View>

      {requiresRestart ? (
        <View style={[styles.restartBanner, { backgroundColor: th.colors.accent }]}>
          <Text style={[styles.restartText, { color: th.colors.accentForeground }]}>
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
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
      >
        <View style={[styles.list, { borderColor: th.colors.border }]}>
          {channels.map((ch) => (
            <ChannelRow
              key={ch.name}
              channel={ch}
              onPress={() => setSelectedChannel(ch)}
              onRefresh={() => void refresh()}
            />
          ))}
        </View>

        <PairingSection />
      </ScrollView>

      <ChannelSheet
        open={!!selectedChannel}
        channel={selectedChannel}
        onClose={() => setSelectedChannel(null)}
        onSaved={() => void refresh()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    minHeight: 56,
  },
  title: { fontSize: 18, marginLeft: 4 },
  restartBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  restartText: { fontSize: 14, flex: 1 },
  scrollContent: { paddingBottom: 32 },
  list: { borderTopWidth: 1 },
});
