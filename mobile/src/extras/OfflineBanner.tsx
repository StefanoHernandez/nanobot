import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "../i18n";
import { useSession } from "../state/sessionStore";
import { Button } from "../ui/components/Button";
import { useTheme } from "../ui/ThemeProvider";

export function OfflineBanner() {
  const t = useT();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const { session, state } = useSession();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (state === "reconnecting" || state === "offline") {
      timer = setTimeout(() => {
        setVisible(true);
      }, 3000);
    } else {
      setVisible(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [state]);

  if (!visible) return null;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: th.colors.destructive,
          paddingTop: insets.top + 8, // sits at the very top of the screen, above the headers
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: th.colors.destructiveForeground,
            fontFamily: th.font.medium,
          },
        ]}
      >
        {t("extras.offlineBanner")}
      </Text>
      <Button
        title={t("common.retry")}
        variant="secondary"
        onPress={() => session?.resume()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  text: {
    flex: 1,
    fontSize: 13,
  },
});
