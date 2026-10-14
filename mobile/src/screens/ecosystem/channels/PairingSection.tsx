import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useT } from "../../../i18n";
import { usePairing } from "../../../ecosystem/channels";
import { Button, Dialog } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import type { PairingRequestInfo } from "@/lib/types";

export function PairingSection() {
  const t = useT();
  const th = useTheme();
  const { requests, approve, deny } = usePairing();
  const [approving, setApproving] = useState<PairingRequestInfo | null>(null);

  const handleConfirmApprove = async () => {
    if (!approving) return;
    const code = approving.code;
    setApproving(null);
    await approve(code);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: th.colors.mutedForeground }]}>{t("pairing.title")}</Text>
      {requests.length === 0 ? (
        <Text style={[styles.empty, { color: th.colors.mutedForeground }]}>{t("pairing.empty")}</Text>
      ) : (
        requests.map((req) => (
          <View
            key={req.code}
            style={[styles.card, { backgroundColor: th.colors.card, borderColor: th.colors.border, borderRadius: th.radius.md }]}
          >
            <View style={styles.info}>
              <Text style={[styles.code, { color: th.colors.foreground, fontFamily: th.font.medium }]}>
                {req.code}
              </Text>
              <Text style={{ color: th.colors.mutedForeground, fontSize: 13 }}>
                {req.sender_id} • {req.channel}
              </Text>
            </View>
            <View style={styles.actions}>
              <Button
                title={t("pairing.deny")}
                variant="ghost"
                onPress={() => void deny(req.code)}
              />
              <Button
                title={t("pairing.approve")}
                variant="primary"
                onPress={() => setApproving(req)}
              />
            </View>
          </View>
        ))
      )}
      <Dialog
        open={!!approving}
        title={t("pairing.confirmTitle")}
        message={t("pairing.confirmMessage")}
        confirmLabel={t("pairing.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void handleConfirmApprove()}
        onCancel={() => setApproving(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 24, paddingHorizontal: 16 },
  title: { fontSize: 13, textTransform: "uppercase", marginBottom: 8, letterSpacing: 0.5 },
  empty: { fontSize: 14, fontStyle: "italic", marginVertical: 8 },
  card: {
    padding: 12,
    borderWidth: 1,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  info: { flex: 1 },
  code: { fontSize: 16, letterSpacing: 1 },
  actions: { flexDirection: "row", gap: 8 },
});
