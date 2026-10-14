import React, { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useT } from "../../../i18n";
import { useChannelConnect } from "../../../ecosystem/channels";
import { Button, TextField } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import type { NanobotFeatureInfo, NanobotFeaturesPayload } from "@/lib/types";

export const supportsConnect = (ch: NanobotFeatureInfo): boolean => {
  const CONNECT_CHANNELS = ["feishu", "linear", "whatsapp", "weixin", "lark"];
  return CONNECT_CHANNELS.includes(ch.name) || (ch.capabilities?.includes("connect") ?? false);
};

export function ChannelConnect({
  channel,
  instanceId,
  onFeatures,
}: {
  channel: NanobotFeatureInfo;
  instanceId?: string;
  onFeatures?: (p: NanobotFeaturesPayload) => void;
}) {
  const t = useT();
  const th = useTheme();
  const {
    state,
    error,
    verificationFailed,
    message,
    qrUrl,
    linkUrl,
    start,
    cancel,
    submitVerifyCode,
  } = useChannelConnect(channel.name, instanceId, onFeatures);

  const [verifyCode, setVerifyCode] = useState("");

  if (!supportsConnect(channel)) return null;

  return (
    <View style={[styles.container, { borderColor: th.colors.border, backgroundColor: th.colors.card, borderRadius: th.radius.md }]}>
      <Text style={[styles.title, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
        {t("channels.connect.button")}
      </Text>

      {state === "idle" && (
        <Button
          title={t("channels.connect.button")}
          onPress={() => void start()}
          variant="secondary"
        />
      )}

      {state === "waiting" && (
        <View style={styles.waitingContainer}>
          {qrUrl ? (
            // QR stays dark-on-white with a quiet zone in both themes: many scanners can't read inverted codes.
            <View style={[styles.qrWrapper, { backgroundColor: "white", borderRadius: th.radius.md, padding: 16 }]}>
              <QRCode value={qrUrl} size={180} color="black" backgroundColor="white" />
            </View>
          ) : null}

          {linkUrl ? (
            <Button
              title={t("channels.connect.openLink")}
              variant="secondary"
              onPress={() => void Linking.openURL(linkUrl)}
            />
          ) : null}

          {message ? (
            <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, textAlign: "center" }}>
              {message}
            </Text>
          ) : null}

          {channel.name === "weixin" && (
            <View style={styles.verifyContainer}>
              <TextField
                label={t("channels.connect.verifyCode")}
                value={verifyCode}
                onChangeText={setVerifyCode}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Button
                title={t("channels.connect.submitCode")}
                onPress={() => void submitVerifyCode(verifyCode)}
                disabled={!verifyCode.trim()}
              />
              {verificationFailed ? (
                <Text style={{ color: th.colors.destructive, fontFamily: th.font.regular, fontSize: 13 }}>
                  {t("channels.connect.verificationFailed")}
                </Text>
              ) : null}
            </View>
          )}

          <Button
            title={t("channels.connect.cancel")}
            variant="ghost"
            onPress={() => void cancel()}
          />
        </View>
      )}

      {state === "done" && (
        <View style={styles.statusBox}>
          <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 15 }}>
            {t("channels.connect.done")}
          </Text>
        </View>
      )}

      {state === "expired" && (
        <View style={styles.statusBox}>
          <Text style={{ color: th.colors.destructive, fontFamily: th.font.regular, fontSize: 15, marginBottom: 8 }}>
            {t("channels.connect.expired")}
          </Text>
          <Button
            title={t("channels.connect.retry")}
            variant="secondary"
            onPress={() => void start()}
          />
        </View>
      )}

      {state === "error" && (
        <View style={styles.statusBox}>
          <Text style={{ color: th.colors.destructive, fontFamily: th.font.regular, fontSize: 15, marginBottom: 8 }}>
            {t("common.operationFailed", "Operazione non riuscita")}
          </Text>
          <Button
            title={t("channels.connect.retry")}
            variant="secondary"
            onPress={() => void start()}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  title: { fontSize: 17 },
  waitingContainer: { alignItems: "center", gap: 12 },
  qrWrapper: { padding: 12, alignItems: "center", justifyContent: "center" },
  verifyContainer: { width: "100%", gap: 8, marginTop: 8 },
  statusBox: { alignItems: "center", paddingVertical: 8 },
});
