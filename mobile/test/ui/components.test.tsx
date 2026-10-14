import React from "react";
import { StyleSheet } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { Button, Dialog, IconButton } from "../../src/ui/components";

const wrap = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

test("IconButton hit area >= 48dp", async () => {
  await wrap(<IconButton icon="send" onPress={() => {}} accessibilityLabel="send" />);
  const style = StyleSheet.flatten(screen.getByLabelText("send").props.style);
  expect(style.minHeight).toBeGreaterThanOrEqual(48);
  expect(style.minWidth).toBeGreaterThanOrEqual(48);
});

test("Dialog confirm/cancel", async () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  await wrap(<Dialog open title="T" confirmLabel="Yes" cancelLabel="No" onConfirm={onConfirm} onCancel={onCancel} />);
  await fireEvent.press(screen.getByText("Yes"));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByText("No"));
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test("Button loading ignores press", async () => {
  const onPress = jest.fn();
  await wrap(<Button title="Go" onPress={onPress} loading />);
  await fireEvent.press(screen.getByRole("button"));
  expect(onPress).not.toHaveBeenCalled();
});
