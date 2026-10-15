import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "../../i18n";
import { Button, IconButton, TextField, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";

export type PairScanModalProps = {
  open: boolean;
  onClose: () => void;
  onPayload: (raw: string) => void;
  loading: boolean;
};

export function PairScanModal({ open, onClose, onPayload, loading }: PairScanModalProps) {
  const t = useT();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [paste, setPaste] = useState("");
  const lastCamera = useRef<string | null>(null);
  const usePaste = permission?.granted === false;

  useEffect(() => {
    if (!open) {
      setPaste("");
      lastCamera.current = null;
      return;
    }
    if (!permission?.granted) void requestPermission();
  }, [open, permission?.granted, requestPermission]);

  const tryRaw = (raw: string, fromCamera = false) => {
    if (loading) return;
    if (fromCamera) {
      if (lastCamera.current === raw) return;
      lastCamera.current = raw;
    }
    onPayload(raw);
  };

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, minHeight: 48 }}>
          <IconButton icon="close" accessibilityLabel={t("common.close")} onPress={onClose} />
          <Text style={{ flex: 1, color: th.colors.foreground, fontFamily: th.font.display, fontSize: 18 }}>{t("connect.scan")}</Text>
        </View>
        {usePaste ? (
          <View style={{ flex: 1, padding: 16, gap: 12 }}>
            <TextField
              label={t("connect.pasteCode")}
              value={paste}
              onChangeText={setPaste}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
            <Button title={t("connect.scan")} loading={loading} onPress={() => tryRaw(paste.trim())} />
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {permission?.granted ? (
              <CameraView
                style={{ flex: 1 }}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={({ data }) => tryRaw(data, true)}
              />
            ) : (
              <Pressable style={{ flex: 1, justifyContent: "center", padding: 24 }} onPress={() => void requestPermission()}>
                <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 16, textAlign: "center" }}>
                  {t("connect.pasteCode")}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

export function toastInvalidScan(t: (k: string) => string) {
  toast.show(t("connect.scanFailed"));
}
