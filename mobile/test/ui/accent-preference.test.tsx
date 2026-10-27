import React from "react";
import { Pressable, Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { kv } from "../../src/platform/storage";
import { ThemeProvider, useAccentPreference, useTheme } from "../../src/ui/ThemeProvider";

function Probe() {
  const [, setAccent] = useAccentPreference();
  const th = useTheme();
  const accent = useAccentPreference()[0];
  return (
    <>
      <Text testID="primary">{th.colors.primary}</Text>
      <Text testID="accent-id">{accent}</Text>
      <Pressable accessibilityRole="button" onPress={() => setAccent("green")}>
        <Text>pick-green</Text>
      </Pressable>
    </>
  );
}

beforeEach(() => {
  kv.del("ui.accent");
  kv.set("ui.theme", "light");
});

test("default accent is violet", async () => {
  await render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(screen.getByTestId("accent-id").props.children).toBe("violet");
  expect(screen.getByTestId("primary").props.children).toBe("#7C3AED");
});

test("picking an accent stores it and updates primary", async () => {
  await render(<ThemeProvider><Probe /></ThemeProvider>);
  await fireEvent.press(screen.getByText("pick-green"));
  expect(kv.get("ui.accent")).toBe("green");
  expect(screen.getByTestId("accent-id").props.children).toBe("green");
  expect(screen.getByTestId("primary").props.children).toBe("#137538");
});

test("unknown stored accent falls back to violet", async () => {
  kv.set("ui.accent", "not-a-color");
  await render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(screen.getByTestId("accent-id").props.children).toBe("violet");
});
