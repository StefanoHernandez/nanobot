import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { BackHandler } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import ChatRoute from "../../app/(main)/chat/[key]";

const mockDispatch = jest.fn();
const mockReplace = jest.fn();
let hardwareBack: (() => boolean) | null = null;

jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args), back: jest.fn(), push: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ key: "websocket:c1" }),
  useNavigation: () => ({
    dispatch: mockDispatch,
    getState: () => ({ type: "stack" }),
    getParent: () => undefined,
  }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const ReactNs = require("react") as typeof React;
    ReactNs.useEffect(() => {
      const clean = cb();
      return () => {
        if (typeof clean === "function") clean();
      };
    }, [cb]);
  },
}));

jest.mock("../../src/screens/thread/ThreadScreen", () => ({
  ThreadScreen: ({ onBack }: { onBack: () => void }) => {
    const { Pressable, Text } = require("react-native");
    return (
      <Pressable accessibilityLabel="Back" onPress={onBack}>
        <Text>chat</Text>
      </Pressable>
    );
  },
}));

const renderRoute = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <ChatRoute />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

beforeEach(() => {
  mockDispatch.mockClear();
  mockReplace.mockClear();
  hardwareBack = null;
  jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, handler) => {
    hardwareBack = handler as () => boolean;
    return { remove: () => undefined };
  });
});

test("header back opens the chat list", async () => {
  const view = await renderRoute();
  await act(async () => {
    fireEvent.press(view.getByLabelText("Back"));
  });
  expect(mockReplace).toHaveBeenCalledWith("/");
  expect(mockDispatch).toHaveBeenCalledWith({ type: "OPEN_DRAWER" });
});

test("hardware back on a focused chat opens the drawer and consumes the event", async () => {
  await renderRoute();
  expect(hardwareBack?.()).toBe(true);
  expect(mockDispatch).toHaveBeenCalledWith({ type: "OPEN_DRAWER" });
});
