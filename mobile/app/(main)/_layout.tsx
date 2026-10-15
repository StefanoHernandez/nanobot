import { View } from "react-native";
import { Drawer } from "expo-router/drawer";
import { ChatDrawer } from "../../src/screens/chats/ChatDrawer";
import { OfflineBanner } from "../../src/extras/OfflineBanner";
import { SharePickerSheet } from "../../src/extras/SharePickerSheet";
import { useTheme } from "../../src/ui/ThemeProvider";
import { ApprovalCard } from "../../src/extras/ApprovalCard";
import { useApprovalsPolling } from "../../src/extras/approvals";

export default function MainLayout() {
  const { colors, font } = useTheme();
  useApprovalsPolling();
  // Banner above the drawer: visible on Home and in threads (a thread has its own header; both sit below it).
  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <SharePickerSheet />
      <ApprovalCard />
      <Drawer
        drawerContent={(p) => <ChatDrawer onClose={() => p.navigation.closeDrawer()} />}
        screenOptions={{
          swipeEnabled: true,
          swipeEdgeWidth: 40,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerTitleStyle: { fontFamily: font.display, fontSize: 20 },
          headerShadowVisible: false,
          drawerStyle: { backgroundColor: colors.background },
        }}
      >
        <Drawer.Screen name="index" options={{ title: "nanobot" }} />
        <Drawer.Screen name="chat/[key]" options={{ headerShown: false }} />
      </Drawer>
    </View>
  );
}
