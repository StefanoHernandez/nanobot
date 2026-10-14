import React from "react";
import { KeyboardAvoidingView, Modal, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../ThemeProvider";
import { Button } from "./Button";
import { ToastHost } from "./ToastHost";

export type DialogProps = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  children?: React.ReactNode;
};

export function Dialog({ open, title, message, confirmLabel, cancelLabel, onConfirm, onCancel, destructive, children }: DialogProps) {
  const th = useTheme();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: th.colors.popover, borderRadius: th.radius.lg }]}>
          <Text style={{ color: th.colors.popoverForeground, fontFamily: th.font.medium, fontSize: 18 }}>{title}</Text>
          {message ? <Text style={{ color: th.colors.mutedForeground, fontSize: 14, marginTop: 8 }}>{message}</Text> : null}
          {children ? <View style={{ marginTop: 12 }}>{children}</View> : null}
          <View style={styles.actions}>
            {cancelLabel ? <Button title={cancelLabel} variant="ghost" onPress={onCancel} /> : null}
            <Button title={confirmLabel} variant={destructive ? "destructive" : "primary"} onPress={onConfirm} />
          </View>
        </View>
      </KeyboardAvoidingView>
      {open ? <ToastHost /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  card: { padding: 20 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 20 },
});
