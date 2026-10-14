import React, { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../src/state/sessionStore";
import { profiles } from "../src/core/profiles";
import { handleNewChatIntent } from "../src/extras/widget";
import { useT } from "../src/i18n";
import { useTheme } from "../src/ui/ThemeProvider";

export default function NewChatScreen() {
  const t = useT();
  const th = useTheme();
  const { state } = useSession();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;

    if (!profiles.activeId()) {
      handledRef.current = true;
      router.replace("/connect");
      return;
    }

    if (state === "open") {
      handledRef.current = true;
      void handleNewChatIntent();
    } else if (state === "offline" || state === "auth_error") {
      handledRef.current = true;
      router.replace("/");
    }
  }, [state]);

  return (
    <View style={[styles.container, { backgroundColor: th.colors.background }]}>
      <ActivityIndicator size="large" color={th.colors.primary} />
      <Text style={[styles.text, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
        {t("widget.openingNewChat")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  text: {
    fontSize: 16,
  },
});
