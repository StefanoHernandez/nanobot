import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../ThemeProvider";

type Listener = (msg: string | null) => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | undefined;

export const toast = {
  show(message: string) {
    listeners.forEach((l) => l(message));
    clearTimeout(timer);
    timer = setTimeout(() => listeners.forEach((l) => l(null)), 3000);
  },
};

export function ToastHost() {
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    listeners.add(setMsg);
    return () => {
      listeners.delete(setMsg);
      if (!listeners.size) clearTimeout(timer);
    };
  }, []);
  if (!msg) return null;
  return (
    <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + 24 }]}>
      <View style={{ backgroundColor: th.colors.foreground, borderRadius: th.radius.md, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text accessibilityLiveRegion="polite" style={{ color: th.colors.background, fontSize: 14 }}>{msg}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 16, right: 16, alignItems: "center" },
});
