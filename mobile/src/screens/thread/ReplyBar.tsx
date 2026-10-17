import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { UIMessage } from "@/lib/types";
import { useT } from "../../i18n";
import { IconButton } from "../../ui/components/IconButton";
import { useTheme } from "../../ui/ThemeProvider";

export function ReplyBar({
  message,
  onDismiss,
}: {
  message: UIMessage;
  onDismiss: () => void;
}) {
  const t = useT();
  const th = useTheme();

  const raw = (message.content || "").replace(/\r?\n/g, " ");
  const preview = raw.length > 120 ? raw.slice(0, 120) + "…" : raw;
  const senderLabel =
    message.role === "user"
      ? t("thread.reply.you", { defaultValue: "Tu" })
      : t("thread.reply.assistant", { defaultValue: "Nanobot" });

  return (
    <View
      testID="reply-bar"
      style={[
        styles.bar,
        {
          backgroundColor: th.colors.muted,
          borderLeftColor: th.colors.brand,
          borderRadius: th.radius.md,
        },
      ]}
    >
      <MaterialCommunityIcons
        name="reply"
        size={18}
        color={th.colors.brand}
        style={{ marginRight: 8 }}
      />
      <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 11,
            fontFamily: th.font.medium,
            color: th.colors.brand,
            marginBottom: 2,
          }}
        >
          {senderLabel}
        </Text>
        <Text
          numberOfLines={2}
          style={{
            fontSize: 13,
            fontFamily: th.font.regular,
            color: th.colors.foreground,
            lineHeight: 18,
          }}
        >
          {preview}
        </Text>
      </View>
      <IconButton
        icon="close"
        testID="reply-bar-close"
        accessibilityLabel={t("thread.reply.dismiss", { defaultValue: "Annulla risposta" })}
        onPress={onDismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
  },
});
