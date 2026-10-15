import React, { useEffect, useState } from "react";
import { Modal, Text, View } from "react-native";
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
  const [paste, setPaste] = useState("");

  useEffect(() => {
    if (!open) setPaste("");
  }, [open]);

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, minHeight: 48 }}>
          <IconButton icon="close" accessibilityLabel={t("common.close")} onPress={onClose} />
          <Text style={{ flex: 1, color: th.colors.foreground, fontFamily: th.font.display, fontSize: 18 }}>{t("connect.scan")}</Text>
        </View>
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
          <Button title={t("connect.scan")} loading={loading} onPress={() => !loading && onPayload(paste.trim())} />
        </View>
      </View>
    </Modal>
  );
}

export function toastInvalidScan(t: (k: string) => string) {
  toast.show(t("connect.scanFailed"));
}
