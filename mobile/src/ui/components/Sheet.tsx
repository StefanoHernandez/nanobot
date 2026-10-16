import { withAlpha } from "../theme";
import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../ThemeProvider";
import { ToastHost } from "./ToastHost";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  /** Set false when the sheet already scrolls its own content. */
  scroll?: boolean;
};

export function Sheet({ open, onClose, title, children, scroll = true }: SheetProps) {
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const maxHeight = Math.max(240, height * 0.9 - insets.top);
  const body = scroll ? (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 4 }}>
      {children}
    </ScrollView>
  ) : (
    children
  );
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.fill}>
        <Pressable accessibilityLabel="close" style={[styles.backdrop, { backgroundColor: withAlpha(th.colors.overlay, 0.45) }]} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: th.colors.popover,
              borderWidth: 1,
              borderBottomWidth: 0,
              borderColor: th.colors.border,
              boxShadow: "0 -20px 48px -24px rgba(0,0,0,0.35)",
              borderTopLeftRadius: th.radius.lg,
              borderTopRightRadius: th.radius.lg,
              paddingBottom: insets.bottom + 16,
              maxHeight,
            },
          ]}
        >
          <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: th.colors.border, marginTop: -6, marginBottom: 12 }} />
          {title ? <Text accessibilityRole="header" style={{ color: th.colors.popoverForeground, fontFamily: th.font.display, fontSize: 20, marginBottom: 12 }}>{title}</Text> : null}
          {body}
        </View>
      </KeyboardAvoidingView>
      {open ? <ToastHost /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "flex-end" },
  backdrop: { flex: 1 },
  sheet: { padding: 24 },
});
