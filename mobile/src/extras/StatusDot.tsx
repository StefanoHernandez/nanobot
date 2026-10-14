import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useT } from "../i18n";
import { useSession } from "../state/sessionStore";
import { useTheme } from "../ui/ThemeProvider";
import { StatusPanel } from "./StatusPanel";

export const STATUS_COLORS = {
  open: "#22c55e",
  connecting: "#eab308",
  reconnecting: "#eab308",
} as const;

export function StatusDot() {
  const t = useT();
  const th = useTheme();
  const { state } = useSession();
  const [panelOpen, setPanelOpen] = useState(false);

  let dotColor: string;
  if (state === "open") {
    dotColor = STATUS_COLORS.open;
  } else if (state === "connecting" || state === "reconnecting") {
    dotColor = STATUS_COLORS.connecting;
  } else if (state === "auth_error" || state === "offline") {
    dotColor = th.colors.destructive;
  } else {
    dotColor = th.colors.mutedForeground;
  }

  const label = t(`extras.status.${state}`, { defaultValue: state });

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setPanelOpen(true)}
        hitSlop={8}
        style={styles.pressable}
      >
        <View
          testID="status-dot"
          style={[styles.dot, { backgroundColor: dotColor }]}
        />
      </Pressable>
      {panelOpen ? <StatusPanel open={panelOpen} onClose={() => setPanelOpen(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
