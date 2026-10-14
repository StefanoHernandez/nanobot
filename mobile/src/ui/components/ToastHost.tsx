import React, { useContext, useEffect, useState, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { useTheme } from "../ThemeProvider";

type Listener = (msg: string | null) => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | undefined;

let nextHostId = 0;
const activeHosts = new Set<number>();
let topHostId: number | null = null;
const hostSubscribers = new Set<() => void>();

function updateTopHost() {
  let max: number | null = null;
  for (const id of activeHosts) {
    if (max === null || id > max) max = id;
  }
  if (topHostId !== max) {
    topHostId = max;
    hostSubscribers.forEach((fn) => fn());
  }
}

function subscribeHost(cb: () => void) {
  hostSubscribers.add(cb);
  return () => void hostSubscribers.delete(cb);
}

function getTopHost() {
  return topHostId;
}

export const toast = {
  show(message: string) {
    listeners.forEach((l) => l(message));
    clearTimeout(timer);
    timer = setTimeout(() => listeners.forEach((l) => l(null)), 3000);
  },
};

export function ToastHost() {
  const th = useTheme();
  const insets = useContext(SafeAreaInsetsContext) ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const [msg, setMsg] = useState<string | null>(null);
  const [id] = useState(() => ++nextHostId);
  const currentTop = useSyncExternalStore(subscribeHost, getTopHost, () => null);

  useEffect(() => {
    activeHosts.add(id);
    updateTopHost();
    return () => {
      activeHosts.delete(id);
      updateTopHost();
    };
  }, [id]);

  useEffect(() => {
    listeners.add(setMsg);
    return () => {
      listeners.delete(setMsg);
      if (!listeners.size) clearTimeout(timer);
    };
  }, []);

  if (currentTop !== id) return null;
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
