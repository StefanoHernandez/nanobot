import React from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useT } from "../../src/i18n";
import { ListItem, goBackOr } from "../../src/ui/components";
import { SettingsShell } from "../../src/screens/settings/SettingsShell";
import { useTheme } from "../../src/ui/ThemeProvider";

export default function EcosystemIndex() {
  const t = useT();
  const th = useTheme();

  return (
    <SettingsShell title={t("ecosystem.title")} onBack={() => goBackOr(router, "/")}>
      <View
        style={{
          backgroundColor: th.colors.card,
          borderRadius: th.radius.md,
          marginHorizontal: 16,
          overflow: "hidden",
        }}
      >
        <ListItem
          title={t("ecosystem.channels")}
          left={<MaterialCommunityIcons name="radio-tower" size={24} color={th.colors.foreground} />}
          onPress={() => router.push("/ecosystem/channels")}
        />
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }}>
          <ListItem
            title={t("ecosystem.apps")}
            left={<MaterialCommunityIcons name="puzzle-outline" size={24} color={th.colors.foreground} />}
            onPress={() => router.push("/ecosystem/apps")}
          />
        </View>
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }}>
          <ListItem
            title={t("ecosystem.skills")}
            left={<MaterialCommunityIcons name="lightning-bolt-outline" size={24} color={th.colors.foreground} />}
            onPress={() => router.push("/ecosystem/skills")}
          />
        </View>
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }}>
          <ListItem
            title={t("memory.title")}
            subtitle={t("memory.subtitle")}
            left={<MaterialCommunityIcons name="brain" size={24} color={th.colors.foreground} />}
            onPress={() => router.push("/ecosystem/memory")}
          />
        </View>
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }}>
          <ListItem
            title={t("ecosystem.automations")}
            left={<MaterialCommunityIcons name="robot-outline" size={24} color={th.colors.foreground} />}
            onPress={() => router.push("/ecosystem/automations")}
          />
        </View>
      </View>
    </SettingsShell>
  );
}
