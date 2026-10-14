import { Text, View } from "react-native";
import { useStartChat } from "../../src/screens/chats/ChatDrawer";
import { useT } from "../../src/i18n";
import { useSession } from "../../src/state/sessionStore";
import { BotFace } from "../../src/ui/BotFace";
import { useTheme } from "../../src/ui/ThemeProvider";
import { Button } from "../../src/ui/components";

export default function Home() {
  const t = useT();
  const th = useTheme();
  const start = useStartChat();
  const { profile, state } = useSession();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 32, backgroundColor: th.colors.background }}>
      <BotFace state={state === "open" ? "idle" : "offline"} size={88} />
      <Text accessibilityRole="header" style={{ color: th.colors.foreground, fontFamily: th.font.display, fontSize: 28, lineHeight: 34, textAlign: "center", marginTop: 8 }}>
        {t("home.hello", { name: profile?.name ?? "nanobot" })}
      </Text>
      <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 16, lineHeight: 23, textAlign: "center", maxWidth: 300 }}>{t("chats.empty")}</Text>
      <Button title={t("chats.newChat")} onPress={() => void start(false)} />
    </View>
  );
}
