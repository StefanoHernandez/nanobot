import "../src/platform/install";

import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LockGate } from "../src/extras/lock";
import { SessionProvider } from "../src/state/SessionProvider";
import { ThemeProvider } from "../src/ui/ThemeProvider";
import { ToastHost } from "../src/ui/components";
import { NativeIntegrations } from "./NativeIntegrations";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <SessionProvider>
            <NativeIntegrations />
            <LockGate>
              <Stack screenOptions={{ headerShown: false }} />
            </LockGate>
          </SessionProvider>
          <ToastHost />
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
