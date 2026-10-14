import { withAlpha } from "../theme";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../ThemeProvider";
import { ToastHost } from "./ToastHost";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
};

export function Sheet({ open, onClose, title, children }: SheetProps) {
  const th = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="close" style={[styles.backdrop, { backgroundColor: withAlpha(th.colors.overlay, 0.45) }]} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: th.colors.popover,
            borderTopLeftRadius: th.radius.lg,
            borderTopRightRadius: th.radius.lg,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: th.colors.border, marginTop: -6, marginBottom: 12 }} />
        {title ? <Text accessibilityRole="header" style={{ color: th.colors.popoverForeground, fontFamily: th.font.display, fontSize: 20, marginBottom: 12 }}>{title}</Text> : null}
        {children}
      </View>
      {open ? <ToastHost /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: { padding: 20 },
});
