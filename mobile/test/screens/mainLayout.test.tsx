import "../../src/platform/install";
import React from "react";
import { act, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { sessionStore } from "../../src/state/sessionStore";
import { ThreadScreen } from "../../src/screens/thread/ThreadScreen";
import { fakeSession } from "../state/fake";
import MainLayout from "../../app/(main)/_layout";

jest.mock("expo-router/drawer", () => {
  const { View } = require("react-native");
  const Drawer = ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
  Drawer.Screen = () => null;
  return { Drawer };
});
jest.mock("../../src/screens/chats/ChatDrawer", () => ({ ChatDrawer: () => null }));

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <ThemeProvider>{ui}</ThemeProvider>
  </SafeAreaProvider>
);

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
  await i18n.changeLanguage("en");
  sessionStore.setState({ session: fakeSession().session, state: "offline" as never });
});
afterEach(() => jest.useRealTimers());

test("the (main) layout shows the offline banner once; the thread screen does not add a second", async () => {
  await render(wrap(<MainLayout />));
  await act(async () => { jest.advanceTimersByTime(3100); });
  expect(screen.getAllByText(i18n.t("extras.offlineBanner"))).toHaveLength(1);
});

test("ThreadScreen alone has no banner", async () => {
  await render(wrap(<ThreadScreen chatKey="telegram:1" onBack={() => {}} />));
  await act(async () => { jest.advanceTimersByTime(3100); });
  expect(screen.queryByText(i18n.t("extras.offlineBanner"))).toBeNull();
});
