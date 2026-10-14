import { Text, View } from "react-native";
import { useStartChat } from "../../src/screens/chats/ChatDrawer";
import { useT } from "../../src/i18n";
import { useTheme } from "../../src/ui/ThemeProvider";
import { Button } from "../../src/ui/components";

export default function Home() {
  const t = useT();
  const th = useTheme();
  const start = useStartChat();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24, backgroundColor: th.colors.background }}>
      <Text style={{ color: th.colors.mutedForeground, fontSize: 16 }}>{t("chats.empty")}</Text>
      <Button title={t("chats.newChat")} onPress={() => void start(false)} />
    </View>
  );
}
