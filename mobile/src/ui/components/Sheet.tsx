import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../ThemeProvider";

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
      <Pressable accessibilityLabel="close" style={styles.backdrop} onPress={onClose} />
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
        {title ? <Text style={{ color: th.colors.popoverForeground, fontFamily: th.font.medium, fontSize: 17, marginBottom: 12 }}>{title}</Text> : null}
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { padding: 16 },
});
