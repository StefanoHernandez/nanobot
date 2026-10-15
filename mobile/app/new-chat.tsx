import React, { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { sessionStore } from "../src/state/sessionStore";
import { profiles } from "../src/core/profiles";
import { handleNewChatIntent } from "../src/extras/widget";
import { useT } from "../src/i18n";
import { useTheme } from "../src/ui/ThemeProvider";
import { toast } from "../src/ui/components";

export default function NewChatScreen() {
  const t = useT();
  const th = useTheme();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;

    if (!profiles.activeId()) {
      handledRef.current = true;
      router.replace("/connect");
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const handleState = (currentState: string) => {
      if (handledRef.current) return;

      if (currentState === "open") {
        handledRef.current = true;
        cleanup();
        void handleNewChatIntent();
      } else if (currentState === "offline" || currentState === "auth_error") {
        handledRef.current = true;
        cleanup();
        router.replace("/");
        toast.show(t("widget.offline"));
      }
    };

    const initial = sessionStore.getState().state;
    if (initial === "open" || initial === "offline" || initial === "auth_error") {
      handleState(initial);
      return;
    }

    // connecting or reconnecting: wait for open, subscribing to sessionStore, up to 15 s
    timer = setTimeout(() => {
      if (!handledRef.current) {
        handledRef.current = true;
        router.replace("/");
        toast.show(t("widget.offline"));
      }
    }, 15000);

    const unsubscribe = sessionStore.subscribe((s) => {
      handleState(s.state);
    });

    return () => {
      cleanup();
      unsubscribe();
    };
  }, [t]);

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
