import React, { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, StyleSheet, Text, View } from "react-native";
import { useT } from "../../../i18n";
import { Button, Sheet, TextField } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { useMcpOAuth } from "../../../ecosystem/mcp";

export function McpOAuthSheet({
  open,
  presetName,
  onClose,
  onDone,
}: {
  open: boolean;
  presetName: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const t = useT();
  const th = useTheme();
  const oauth = useMcpOAuth(presetName, onDone);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [starting, setStarting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const submittingRef = useRef(false);

  React.useEffect(() => {
    if (oauth.state === "done") {
      onDone?.();
      onClose();
    }
  }, [oauth.state, onDone, onClose]);

  if (!open) return null;

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await oauth.start();
    } finally {
      setStarting(false);
    }
  };

  const handleOpenAuth = () => {
    if (oauth.authUrl) {
      void Linking.openURL(oauth.authUrl);
    }
  };

  const handleSubmit = async () => {
    const trimmed = callbackUrl.trim();
    if (!trimmed || submittingRef.current || submitted) return;
    submittingRef.current = true;
    setSubmitted(true);
    try {
      await oauth.submit(trimmed);
      setCallbackUrl("");
    } finally {
      submittingRef.current = false;
    }
  };

  const handleCancel = async () => {
    await oauth.cancel();
    setCallbackUrl("");
    setSubmitted(false);
    onClose();
  };

  return (
    <Sheet open={open} title={t("mcp.oauth")} onClose={handleCancel}>
      <KeyboardAvoidingView behavior="padding">
        <View style={styles.content}>
          {oauth.state === "idle" && !oauth.authUrl ? (
            <Button
              title={t("mcp.startAuth")}
              variant="primary"
              loading={starting}
              onPress={() => void handleStart()}
            />
          ) : null}

          {oauth.authUrl ? (
            <Button
              title={t("mcp.authorize")}
              variant="primary"
              onPress={handleOpenAuth}
            />
          ) : null}

          {oauth.state === "polling" ? (
            <View style={styles.pollingRow}>
              <ActivityIndicator color={th.colors.primary} />
              <Text style={[styles.stateText, { color: th.colors.mutedForeground }]}>
                {t("mcp.polling")}
              </Text>
            </View>
          ) : null}

          {oauth.completionInput === "callback_url" ? (
            <View style={styles.inputSection}>
              <TextField
                label={t("mcp.callbackUrl")}
                value={callbackUrl}
                onChangeText={setCallbackUrl}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!submitted && oauth.state !== "polling"}
              />
              <Button
                title={t("mcp.submit")}
                variant="primary"
                disabled={!callbackUrl.trim() || oauth.state === "polling" || submitted}
                onPress={() => void handleSubmit()}
              />
            </View>
          ) : null}

          {oauth.error ? (
            <Text style={[styles.errorText, { color: th.colors.destructive }]}>
              {t("mcp.oauthError")}
            </Text>
          ) : null}

          <Button
            title={t("mcp.cancel")}
            variant="ghost"
            onPress={() => void handleCancel()}
          />
        </View>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: 12,
    gap: 12,
  },
  pollingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 4,
  },
  stateText: {
    fontSize: 14,
  },
  inputSection: {
    gap: 8,
  },
  errorText: {
    fontSize: 14,
  },
});
